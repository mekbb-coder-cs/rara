import { describe, it, expect, beforeEach } from 'vitest';
import { coordinationRepository } from '../../src/repositories/coordination.repository.js';
import { TaskType, TaskStatus } from '@relieflink/shared';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Task State Machine & Lifecycle Transitions', () => {
  let sampleTaskId: string;
  const mockReportId = 'rep-test-lifecycle-1';

  beforeEach(async () => {
    const task = await coordinationRepository.createTask({
      reportId: mockReportId,
      createdById: 'user-responder-1',
      assigneeId: 'user-volunteer-1',
      assigneeName: 'Daniel Haile',
      type: TaskType.DELIVER_SUPPLIES,
      title: 'Deliver 50 Water Jerrycans to Ayder',
      description: 'Deliver clean water jerrycans to temporary shelter.',
      checklist: [
        { id: 'c1', text: 'Pick up jerrycans from Red Cross depot', completed: false },
        { id: 'c2', text: 'Inspect security seal on containers', completed: false },
        { id: 'c3', text: 'Handover to shelter representative', completed: false },
      ],
    });
    sampleTaskId = task.id;
  });

  it('initializes task in ASSIGNED status with tracking inactive', async () => {
    const task = await coordinationRepository.getTaskById(sampleTaskId);
    expect(task).toBeDefined();
    expect(task?.status).toBe(TaskStatus.ASSIGNED);
    expect(task?.isTrackingActive).toBe(false);
    expect(task?.checklist.length).toBe(3);
  });

  it('allows valid state progression: ASSIGNED -> EN_ROUTE -> ON_SITE -> DONE', async () => {
    // 1. Assignee departs: ASSIGNED -> EN_ROUTE
    const enRouteTask = await coordinationRepository.updateTaskStatus(
      sampleTaskId,
      TaskStatus.EN_ROUTE,
      { note: 'Left depot, driving north on Ayder Road' }
    );
    expect(enRouteTask.status).toBe(TaskStatus.EN_ROUTE);

    // Volunteer enables opt-in location tracking
    await coordinationRepository.updateTaskLocation(sampleTaskId, {
      latitude: 13.498,
      longitude: 39.475,
      isTrackingActive: true,
    });

    const activeLocations = await coordinationRepository.getActiveTrackingLocations();
    expect(activeLocations.some((l) => l.taskId === sampleTaskId)).toBe(true);

    // 2. Arrives on site: EN_ROUTE -> ON_SITE
    const onSiteTask = await coordinationRepository.updateTaskStatus(
      sampleTaskId,
      TaskStatus.ON_SITE,
      { note: 'Arrived at shelter gate' }
    );
    expect(onSiteTask.status).toBe(TaskStatus.ON_SITE);

    // 3. Completes task checklist and finishes: ON_SITE -> DONE
    const doneTask = await coordinationRepository.updateTaskStatus(
      sampleTaskId,
      TaskStatus.DONE,
      {
        checklist: [
          { id: 'c1', text: 'Pick up jerrycans', completed: true },
          { id: 'c2', text: 'Inspect seal', completed: true },
          { id: 'c3', text: 'Handover', completed: true },
        ],
        note: 'All jerrycans received by community leader',
      }
    );
    expect(doneTask.status).toBe(TaskStatus.DONE);

    // CRITICAL: Live tracking must automatically terminate upon DONE
    expect(doneTask.isTrackingActive).toBe(false);
    const trackingAfterDone = await coordinationRepository.getActiveTrackingLocations();
    expect(trackingAfterDone.some((l) => l.taskId === sampleTaskId)).toBe(false);
  });

  it('rejects invalid jump transitions (e.g. ASSIGNED directly to DONE)', async () => {
    await expect(
      coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.DONE)
    ).rejects.toThrow(BadRequestError);

    await expect(
      coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.ON_SITE)
    ).rejects.toThrow(BadRequestError);
  });

  it('allows ASSIGNED -> FAILED and permits reassignment back to ASSIGNED', async () => {
    const failedTask = await coordinationRepository.updateTaskStatus(
      sampleTaskId,
      TaskStatus.FAILED,
      { note: 'Vehicle flat tire, unable to transport water' }
    );
    expect(failedTask.status).toBe(TaskStatus.FAILED);
    expect(failedTask.isTrackingActive).toBe(false);

    // Reassigning to another responder: FAILED -> ASSIGNED
    const reassignedTask = await coordinationRepository.updateTaskStatus(
      sampleTaskId,
      TaskStatus.ASSIGNED,
      { note: 'Reassigned to backup dispatch unit' }
    );
    expect(reassignedTask.status).toBe(TaskStatus.ASSIGNED);
  });

  it('prohibits state transitions out of DONE (terminal state)', async () => {
    await coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.EN_ROUTE);
    await coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.ON_SITE);
    await coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.DONE);

    await expect(
      coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.ASSIGNED)
    ).rejects.toThrow(BadRequestError);

    await expect(
      coordinationRepository.updateTaskStatus(sampleTaskId, TaskStatus.EN_ROUTE)
    ).rejects.toThrow(BadRequestError);
  });
});
