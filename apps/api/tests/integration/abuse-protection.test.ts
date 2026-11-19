import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { HazardType, AbuseFlagReason, AbuseStatus } from '@relieflink/shared';

describe('Anti-Abuse, Honeypot & Fraud Prevention Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.abuseFlags.clear();
    }
  });

  it('should trigger honeypot trap when bot fills hidden field, rejecting report and logging AbuseFlag', async () => {
    const res = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Automated spam payload from malicious scraper.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: 'Spam location',
        honeypot: 'http://buy-pharma-spam-link.example.com', // Bot fell into trap!
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('REJECTED'); // Silently rejected without alerting responders

    // Verify AbuseFlag was created
    if (reportRepository instanceof InMemoryReportRepository) {
      const flags = Array.from(reportRepository.abuseFlags.values());
      expect(flags).toHaveLength(1);
      expect(flags[0].reason).toBe(AbuseFlagReason.SPAM);
      expect(flags[0].details).toContain('honeypot');
    }
  });

  it('should allow citizens and responders to flag false reports via POST /reports/:id/flag', async () => {
    const reportRes = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FIRE,
        description: 'Reports of smoke near warehouse.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: '400 Warehouse Row',
      });

    const reportId = reportRes.body.data.reportId;

    const flagRes = await request(app)
      .post(`/api/v1/reports/${reportId}/flag`)
      .send({
        reason: AbuseFlagReason.FALSE_REPORT,
        details: 'Checked on scene: controlled BBQ pit, no emergency or fire threat.',
      });

    expect(flagRes.status).toBe(200);
    expect(flagRes.body.success).toBe(true);
    expect(flagRes.body.data.flagId).toBeDefined();

    if (reportRepository instanceof InMemoryReportRepository) {
      const flag = reportRepository.abuseFlags.get(flagRes.body.data.flagId);
      expect(flag?.status).toBe(AbuseStatus.PENDING_REVIEW);
      expect(flag?.reason).toBe(AbuseFlagReason.FALSE_REPORT);
    }
  });
});
