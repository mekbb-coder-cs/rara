import { test, expect } from '@playwright/test';

test.describe('End-to-End Coordination, Field Tasks, and Case Closure Flow', () => {
  test('responder dispatches field task, volunteer updates status and GPS on /tasks, and case is closed with reporter confirmation', async ({
    page,
  }) => {
    const mockReport = {
      id: 'rep-e2e-coord-1',
      trackingCode: 'RL-TIG-7701',
      title: 'Ayder Subcity Flash Flood Medical Triage',
      description: 'Rising water isolating 15 elderly and injured residents near clinic.',
      hazardType: 'FLOOD',
      status: 'VERIFIED',
      severity: 'HIGH',
      approximateLocation: 'Ayder Subcity, Mekelle',
      latitude: 13.4967,
      longitude: 39.4753,
      peopleAffectedCount: 15,
      vulnerableGroups: ['elderly', 'injured'],
      corroborationCount: 2,
      priorityScore: 88.0,
      priorityBreakdown: {
        severityScore: 35,
        peopleFactor: 15,
        vulnerabilityScore: 20,
        timeFactor: 8,
        baseSum: 78,
        hazardMultiplier: 1.1,
        confidenceMultiplier: 1.0,
        compositeScore: 88.0,
      },
      version: 2,
      assignedResponderId: 'resp-user-1',
      lockedById: null,
      lockedAt: null,
      verificationStatus: 'CONFIRMED',
      createdAt: new Date().toISOString(),
    };

    let mockTask = {
      id: 'task-e2e-101',
      reportId: mockReport.id,
      reportTrackingCode: mockReport.trackingCode,
      matchId: null,
      assigneeId: 'vol-user-1',
      assigneeName: 'Rapid Response Team Alpha',
      type: 'DELIVER_SUPPLIES',
      title: 'Deliver Medical Trauma Kits & Clean Water',
      description: 'Emergency supply transport to Ayder Subcity triage post.',
      deadline: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
      status: 'ASSIGNED',
      checklist: [
        { id: 'c1', text: 'Confirm arrival at distribution depot', completed: false },
        { id: 'c2', text: 'Inspect packaging and inventory count', completed: false },
        { id: 'c3', text: 'Obtain signature from local community leader', completed: false },
      ],
      lastLatitude: 13.4967,
      lastLongitude: 39.4753,
      isTrackingActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Mock API Endpoints
    await page.route(/\/api\/v1\/reports\/triage/, async (route) => {
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

    await page.route(/\/api\/v1\/coordination\/tasks\/[^/]+\/status/, async (route) => {
      const patchData = route.request().postDataJSON();
      mockTask.status = patchData.status;
      if (patchData.checklist) {
        mockTask.checklist = patchData.checklist;
      }
      if (patchData.status === 'DONE' || patchData.status === 'FAILED') {
        mockTask.isTrackingActive = false;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: mockTask,
        }),
      });
    });

    await page.route(/\/api\/v1\/coordination\/tasks\/[^/]+\/location/, async (route) => {
      const locData = route.request().postDataJSON();
      mockTask.lastLatitude = locData.latitude;
      mockTask.lastLongitude = locData.longitude;
      mockTask.isTrackingActive = locData.isTrackingActive ?? true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            taskId: mockTask.id,
            latitude: locData.latitude,
            longitude: locData.longitude,
            isTrackingActive: mockTask.isTrackingActive,
            recordedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route(/\/api\/v1\/coordination\/tasks(\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        const postData = route.request().postDataJSON();
        mockTask = {
          ...mockTask,
          ...postData,
          id: 'task-e2e-101',
          status: 'ASSIGNED',
        };
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockTask,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [mockTask],
            total: 1,
          }),
        });
      }
    });

    await page.route(/\/api\/v1\/coordination\/cases\/.*\/close/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Case closed successfully.',
          data: {
            reportId: mockReport.id,
            status: 'CLOSED',
            closedAt: new Date().toISOString(),
          },
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

    // 2. Open Responder console and open incident verification modal
    await page.goto('/responder');
    await expect(page.getByRole('heading', { name: /Responder Triage Console/i })).toBeVisible();
    await expect(page.getByText('RL-TIG-7701')).toBeVisible();

    // Click on the case to open drawer
    await page.getByText('Ayder Subcity Flash Flood Medical Triage').click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Ayder Subcity Flash Flood Medical Triage' })
    ).toBeVisible();

    // 3. Dispatch a field task
    const dispatchTaskBtn = page.getByRole('button', { name: /Dispatch Task/i });
    await expect(dispatchTaskBtn).toBeVisible();
    await dispatchTaskBtn.click();

    // In TaskAssignmentModal
    await expect(page.getByRole('heading', { name: /Dispatch Field Response Task/i })).toBeVisible();
    const confirmDispatchBtn = page.getByRole('button', { name: /Dispatch Field Task/i });
    await confirmDispatchBtn.click();

    // 4. Navigate to /tasks (Volunteer Field Tasks interface)
    await page.goto('/tasks');
    await expect(page.getByRole('heading', { name: /Assigned Field Missions/i })).toBeVisible();
    await expect(page.getByText(/Deliver Medical Trauma Kits & Clean Water|Deliver Relief Supplies/i)).toBeVisible();

    // 5. Start Route (ASSIGNED -> EN_ROUTE)
    const startRouteBtn = page.getByRole('button', { name: /Start Route/i });
    await expect(startRouteBtn).toBeVisible();
    await startRouteBtn.click();

    // Verify status updated to EN_ROUTE
    await expect(page.getByText(/STATUS: EN_ROUTE/i)).toBeVisible();

    // 6. Opt-In Live GPS Tracking Toggle
    const trackingToggleBtn = page.getByRole('button', { name: /Share Location/i });
    await expect(trackingToggleBtn).toBeVisible();
    await trackingToggleBtn.click();

    // Verify Active GPS Beacon text is displayed
    await expect(page.getByText(/Actively broadcasting GPS/i)).toBeVisible();

    // 7. Check off checklist item
    const firstCheckbox = page.locator('input[type="checkbox"]').first();
    await firstCheckbox.check();

    // 8. Arrived On Site
    const arrivedBtn = page.getByRole('button', { name: /Arrived/i });
    await expect(arrivedBtn).toBeVisible();
    await arrivedBtn.click();
    await expect(page.getByText(/STATUS: ON_SITE/i)).toBeVisible();

    // 9. Mission Done
    const missionDoneBtn = page.getByRole('button', { name: /Mission Done/i });
    await expect(missionDoneBtn).toBeVisible();
    await missionDoneBtn.click();
    await expect(page.getByText(/STATUS: DONE/i)).toBeVisible();

    // 10. Close Case in Responder Console
    await page.goto('/responder');
    await page.getByText('Ayder Subcity Flash Flood Medical Triage').click();

    // Click "Resolution & Closure" tab
    const closureTabBtn = page.getByRole('button', { name: /Resolution & Closure/i });
    await expect(closureTabBtn).toBeVisible();
    await closureTabBtn.click();

    // Fill in closing note
    const closingTextarea = page.locator('textarea[placeholder*="water supplies delivered"]');
    await expect(closingTextarea).toBeVisible();
    await closingTextarea.fill(
      'Clean water and trauma surgical supplies delivered to Ayder clinic. All residents stabilized.'
    );

    // Click Resolve & Close
    const closeBtn = page.getByRole('button', { name: /Resolve & Close Incident/i });
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Verify success banner appears
    await expect(page.getByText(/Case successfully resolved and closed!/i)).toBeVisible();
  });
});
