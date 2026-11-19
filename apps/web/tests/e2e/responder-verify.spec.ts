import { test, expect } from '@playwright/test';

test.describe('Responder Triage and Verification E2E Flow', () => {
  test('responder inspects case queue, reveals audited PII, and verifies report', async ({
    page,
  }) => {
    const mockReport = {
      id: 'rep-e2e-triage-1',
      trackingCode: 'RL-5522-FL',
      title: 'Biscayne Bay Storm Surge Flood',
      description: 'Rising water trapping 6 people in single family home.',
      hazardType: 'FLOOD',
      status: 'SUBMITTED',
      severity: 'LIFE_THREATENING',
      approximateLocation: 'Brickell Avenue, Miami',
      latitude: 25.7617,
      longitude: -80.1918,
      peopleAffectedCount: 6,
      vulnerableGroups: ['elderly', 'children'],
      corroborationCount: 2,
      priorityScore: 89.2,
      priorityBreakdown: {
        severityScore: 35,
        peopleFactor: 18,
        vulnerabilityScore: 20,
        timeFactor: 8,
        baseSum: 81,
        hazardMultiplier: 1.1,
        confidenceMultiplier: 1.0,
        compositeScore: 89.2,
      },
      version: 1,
      assignedResponderId: null,
      lockedById: null,
      lockedAt: null,
      verificationStatus: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
    };

    // 1. Mock API endpoints for hermetic E2E execution
    await page.route('**/api/v1/reports/triage*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [mockReport],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/reports/${mockReport.id}/reveal-sensitive`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            exactAddress: '1420 Brickell Bay Dr, Apt 902, Miami FL 33131',
            reporterPhone: '+13055557788',
            reporterName: 'Carlos Hernandez',
          },
        }),
      });
    });

    await page.route(`**/api/v1/reports/${mockReport.id}/verify`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Report successfully verified.',
          data: {
            reportId: mockReport.id,
            status: 'VERIFIED',
            version: 2,
            priorityScore: 92.0,
          },
        }),
      });
    });

    // 2. Navigate to responder console
    await page.goto('/responder');

    // 3. Verify console header and case card
    await expect(page.getByRole('heading', { name: /Responder Triage Console/i })).toBeVisible();
    await expect(page.getByText('RL-5522-FL')).toBeVisible();
    await expect(page.getByText('Biscayne Bay Storm Surge Flood')).toBeVisible();
    await expect(page.getByText('P89.2')).toBeVisible();

    // 4. Click case card to open verification drawer
    await page.getByText('Biscayne Bay Storm Surge Flood').click();

    // 5. Drawer is open: check details & PII protection
    await expect(
      page.getByRole('heading', { level: 2, name: 'Biscayne Bay Storm Surge Flood' })
    ).toBeVisible();
    await expect(page.getByText(/Sensitive PII/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Reveal Contact Details \(Audited\)/i })
    ).toBeVisible();

    // 6. Click Reveal Contact Details (Audited)
    await page.getByRole('button', { name: /Reveal Contact Details \(Audited\)/i }).click();

    // 7. Check unmasked PII
    await expect(page.getByText('1420 Brickell Bay Dr, Apt 902, Miami FL 33131')).toBeVisible();
    await expect(page.getByText('+13055557788')).toBeVisible();
    await expect(page.getByText('Carlos Hernandez')).toBeVisible();

    // 8. Fill in verification form
    const reasonInput = page.getByPlaceholder(/State how verification was achieved/i);
    await reasonInput.fill('Spoke directly with Carlos via cell; verified 6 persons stranded on balcony.');

    // 9. Submit verification
    await page.getByRole('button', { name: /Confirm Verification/i }).click();

    // 10. Confirm success feedback
    await expect(page.getByText(/Case successfully marked as VERIFIED!/i)).toBeVisible();
  });
});
