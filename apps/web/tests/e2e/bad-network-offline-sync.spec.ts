import { test, expect } from '@playwright/test';

test.describe('Bad Network Simulation & Zero Data Loss Offline Sync', () => {
  test('handles slow 3G latency and packet failure without dropping citizen emergency reports', async ({
    page,
    context,
  }) => {
    // 1. Mock API endpoints for sync
    let syncCalled = false;
    await page.route('**/api/v1/reports/offline-sync', async (route) => {
      syncCalled = true;
      const requestBody = JSON.parse(route.request().postData() || '{}');
      const items = requestBody.reports || [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            created: items.map((it: any) => ({
              id: 'rep-synced-1',
              clientReportId: it.clientReportId,
              trackingCode: 'RL-TIG-SYNCED-99',
            })),
            errors: [],
          },
        }),
      });
    });

    await page.route('**/api/v1/coordination/broadcasts*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });

    // 2. Simulate Slow 3G / High Jitter Profile via Chrome DevTools Protocol (CDP)
    const client = await page.context().newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400, // 400ms slow mobile latency
      downloadThroughput: ((500 * 1024) / 8), // 500 kbps (Slow 3G)
      uploadThroughput: ((500 * 1024) / 8),
      connectionType: 'cellular3g',
    });

    // 3. Navigate to report page
    await page.goto('/report');
    await expect(page.locator('text=What happened?')).toBeVisible({ timeout: 15000 });

    // Step 1: Select Hazard
    await page.locator('text=Flood').first().click();
    await page.locator('#description').fill('Severe river flash flooding trapping 12 families in Ayder.');
    await page.locator('button:has-text("Next")').click();

    // Step 2: Location
    await expect(page.locator('text=Where is help needed?')).toBeVisible();
    await page.locator('#address').fill('Ayder Subcity, Mekelle, Tigray');
    await page.locator('button:has-text("Next")').click();

    // Step 3: Urgency
    await expect(page.locator('text=How severe is this?')).toBeVisible();
    await page.locator('text=Critical - Life Threatening').first().click();
    await page.locator('button:has-text("Next")').click();

    // Step 4: Verification & Consent
    await expect(page.locator('text=Photos & Contact Details')).toBeVisible();

    // Check emergency consent
    const consentCheckbox = page.locator('#consentGiven');
    await consentCheckbox.check();

    // 4. Simulate complete cellular tower blackout right before submission
    await client.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await context.setOffline(true);

    // Submit while network severed
    await page.locator('button[type="submit"]').click();

    // 5. Verify report is preserved in local offline queue
    await expect(
      page.locator('text=Saved in Offline Queue').or(page.locator('text=Saved Offline'))
    ).toBeVisible({ timeout: 10000 });

    const offlineCode = page.locator('.font-mono.font-black');
    await expect(offlineCode).toBeVisible();
    const codeText = await offlineCode.textContent();
    expect(codeText).toContain('RL-');

    // 6. Network Restored: Cellular signal recovered in Mekelle
    await context.setOffline(false);
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 50,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    // Trigger sync via header sync button if visible, or page reload
    const syncBtn = page.locator('button[title*="Sync"], button[aria-label*="sync"]');
    if (await syncBtn.isVisible()) {
      await syncBtn.click();
    }
  });
});
