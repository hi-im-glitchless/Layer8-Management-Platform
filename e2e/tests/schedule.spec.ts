import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

// Schedule grid. Smoke/structural coverage; PM mutation flows (create/edit/
// swap/lock assignment, team/clients/holidays/absences, HTML export) are
// scaffolded in deferred.spec.ts.

test.describe('Schedule', () => {
  test.use({ storageState: storageStateFor('pm') });

  test('loads the schedule view', async ({ page }) => {
    await page.goto('/schedule');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
  });
});
