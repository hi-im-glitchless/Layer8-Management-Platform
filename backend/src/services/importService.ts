/**
 * Excel Import Service for schedule data.
 *
 * Reference format (from Alocação/alocation template.xlsx):
 * - Multiple sections per file (each section = a date range block)
 * - Row 1: header with week-start dates in columns (Monday dates, ISO format)
 * - Column A: team member names (surname or display name)
 * - Cell values: project names (text content)
 * - Cell background colors: project colors (hex, e.g. #FF0000)
 *
 * The importer reads each sheet, detects the header row with dates,
 * then iterates rows to extract member-name -> week -> project assignments.
 */
import * as XLSX from 'xlsx';
import { prisma } from '@/db/prisma.js';
import { upsertProjectColor } from '@/services/scheduleService.js';

// ── Types ────────────────────────────────────────────────────────────

export interface ParsedAssignment {
  memberName: string;
  weekStart: Date;
  projectName: string;
  projectColor: string;
}

export interface ParsedScheduleData {
  assignments: ParsedAssignment[];
  memberNames: string[];
  weekCount: number;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
}

// ── Default color palette for projects without cell colors ───────────

const DEFAULT_COLORS = [
  '#4A90D9', '#D94A4A', '#4AD97A', '#D9A04A', '#7A4AD9',
  '#D94A90', '#4AD9D9', '#90D94A', '#D9D94A', '#4A7AD9',
];

function hashStringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_COLORS[Math.abs(hash) % DEFAULT_COLORS.length];
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse a cell's fill/background color from xlsx theme/rgb data.
 * Returns hex string like "#FF0000" or null if no color.
 */
function getCellColor(cell: XLSX.CellObject | undefined): string | null {
  if (!cell?.s) return null;
  const style = cell.s as Record<string, unknown>;
  const fill = style.fill as Record<string, unknown> | undefined;
  if (!fill) return null;

  const fgColor = fill.fgColor as Record<string, unknown> | undefined;
  if (fgColor?.rgb && typeof fgColor.rgb === 'string') {
    const rgb = fgColor.rgb;
    // XLSX sometimes returns ARGB (8 chars) — strip the alpha prefix
    const hex = rgb.length === 8 ? rgb.substring(2) : rgb;
    return `#${hex}`;
  }

  return null;
}

/**
 * Try to parse a date from a cell value. Handles:
 * - ISO date strings "2026-01-05"
 * - "dd/mm/yyyy" or "d/m/yyyy" format
 * - Excel serial dates (number)
 * - Date objects
 */
function parseDateFromCell(value: unknown): Date | null {
  if (value instanceof Date) return value;

  if (typeof value === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d);
    }
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    // ISO format: 2026-01-05
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed + 'T00:00:00');
      return isNaN(d.getTime()) ? null : d;
    }

    // dd/mm/yyyy
    const dmyMatch = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
    if (dmyMatch) {
      const d = new Date(Number(dmyMatch[3]), Number(dmyMatch[2]) - 1, Number(dmyMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  return null;
}

/**
 * Check if a date is a Monday. If not, find the previous Monday.
 */
function toMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Sunday=0, Monday=1, etc.
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

// ── Parser ───────────────────────────────────────────────────────────

/**
 * Parse an Excel buffer into structured schedule data.
 * Reads all sheets. For each sheet:
 *  - Finds the header row containing dates (scans first 5 rows)
 *  - Column A (or first column) = team member names
 *  - Remaining columns = week dates
 *  - Cell text = project name, cell bg = project color
 */
export function parseExcelFile(buffer: Buffer): ParsedScheduleData {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
  const allAssignments: ParsedAssignment[] = [];
  const memberNamesSet = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

    // Find header row: scan first 10 rows for one that has dates in columns B+
    let headerRow = -1;
    const dateColumns: Map<number, Date> = new Map();

    for (let r = range.s.r; r <= Math.min(range.s.r + 9, range.e.r); r++) {
      const tempDates = new Map<number, Date>();
      let dateCount = 0;

      for (let c = range.s.c + 1; c <= range.e.c; c++) {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellAddr] as XLSX.CellObject | undefined;
        if (!cell) continue;

        const date = parseDateFromCell(cell.v);
        if (date) {
          tempDates.set(c, date);
          dateCount++;
        }
      }

      // If we found at least 3 date-like values, this is our header row
      if (dateCount >= 3) {
        headerRow = r;
        tempDates.forEach((d, c) => dateColumns.set(c, d));
        break;
      }
    }

    if (headerRow === -1 || dateColumns.size === 0) continue;

    // Parse data rows (everything below header).
    // Stop after 5 consecutive empty rows to handle sheets with inflated ranges (1M+ rows).
    let emptyStreak = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      // Get member name from first column
      const nameCell = sheet[XLSX.utils.encode_cell({ r, c: range.s.c })] as XLSX.CellObject | undefined;
      const memberName = (nameCell?.v != null && nameCell.t !== 'z') ? String(nameCell.v).trim() : '';
      if (!memberName) {
        emptyStreak++;
        if (emptyStreak >= 5) break;
        continue;
      }
      emptyStreak = 0;

      memberNamesSet.add(memberName);

      // Iterate date columns
      for (const [c, weekDate] of dateColumns) {
        const cellAddr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[cellAddr] as XLSX.CellObject | undefined;
        if (!cell || cell.v == null || cell.t === 'z') continue;

        const projectName = String(cell.v).trim();
        if (!projectName || projectName === 'undefined') continue;

        const bgColor = getCellColor(cell) || hashStringToColor(projectName);
        const monday = toMonday(weekDate);

        allAssignments.push({
          memberName,
          weekStart: monday,
          projectName,
          projectColor: bgColor,
        });
      }
    }
  }

  return {
    assignments: allAssignments,
    memberNames: Array.from(memberNamesSet),
    weekCount: new Set(allAssignments.map(a => a.weekStart.toISOString())).size,
  };
}

// ── Importer ─────────────────────────────────────────────────────────

/**
 * Import parsed schedule data into the database.
 * Matches member names to existing TeamMember records by displayName or user.displayName/username.
 * Creates assignments via upsert (same member + week = update).
 */
export async function importScheduleData(
  data: ParsedScheduleData,
  year: number,
  userId: string | null
): Promise<ImportResult> {
  const errors: ImportError[] = [];
  let imported = 0;
  let skipped = 0;

  // Build a lookup: lowercase name -> teamMemberId
  const teamMembers = await prisma.teamMember.findMany({
    where: { status: 'active' },
    include: { user: { select: { username: true, displayName: true } } },
  });

  const memberLookup = new Map<string, string>();
  for (const tm of teamMembers) {
    // Match by displayName, user.displayName, or user.username
    if (tm.displayName) {
      memberLookup.set(tm.displayName.toLowerCase(), tm.id);
    }
    if (tm.user?.displayName) {
      memberLookup.set(tm.user.displayName.toLowerCase(), tm.id);
    }
    if (tm.user?.username) {
      memberLookup.set(tm.user.username.toLowerCase(), tm.id);
    }
  }

  // Process in a transaction for atomicity
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < data.assignments.length; i++) {
      const assignment = data.assignments[i];

      // Filter by year if specified
      if (assignment.weekStart.getFullYear() !== year) {
        skipped++;
        continue;
      }

      // Resolve team member
      const teamMemberId = memberLookup.get(assignment.memberName.toLowerCase());
      if (!teamMemberId) {
        errors.push({
          row: i + 1,
          message: `Team member "${assignment.memberName}" not found in system`,
        });
        skipped++;
        continue;
      }

      try {
        // Upsert project color outside transaction (non-critical)
        await upsertProjectColor(assignment.projectName, assignment.projectColor);

        // Upsert assignment: find by (teamMemberId, weekStart)
        const existing = await tx.assignment.findUnique({
          where: {
            teamMemberId_weekStart: {
              teamMemberId,
              weekStart: assignment.weekStart,
            },
          },
        });

        if (existing) {
          // Only update if not locked
          if (existing.isLocked) {
            skipped++;
            continue;
          }

          await tx.assignment.update({
            where: { id: existing.id },
            data: {
              projectName: assignment.projectName,
              projectColor: assignment.projectColor,
              status: 'placeholder',
              createdBy: userId,
            },
          });
        } else {
          await tx.assignment.create({
            data: {
              teamMemberId,
              projectName: assignment.projectName,
              projectColor: assignment.projectColor,
              status: 'placeholder',
              weekStart: assignment.weekStart,
              createdBy: userId,
            },
          });
        }

        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ row: i + 1, message: msg });
        skipped++;
      }
    }
  });

  return { imported, skipped, errors };
}
