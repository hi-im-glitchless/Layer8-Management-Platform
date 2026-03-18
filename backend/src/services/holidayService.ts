import { prisma } from '@/db/prisma.js';

/**
 * List all holidays ordered by month and day.
 */
export async function listHolidays() {
  return prisma.holiday.findMany({
    orderBy: [{ month: 'asc' }, { day: 'asc' }],
  });
}

/**
 * Create a holiday with month/day validation.
 */
export async function createHoliday(data: {
  name: string;
  month: number;
  day: number;
  isRecurring?: boolean;
}) {
  if (data.month < 1 || data.month > 12) {
    throw new Error('Month must be between 1 and 12');
  }
  if (data.day < 1 || data.day > 31) {
    throw new Error('Day must be between 1 and 31');
  }

  return prisma.holiday.create({
    data: {
      name: data.name,
      month: data.month,
      day: data.day,
      isRecurring: data.isRecurring ?? true,
    },
  });
}

/**
 * Update a holiday's fields.
 */
export async function updateHoliday(
  id: string,
  data: { name?: string; month?: number; day?: number; isRecurring?: boolean }
) {
  if (data.month !== undefined && (data.month < 1 || data.month > 12)) {
    throw new Error('Month must be between 1 and 12');
  }
  if (data.day !== undefined && (data.day < 1 || data.day > 31)) {
    throw new Error('Day must be between 1 and 31');
  }

  return prisma.holiday.update({
    where: { id },
    data,
  });
}

/**
 * Delete a holiday by ID.
 */
export async function deleteHoliday(id: string) {
  return prisma.holiday.delete({ where: { id } });
}

/**
 * Expand recurring holidays to actual Date objects for a given year.
 * Returns an array of { name, date } for all recurring holidays.
 */
export async function getHolidaysForYear(year: number): Promise<Array<{ name: string; date: Date }>> {
  const holidays = await prisma.holiday.findMany({
    where: { isRecurring: true },
    orderBy: [{ month: 'asc' }, { day: 'asc' }],
  });

  return holidays.map((h) => ({
    name: h.name,
    date: new Date(year, h.month - 1, h.day),
  }));
}
