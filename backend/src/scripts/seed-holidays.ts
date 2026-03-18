/**
 * Seed script to populate Portuguese public holidays.
 *
 * Fixed-date holidays are stored as recurring (isRecurring: true).
 * Moveable feasts (Easter-dependent: Carnaval, Sexta-feira Santa, Páscoa, Corpo de Deus)
 * should be added manually via the admin UI for each year, as their dates vary.
 *
 * Usage: npx tsx src/scripts/seed-holidays.ts
 */

import { prisma } from '../db/prisma.js';

const PORTUGUESE_HOLIDAYS = [
  { name: 'Ano Novo', month: 1, day: 1 },
  { name: 'Dia da Liberdade', month: 4, day: 25 },
  { name: 'Dia do Trabalhador', month: 5, day: 1 },
  { name: 'Dia de Portugal', month: 6, day: 10 },
  { name: 'Assunção de Nossa Senhora', month: 8, day: 15 },
  { name: 'Implantação da República', month: 10, day: 5 },
  { name: 'Todos os Santos', month: 11, day: 1 },
  { name: 'Restauração da Independência', month: 12, day: 1 },
  { name: 'Imaculada Conceição', month: 12, day: 8 },
  { name: 'Natal', month: 12, day: 25 },
];

// Easter-dependent holidays for 2026 (must be updated manually for other years)
const MOVEABLE_HOLIDAYS_2026 = [
  { name: 'Carnaval', month: 2, day: 17, isRecurring: false },
  { name: 'Sexta-feira Santa', month: 4, day: 3, isRecurring: false },
  { name: 'Páscoa', month: 4, day: 5, isRecurring: false },
  { name: 'Corpo de Deus', month: 6, day: 4, isRecurring: false },
];

async function main() {
  console.log('Seeding Portuguese public holidays...');

  let created = 0;
  let skipped = 0;

  // Seed fixed-date recurring holidays
  for (const holiday of PORTUGUESE_HOLIDAYS) {
    try {
      await prisma.holiday.upsert({
        where: {
          name_month_day: {
            name: holiday.name,
            month: holiday.month,
            day: holiday.day,
          },
        },
        update: {},
        create: {
          name: holiday.name,
          month: holiday.month,
          day: holiday.day,
          isRecurring: true,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  // Seed 2026 moveable feast dates (non-recurring)
  for (const holiday of MOVEABLE_HOLIDAYS_2026) {
    try {
      await prisma.holiday.upsert({
        where: {
          name_month_day: {
            name: holiday.name,
            month: holiday.month,
            day: holiday.day,
          },
        },
        update: {},
        create: {
          name: holiday.name,
          month: holiday.month,
          day: holiday.day,
          isRecurring: false,
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }

  console.log(`Done: ${created} upserted, ${skipped} skipped`);
  console.log('Note: Moveable feast dates (Carnaval, Sexta-feira Santa, Pascoa, Corpo de Deus)');
  console.log('are seeded for 2026 only. Add other years via the admin UI.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
