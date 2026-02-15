/**
 * Backfill Zone Values & Prune Dead Entries
 *
 * Run BEFORE the zone unique constraint migration:
 *   npx tsx backend/prisma/backfill-zones.ts
 *
 * Steps:
 * 1. Prune dead entries (confidence < 0.3)
 * 2. Backfill zone='unknown' entries using BlueprintPattern data + field heuristics
 * 3. Deduplicate entries that would violate the new 5-field unique constraint
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Field-based zone heuristics
// ---------------------------------------------------------------------------

/** Fields that commonly appear in header/footer/cover zones */
const HEADER_FIELDS = new Set([
  'title',
  'client.short_name',
  'client.full_name',
  'client.name',
  'report_date',
  'report.date',
  'report.title',
  'report.version',
  'team[0].name',
  'team[0].role',
  'team[0].email',
  'author',
  'author.name',
  'company.name',
  'company.logo',
  'classification',
  'document_id',
  'report.id',
  'report.classification',
  'version',
  'date',
]);

function inferZoneFromField(gwField: string): { zone: string; method: string } {
  // Exact match on known header/cover fields
  if (HEADER_FIELDS.has(gwField)) {
    return { zone: 'header', method: 'field-heuristic-header' };
  }

  // Finding-related fields -> body
  if (
    gwField.startsWith('finding') ||
    gwField.startsWith('vulnerability') ||
    gwField.startsWith('findings[') ||
    gwField.startsWith('vulnerabilities[')
  ) {
    return { zone: 'body', method: 'field-heuristic-finding' };
  }

  // Executive summary, scope, methodology -> body
  if (
    gwField.includes('executive_summary') ||
    gwField.includes('scope') ||
    gwField.includes('methodology') ||
    gwField.includes('conclusion') ||
    gwField.includes('recommendation')
  ) {
    return { zone: 'body', method: 'field-heuristic-body-section' };
  }

  // Default to body for anything unrecognized
  return { zone: 'body', method: 'default-body' };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('[backfill] Starting zone backfill and dead entry prune...');

  // Step 1: Prune dead entries (confidence < 0.3)
  const pruned = await prisma.templateMapping.deleteMany({
    where: { confidence: { lt: 0.3 } },
  });
  console.log(`[backfill] Pruned ${pruned.count} dead entries (confidence < 0.3)`);

  // Step 2: Backfill zones
  const unknownEntries = await prisma.templateMapping.findMany({
    where: { zone: 'unknown' },
  });

  if (unknownEntries.length === 0) {
    console.log('[backfill] No entries with zone=unknown, skipping backfill');
  } else {
    console.log(`[backfill] Found ${unknownEntries.length} entries with zone=unknown`);

    // Fetch all BlueprintPattern entries for zone inference
    const blueprints = await prisma.blueprintPattern.findMany();

    // Build a lookup: templateType -> gwField -> zone (from blueprint markers)
    const blueprintZoneLookup = new Map<string, Map<string, string>>();
    for (const bp of blueprints) {
      if (!blueprintZoneLookup.has(bp.templateType)) {
        blueprintZoneLookup.set(bp.templateType, new Map());
      }
      const fieldMap = blueprintZoneLookup.get(bp.templateType)!;
      try {
        const markers = JSON.parse(bp.markers) as Array<{ gwField: string; markerType: string }>;
        for (const marker of markers) {
          // First zone wins (blueprints are more specific)
          if (!fieldMap.has(marker.gwField)) {
            fieldMap.set(marker.gwField, bp.zone);
          }
        }
      } catch {
        // Skip malformed markers JSON
      }
    }

    // Backfill each unknown-zone entry
    for (const entry of unknownEntries) {
      let newZone: string;
      let method: string;

      // Try blueprint lookup first
      const fieldMap = blueprintZoneLookup.get(entry.templateType);
      if (fieldMap && fieldMap.has(entry.gwField)) {
        newZone = fieldMap.get(entry.gwField)!;
        method = 'blueprint';
      } else {
        // Fall back to field-based heuristics
        const inferred = inferZoneFromField(entry.gwField);
        newZone = inferred.zone;
        method = inferred.method;
      }

      await prisma.templateMapping.update({
        where: { id: entry.id },
        data: { zone: newZone },
      });

      console.log(
        `[backfill] Entry ${entry.id}: zone unknown -> ${newZone} (gwField: ${entry.gwField}, method: ${method})`,
      );
    }
  }

  // Step 3: Handle potential duplicates after backfill
  // Group by the new 5-field unique key and find duplicates
  const allEntries = await prisma.templateMapping.findMany({
    orderBy: { usageCount: 'desc' },
  });

  const seen = new Map<string, string>(); // compositeKey -> id (keep first = highest usageCount)
  const toDelete: string[] = [];

  for (const entry of allEntries) {
    const key = `${entry.templateType}::${entry.language}::${entry.normalizedSectionText}::${entry.gwField}::${entry.zone}`;
    if (seen.has(key)) {
      toDelete.push(entry.id);
    } else {
      seen.set(key, entry.id);
    }
  }

  if (toDelete.length > 0) {
    await prisma.templateMapping.deleteMany({
      where: { id: { in: toDelete } },
    });
    console.log(`[backfill] Removed ${toDelete.length} duplicate entries after zone assignment`);
  } else {
    console.log('[backfill] No duplicate entries found after zone assignment');
  }

  console.log('[backfill] Done.');
}

main()
  .catch((err) => {
    console.error('[backfill] Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
