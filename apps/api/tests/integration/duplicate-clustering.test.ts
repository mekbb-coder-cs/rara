import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { reportRepository, InMemoryReportRepository } from '../../src/repositories/report.repository.js';
import { HazardType, UrgencyLevel } from '@relieflink/shared';

describe('Duplicate Incident Detection & Spatial Clustering Tests', () => {
  const app = createApp();

  beforeEach(() => {
    if (reportRepository instanceof InMemoryReportRepository) {
      reportRepository.reports.clear();
      reportRepository.clusters.clear();
      reportRepository.idempotencyStore.clear();
    }
  });

  it('should automatically cluster concurrent reports of the same hazard within 500 meters', async () => {
    // 1. Citizen A reports a major flood at Biscayne Blvd
    const report1Res = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        title: 'Biscayne Blvd Severe Flooding',
        description: 'Water rising up to car hoods, people trapped in vehicles near the plaza.',
        severity: UrgencyLevel.CRITICAL,
        latitude: 25.7617,
        longitude: -80.1918,
        address: '1000 Biscayne Blvd, Miami, FL',
        peopleAffectedCount: 8,
      });

    expect(report1Res.status).toBe(201);
    expect(report1Res.body.data.isDuplicate).toBe(false);
    expect(report1Res.body.data.duplicateClusterId).toBeNull();
    const report1Id = report1Res.body.data.reportId;

    // 2. Citizen B reports the same flood ~150 meters away 10 minutes later
    const report2Res = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        title: 'Plaza Parking Submerged',
        description: 'Massive flooding outside the plaza, water entering buildings.',
        severity: UrgencyLevel.HIGH,
        latitude: 25.7625, // ~100m away
        longitude: -80.1922,
        address: '1050 Biscayne Blvd, Miami, FL',
        peopleAffectedCount: 4,
      });

    expect(report2Res.status).toBe(201);
    expect(report2Res.body.data.isDuplicate).toBe(true);
    expect(report2Res.body.data.duplicateClusterId).toBeDefined();
    expect(report2Res.body.data.corroborationCount).toBe(2);

    const clusterId = report2Res.body.data.duplicateClusterId;

    // 3. Citizen C reports the same flood ~250 meters away 20 minutes later
    const report3Res = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Flooding continuing to rise along Biscayne corridor.',
        severity: UrgencyLevel.CRITICAL,
        latitude: 25.7630,
        longitude: -80.1915,
        address: '1100 Biscayne Blvd, Miami, FL',
        peopleAffectedCount: 2,
      });

    expect(report3Res.status).toBe(201);
    expect(report3Res.body.data.isDuplicate).toBe(true);
    expect(report3Res.body.data.duplicateClusterId).toBe(clusterId);
    expect(report3Res.body.data.corroborationCount).toBe(3);

    // Verify master report state in repository
    const master = await reportRepository.findById(report1Id);
    expect(master?.report.duplicateClusterId).toBe(clusterId);
    expect(master?.report.isMasterInCluster).toBe(true);
  });

  it('should NOT cluster reports with different hazard types at the same coordinates', async () => {
    // Report 1: Flood
    const floodRes = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Water standing on street 2 feet deep.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: 'Downtown Miami',
      });

    // Report 2: Electrical Fire at the same intersection
    const fireRes = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FIRE,
        description: 'Electrical transformer on fire on utility pole.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: 'Downtown Miami',
      });

    expect(floodRes.body.data.isDuplicate).toBe(false);
    expect(fireRes.body.data.isDuplicate).toBe(false);
    expect(fireRes.body.data.duplicateClusterId).toBeNull();
  });

  it('should NOT cluster reports that are far apart geographically (> 500 meters)', async () => {
    const report1 = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Flood in Downtown Miami.',
        latitude: 25.7617,
        longitude: -80.1918,
        address: 'Downtown Miami',
      });

    // Submerged road 8 kilometers away in Miami Beach
    const report2 = await request(app)
      .post('/api/v1/reports')
      .send({
        type: HazardType.FLOOD,
        description: 'Flood along Ocean Drive.',
        latitude: 25.7865, // ~8 km distance
        longitude: -80.1312,
        address: 'Miami Beach',
      });

    expect(report1.body.data.duplicateClusterId).toBeNull();
    expect(report2.body.data.duplicateClusterId).toBeNull();
    expect(report2.body.data.isDuplicate).toBe(false);
  });
});
