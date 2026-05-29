import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

// The Planner (Kanban) board. These are structural/core-flow checks that do
// not depend on seeded card data; card-level interactions (drag-drop, modal,
// comments, files) are scaffolded in deferred.spec.ts.

test.describe('Planner board', () => {
  test.use({ storageState: storageStateFor('pm') });

  test('loads the board with all visible stage columns', async ({ page }) => {
    await page.goto('/board');
    await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();

    // STAGE_LABELS for the five displayed stages (archived is toggle-only).
    for (const label of ['Upcoming', 'Next Week', 'Execution', 'Closing', 'Done']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('exposes the my/all projects filter toggle', async ({ page }) => {
    await page.goto('/board');
    await expect(page.getByRole('heading', { name: 'Planner' })).toBeVisible();
    // BoardFilters renders "My Projects" / "All Projects" toggle buttons.
    await expect(page.getByRole('button', { name: 'My Projects' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Projects' })).toBeVisible();
  });
});
