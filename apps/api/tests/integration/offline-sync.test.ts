import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { HazardType, UrgencyLevel } from '@relieflink/shared';

describe('Offline Synchronization Batch Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.idempotencyStore.clear();
    }
  });

  it('should accept a batch of offline reports and preserve their original client timestamps', async () => {
    const historicalTime1 = '2026-11-18T14:30:00.000Z';
    const historicalTime2 = '2026-11-18T15:15:00.000Z';

    const batchPayload = {
      reports: [
        {
          localId: 'offline-local-uuid-001',
          offlineCreatedAt: historicalTime1,
          type: HazardType.ROAD_BLOCKED,
          description: 'Fallen telephone pole blocking emergency exit road.',
          severity: UrgencyLevel.HIGH,
          latitude: 25.7617,
          longitude: -80.1918,
          address: 'Pine St & 5th Ave',
          peopleAffectedCount: 20,
        },
        {
          localId: 'offline-local-uuid-002',
          offlineCreatedAt: historicalTime2,
          type: HazardType.FOOD_WATER,
          description: 'Community center lost clean water supply after pipeline rupture.',
          severity: UrgencyLevel.MEDIUM,
          latitude: 25.7725,
          longitude: -80.1830,
          address: 'Community Center, 8th St',
          peopleAffectedCount: 50,
        },
      ],
    };

    const res = await request(app)
      .post('/api/v1/reports/offline-sync')
      .send(batchPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    const report1 = res.body.data.find((r: any) => r.localId === 'offline-local-uuid-001');
    const report2 = res.body.data.find((r: any) => r.localId === 'offline-local-uuid-002');

    expect(report1).toBeDefined();
    expect(report2).toBeDefined();
    expect(report1.trackingCode).toBeDefined();
    expect(report2.trackingCode).toBeDefined();

    // Verify stored timestamps in repository match offlineCreatedAt
    if (reportRepository instanceof InMemoryReportRepository) {
      const stored1 = reportRepository.reports.get(report1.reportId);
      const stored2 = reportRepository.reports.get(report2.reportId);

      expect(stored1?.createdAt.toISOString()).toBe(historicalTime1);
      expect(stored2?.createdAt.toISOString()).toBe(historicalTime2);
    }
  });
});
