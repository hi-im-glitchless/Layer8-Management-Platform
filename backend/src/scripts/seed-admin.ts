/**
 * Seed script to create an admin user for testing
 * Usage: npm run seed
 */

import { prisma } from '../db/prisma.js';
import { hashPassword } from '../services/auth.js';

async function main() {
  console.log('🌱 Seeding database...');

  const username = 'admin';
  const password = 'Admin123!'; // User will be prompted to change on first login

  // Check if admin user already exists
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUser) {
    console.log(`✅ Admin user '${username}' already exists`);
    console.log('   Password: Admin123!');
    console.log('   Note: User will be prompted to set password and enable MFA on first login');
    return;
  }

  // Create admin user
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      isAdmin: true,
      mustResetPassword: true, // Force password change on first login
      totpEnabled: false, // Will be set up during onboarding
    },
  });

  console.log(`✅ Created admin user: ${user.username}`);
  console.log('   Username: admin');
  console.log('   Password: Admin123!');
  console.log('   Note: User will be prompted to set password and enable MFA on first login');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
