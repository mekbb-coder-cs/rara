import { test, expect } from '@playwright/test';

test.describe('Admin Priority Tuning & Dynamic Triage Reordering E2E', () => {
  test('admin tunes severity priority weight in /admin and sees triage queue reordered in /responder', async ({
    page,
  }) => {
    // Initial system configuration
    let currentWeights = {
      weightSeverity: 2.0,
      weightPeople: 5.0,
      weightVulnerability: 3.0,
      weightWaitingTime: 2.0,
    };

    // Report A: High Severity, Low People
    const reportSeverityDominated = {
      id: 'rep-severity-1',
      trackingCode: 'RL-SHIRE-101',
      title: 'Critical Bridge Structural Collapse in Shire',
      description: 'Severe structural collapse posing immediate danger.',
      hazardType: 'STRUCTURAL_COLLAPSE',
      status: 'SUBMITTED',
      severity: 'CRITICAL',
      approximateLocation: 'Shire Central',
      latitude: 14.1333,
      longitude: 38.2833,
      peopleAffectedCount: 5,
      vulnerableGroups: [],
      corroborationCount: 1,
      priorityScore: 55.0, // Initial score lower than Report B
      version: 1,
      createdAt: new Date().toISOString(),
    };

    // Report B: Low Severity, High Population Affected
    const reportPopulationDominated = {
      id: 'rep-population-2',
      trackingCode: 'RL-MEKELLE-202',
      title: 'Mekelle Water Distribution Disruption',
      description: 'Clean water shortage affecting 300 residents.',
      hazardType: 'FLOOD',
      status: 'SUBMITTED',
      severity: 'LOW',
      approximateLocation: 'Mekelle Ayder',
      latitude: 13.4967,
      longitude: 39.4753,
      peopleAffectedCount: 300,
      vulnerableGroups: ['children', 'elderly'],
      corroborationCount: 4,
      priorityScore: 82.0, // Initial score higher than Report A
      version: 1,
      createdAt: new Date().toISOString(),
    };

    // State of triage queue based on current weights
    const getTriageQueue = () => {
      // If severity weight is high (>= 6.0), Report A jumps ahead of Report B
      if (currentWeights.weightSeverity >= 6.0) {
        return [
          { ...reportSeverityDominated, priorityScore: 92.5 },
          { ...reportPopulationDominated, priorityScore: 84.0 },
        ];
      }
      return [
        { ...reportPopulationDominated, priorityScore: 82.0 },
        { ...reportSeverityDominated, priorityScore: 55.0 },
      ];
    };

    // 1. Mock Admin & Settings Endpoints
    await page.route('**/api/v1/admin/config', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            priorityWeights: currentWeights,
            duplicateClustering: { radiusMeters: 500, timeWindowMinutes: 60, textSimilarityThreshold: 0.65 },
            escalationThresholds: { defaultUnverifiedMinutes: 30, defaultUnmatchedMinutes: 60 },
            featureFlags: { enableVolunteerTracking: true, enableSmsAlerts: true },
            dataRetention: { retentionDays: 30, autoAnonymizeEnabled: true },
          },
        }),
      });
    });

    await page.route('**/api/v1/admin/config/priority-weights', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = JSON.parse(route.request().postData() || '{}');
        currentWeights = { ...currentWeights, ...body };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: currentWeights,
          }),
        });
      } else {
        await route.fallback();
      }
    });

    await page.route('**/api/v1/admin/users', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'usr-admin-1',
              email: 'admin@tigray-crisis.org',
              fullName: 'Haftom Gebremichael',
              role: 'ADMIN',
              isVerifiedResponder: true,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/admin/audit-logs*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'audit-1',
              userId: 'usr-admin-1',
              userName: 'Haftom Gebremichael',
              userRole: 'ADMIN',
              action: 'SETTINGS_UPDATE',
              entityName: 'PriorityWeights',
              entityId: 'settings-global',
              timestamp: new Date().toISOString(),
              metadata: { before: { weightSeverity: 2.0 }, after: { weightSeverity: 7.0 } },
            },
          ],
        }),
      });
    });

    // 2. Mock Triage Queue Endpoint
    await page.route('**/api/v1/reports/triage*', async (route) => {
      const reports = getTriageQueue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: reports,
          total: reports.length,
        }),
      });
    });

    // Mock other incidental API calls
    await page.route('**/api/v1/regions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [{ id: 'reg-tigray', name: 'Tigray Region', activeCrisisMode: true }],
        }),
      });
    });

    await page.route('**/api/v1/coordination/broadcasts*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });

    // Step A: Responder views triage queue before weight change
    await page.goto('/responder');
    await expect(page.locator('text=Mekelle Water Distribution Disruption')).toBeVisible({ timeout: 10000 });
    
    // Initially, Report B (Mekelle Water) is the first item in the triage list
    const reportItemsBefore = page.locator('.space-y-4 > div, [data-testid="triage-card"], .rounded-2xl.border');
    const firstReportTitleBefore = await page.locator('text=Mekelle Water Distribution Disruption').first();
    await expect(firstReportTitleBefore).toBeVisible();

    // Step B: Admin navigates to /admin
    await page.goto('/admin');
    await expect(page.locator('text=Admin & Governance Control Center')).toBeVisible({ timeout: 10000 });

    // Verify current priority formula tab
    await expect(page.locator('text=Crisis Triage Priority Formula')).toBeVisible();

    // Adjust Severity Multiplier slider
    const severityInput = page.locator('#weightSeverity');
    await expect(severityInput).toBeVisible();
    await severityInput.fill('7.0');

    // Click Save Priority Weights button
    const saveBtn = page.locator('#save-priority-weights-btn');
    await saveBtn.click();

    // Verify success banner appears
    await expect(
      page.locator('text=Priority weights updated & audit logged successfully!')
    ).toBeVisible({ timeout: 5000 });

    // Step C: Return to /responder to verify dynamic re-ordering
    await page.goto('/responder');

    // With severity weight boosted to 7.0, the Critical Shire report now outranks Mekelle Water
    // Verify both are visible
    await expect(page.locator('text=Critical Bridge Structural Collapse in Shire')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Mekelle Water Distribution Disruption')).toBeVisible();

    // Verify the Shire bridge collapse is now listed first
    const headings = page.locator('h3, h4, .font-bold');
    const allText = await page.textContent('body');
    const shireIndex = allText?.indexOf('Critical Bridge Structural Collapse in Shire') ?? -1;
    const mekelleIndex = allText?.indexOf('Mekelle Water Distribution Disruption') ?? -1;

    expect(shireIndex).toBeGreaterThan(-1);
    expect(mekelleIndex).toBeGreaterThan(-1);
    expect(shireIndex).toBeLessThan(mekelleIndex);
  });
});
