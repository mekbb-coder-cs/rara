import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { HazardType, ReportStatus, UrgencyLevel } from '@relieflink/shared';

describe('Report Timeline Updates Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.updates.clear();
      reportRepository.media.clear();
    }
  });

  it('should allow appending immutable updates and photos to a case timeline', async () => {
    // 1. Create report
    const createRes = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Rising water on street.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: 'Biscayne Blvd',
      });

    const reportId = createRes.body.data.reportId;
    const trackingCode = createRes.body.data.trackingCode;

    // 2. Add first update: Responder marks En Route
    const update1 = await request(app)
      .post(`/api/v1/reports/${reportId}/updates`)
      .send({
        note: 'Rescue Unit 4 is en route with an inflatable boat.',
        status: ReportStatus.IN_PROGRESS,
        isPublic: true,
      });

    expect(update1.status).toBe(201);
    expect(update1.body.data.newStatus).toBe(ReportStatus.IN_PROGRESS);

    // 3. Add second update with photo: On Scene
    const update2 = await request(app)
      .post(`/api/v1/reports/${reportId}/updates`)
      .send({
        note: 'Unit arrived on scene. Victims secured. Beginning transport to dry ground.',
        status: ReportStatus.RESOLVED,
        media: [
          {
            url: 'https://storage.relieflink.org/media/rescue-safe.jpg',
            mimeType: 'image/jpeg',
            fileSizeBytes: 1024 * 500, // 500KB
            isSensitive: false,
          },
        ],
      });

    expect(update2.status).toBe(201);
    expect(update2.body.data.newStatus).toBe(ReportStatus.RESOLVED);

    // 4. Verify public tracking endpoint displays the timeline
    const trackRes = await request(app).get(`/api/v1/reports/track/${trackingCode}`);

    expect(trackRes.status).toBe(200);
    expect(trackRes.body.data.status).toBe(ReportStatus.RESOLVED);
    expect(trackRes.body.data.updates).toHaveLength(2);
    expect(trackRes.body.data.updates[0].note).toContain('Rescue Unit 4 is en route');
    expect(trackRes.body.data.updates[1].note).toContain('Unit arrived on scene');
  });
});
