-- Promote any existing MANAGER users to ADMIN before removing the role.
-- SQLite stores Prisma enums as TEXT, so no schema change is needed —
-- only the data must be migrated.  This UPDATE is a safe no-op when
-- no MANAGER users exist.
UPDATE "User" SET "role" = 'ADMIN' WHERE "role" = 'MANAGER';
