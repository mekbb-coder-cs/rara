import { test, expect } from '@playwright/test';

test.describe('Aid Need to Suggested Match to Provider Accept Flow', () => {
  test('responder creates aid need, confirms suggested match, and provider accepts dispatch', async ({
    page,
  }) => {
    const mockReport = {
      id: 'rep-e2e-matching-1',
      trackingCode: 'RL-TIG-4401',
      title: 'Ayder Subcity Flash Flood Isolation',
      description: '50 displaced residents cut off from clean drinking water.',
      hazardType: 'FLOOD',
      status: 'VERIFIED',
      severity: 'HIGH',
      approximateLocation: 'Ayder Subcity, Mekelle',
      latitude: 13.4967,
      longitude: 39.4753,
      peopleAffectedCount: 50,
      vulnerableGroups: ['children', 'elderly'],
      corroborationCount: 3,
      priorityScore: 88.5,
      version: 2,
      assignedResponderId: null,
      lockedById: null,
      lockedAt: null,
      verificationStatus: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    const mockNeed = {
      id: 'need-e2e-1',
      reportId: mockReport.id,
      reportTitle: mockReport.title,
      reportTrackingCode: mockReport.trackingCode,
      aidType: 'FOOD_WATER',
      quantityRequired: 50,
      quantityFulfilled: 0,
      unit: '20L water jerrycans',
      urgency: 'URGENT',
      status: 'OPEN',
      latitude: mockReport.latitude,
      longitude: mockReport.longitude,
      isEscalated: false,
      createdAt: new Date().toISOString(),
    };

    const mockCandidate = {
      offerId: 'offer-e2e-1',
      organizationId: 'org-red-cross-tigray',
      organizationName: 'Ethiopian Red Cross Society - Tigray Branch',
      providerReliabilityScore: 0.96,
      aidType: 'FOOD_WATER',
      title: 'Mekelle Central Clean Water Supply Depot',
      capacityAvailable: 150,
      capacityTotal: 150,
      unit: '20L water jerrycans',
      latitude: 13.498,
      longitude: 39.477,
      distanceKm: 2.1,
      estimatedTravelMinutes: 18,
      compatibilityScore: 94.0,
      scoreBreakdown: {
        typeFitScore: 30,
        distanceScore: 24,
        capacityScore: 20,
        reliabilityScore: 14.5,
        urgencyMultiplier: 1.2,
        estimatedDistanceKm: 2.1,
        estimatedTravelMinutes: 18,
        compositeScore: 94.0,
        reasons: [
          'Exact resource type match: FOOD_WATER',
          'Located 2.1 km away (within 30 km service radius)',
          'Full capacity available: 150 available for 50 requested',
          'Provider historical reliability rating: 96%',
        ],
      },
    };

    // 1. Mock API Endpoints
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

    await page.route(/\/api\/v1\/aid\/needs(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [mockNeed],
          total: 1,
        }),
      });
    });

    await page.route(`**/api/v1/aid/needs/${mockNeed.id}/candidates`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            need: mockNeed,
            candidates: [mockCandidate],
            noMatchFound: false,
            candidateCount: 1,
          },
        }),
      });
    });

    await page.route('**/api/v1/aid/matches/confirm', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Match confirmed by responder. Stock has been reserved.',
          data: {
            id: 'match-e2e-1',
            needId: mockNeed.id,
            offerId: mockCandidate.offerId,
            matchedQuantity: 50,
            status: 'PENDING_PROVIDER',
          },
        }),
      });
    });

    await page.route(/\/api\/v1\/aid\/offers/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.route(/\/api\/v1\/coordination\/broadcasts/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
    });

    await page.route(/\/api\/v1\/aid\/matches\/provider-queue/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              id: 'match-e2e-1',
              needId: mockNeed.id,
              offerId: mockCandidate.offerId,
              organizationId: mockCandidate.organizationId,
              matchedQuantity: 50,
              compatibilityScore: 94.0,
              distanceMeters: 2100,
              estimatedTravelMins: 18,
              status: 'PENDING_PROVIDER',
              need: mockNeed,
              offer: {
                id: mockCandidate.offerId,
                title: mockCandidate.title,
                unit: mockCandidate.unit,
                capacityTotal: 150,
                capacityRemaining: 100,
                capacityReserved: 50,
                capacityFulfilled: 0,
                status: 'AVAILABLE',
                serviceRadiusKm: 30,
              },
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/aid/matches/match-e2e-1/respond', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Match accepted and fulfilled by aid provider.',
          data: {
            match: {
              id: 'match-e2e-1',
              status: 'ACCEPTED_BY_PROVIDER',
            },
            offer: {
              id: mockCandidate.offerId,
              capacityRemaining: 100,
              capacityReserved: 0,
              capacityFulfilled: 50,
            },
          },
        }),
      });
    });

    // 2. Open Responder Console
    await page.goto('/responder');
    await expect(page.getByText('RL-TIG-4401')).toBeVisible();

    // 3. Open Verification Modal
    await page.getByText('Ayder Subcity Flash Flood Isolation').click();

    // 4. Click Aid Matching Tab
    await page.getByRole('button', { name: /Aid Matching/i }).click();

    // 5. Verify Candidate Offer is displayed with Score Breakdown
    await expect(
      page.getByText('Mekelle Central Clean Water Supply Depot')
    ).toBeVisible();
    await expect(page.getByText(/94% Match/i)).toBeVisible();
    await expect(
      page.getByText(/Ethiopian Red Cross Society/i)
    ).toBeVisible();

    // 6. Responder Confirms Match
    await page.getByRole('button', { name: /Confirm Match/i }).click();
    await expect(
      page.getByText(/Match confirmed! Stock reserved on Ethiopian Red Cross Society/i)
    ).toBeVisible();

    // 7. Navigate to Provider Dashboard
    await page.goto('/provider');
    await expect(
      page.getByText('Ethiopian Red Cross Society - Tigray Branch')
    ).toBeVisible();

    // 8. View Incoming Match Request
    await expect(
      page.getByText('Ayder Subcity Flash Flood Isolation')
    ).toBeVisible();
    await expect(page.getByText(/50 20L water jerrycans/i)).toBeVisible();

    // 9. Provider Accepts & Dispatches Full Quantity
    await page
      .getByRole('button', { name: /Accept & Dispatch Full Quantity/i })
      .click();

    // 10. Verify Success Feedback
    await expect(
      page.getByText(/Match accepted! 50 20L water jerrycans dispatched/i)
    ).toBeVisible();
  });
});
