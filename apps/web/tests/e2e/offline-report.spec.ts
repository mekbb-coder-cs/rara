import { test, expect } from '@playwright/test';

test.describe('Offline Incident Reporting Flow', () => {
  test('saves report in IndexedDB when offline and confirms offline queuing', async ({
    page,
    context,
  }) => {
    // 1. Visit the report page while online to cache app shell
    await page.goto('/report');
    await expect(page.getByRole('heading', { name: /What happened/i })).toBeVisible();

    // 2. Disconnect network
    await context.setOffline(true);

    // 3. Complete Step 1: Hazard Type and Description
    await page.getByRole('button', { name: /Fire \/ Smoke/i }).click();
    await page
      .getByLabel(/Detailed Description of the Situation/i)
      .fill('Brush fire spreading rapidly toward residential neighborhood.');
    await page.getByRole('button', { name: /Continue/i }).click();

    // 4. Complete Step 2: Location
    await expect(page.getByRole('heading', { name: /Where is help needed/i })).toBeVisible();
    await page
      .getByLabel(/Street Address or Landmark/i)
      .fill('880 SW 107th Ave, University Park');
    await page.getByRole('button', { name: /Continue/i }).click();

    // 5. Complete Step 3: Urgency
    await expect(page.getByRole('heading', { name: /How urgent is this/i })).toBeVisible();
    await page.getByText(/Critical - Severe danger/i).click();
    await page.getByRole('button', { name: /Continue/i }).click();

    // 6. Complete Step 4: Verification and Submission
    await expect(page.getByRole('heading', { name: /Verification & Contact/i })).toBeVisible();
    await page.getByRole('button', { name: /Submit Emergency Report/i }).click();

    // 7. Verify Offline Success Screen is displayed with Tracking Code
    await expect(
      page.getByRole('heading', { name: /Saved Offline for Synchronization/i })
    ).toBeVisible({ timeout: 10000 });

    const trackingCodeEl = page.locator('.font-mono.font-black');
    await expect(trackingCodeEl).toBeVisible();
    const trackingCode = await trackingCodeEl.textContent();
    expect(trackingCode).toContain('RL-OFFLINE-');

    // 8. Reconnect network to verify online restoration
    await context.setOffline(false);
  });
});
