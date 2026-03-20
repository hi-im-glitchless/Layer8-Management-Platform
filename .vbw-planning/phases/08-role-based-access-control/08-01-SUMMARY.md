---
phase: "08"
plan: "08-01"
title: "Database Schema Migration & Seed Update"
status: complete
commits:
  - 1f0e054 feat(08-01): add Role enum and replace isAdmin in Prisma schema
  - 9c769e7 feat(08-01): generate and apply RBAC migration
  - af52e13 feat(08-01): update seed script to use role field
deviations:
  - Migration drift from TemplateMappingSnapshot required consolidating into single init migration
---
## What Was Built
- Role enum (NORMAL, PM, MANAGER, ADMIN) added to Prisma schema
- isAdmin Boolean replaced with role Role field on User model
- Consolidated init migration applied with role field
- Seed script updated to create admin with role: 'ADMIN'

## Files Modified
- backend/prisma/schema.prisma — Role enum, isAdmin→role
- backend/prisma/migrations/20260218155719_init_with_rbac/migration.sql — consolidated init
- backend/src/scripts/seed-admin.ts — isAdmin: true → role: 'ADMIN'
