import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom Metrics for Disaster Response SLA
const reportSubmissionRate = new Rate('successful_report_submissions');
const mapQueryRate = new Rate('successful_map_queries');
const reportLatencyTrend = new Trend('report_submission_duration');
const mapLatencyTrend = new Trend('map_query_duration');

/**
 * ReliefLink Disaster-Day Traffic Simulation:
 * Target: 5,000 reports per hour (~1.4 req/s sustained, ramping to 10 req/s spikes)
 * Target: 1,000 concurrent map viewers fetching cached feeds and regional clusters
 */
export const options = {
  scenarios: {
    // Scenario 1: 1,000 Concurrent Map Viewers
    concurrent_map_viewers: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '1m', target: 1000 }, // Peak 1,000 concurrent viewers
        { duration: '1m', target: 1000 },
        { duration: '30s', target: 100 },
      ],
      exec: 'mapViewerScenario',
    },

    // Scenario 2: High Inflow Report Submissions (5,000 reports/hour pace)
    disaster_report_inflow: {
      executor: 'constant-arrival-rate',
      rate: 84, // 84 reports/minute = ~5,040 reports per hour
      timeUnit: '1m',
      duration: '3m',
      preAllocatedVUs: 50,
      maxVUs: 200,
      exec: 'reportSubmitterScenario',
    },
  },
  thresholds: {
    // 95% of map requests must complete under 200ms (due to 60s cache)
    map_query_duration: ['p(95)<200'],
    // 95% of crisis reports must submit under 500ms
    report_submission_duration: ['p(95)<500'],
    // Over 99% of submissions must succeed
    successful_report_submissions: ['rate>0.99'],
    successful_map_queries: ['rate>0.99'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:4000/api/v1';

const HAZARDS = ['FLOOD', 'DROUGHT', 'MEDICAL_EMERGENCY', 'STRUCTURAL_COLLAPSE', 'DISPLACEMENT'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TIGRAY_LOCATIONS = [
  { name: 'Mekelle Central', lat: 13.4967, lng: 39.4753 },
  { name: 'Shire Inda Selassie', lat: 14.1333, lng: 38.2833 },
  { name: 'Adigrat Center', lat: 14.2764, lng: 39.4623 },
  { name: 'Axum Town', lat: 14.1231, lng: 38.7241 },
];

export function mapViewerScenario() {
  const res = http.get(`${BASE_URL}/reports/public-feed`);
  mapLatencyTrend.add(res.timings.duration);
  const success = check(res, {
    'map status is 200': (r) => r.status === 200,
    'map payload contains reports': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.data);
      } catch {
        return false;
      }
    },
  });
  mapQueryRate.add(success);
  sleep(1); // Think time between map refreshes
}

export function reportSubmitterScenario() {
  const loc = TIGRAY_LOCATIONS[Math.floor(Math.random() * TIGRAY_LOCATIONS.length)];
  const hazard = HAZARDS[Math.floor(Math.random() * HAZARDS.length)];
  const severity = SEVERITIES[Math.floor(Math.random() * SEVERITIES.length)];

  const payload = JSON.stringify({
    type: hazard,
    description: `Urgent community crisis reported in ${loc.name}. Immediate relief required.`,
    severity: severity,
    affectedCount: Math.floor(Math.random() * 50) + 5,
    vulnerableGroups: ['children', 'elderly'],
    latitude: loc.lat + (Math.random() - 0.5) * 0.05,
    longitude: loc.lng + (Math.random() - 0.5) * 0.05,
    address: `${loc.name}, Tigray, Ethiopia`,
    contactPhone: '+251914' + Math.floor(100000 + Math.random() * 900000),
    isAnonymous: Math.random() > 0.5,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `load-test-${Date.now()}-${Math.random()}`,
    },
  };

  const res = http.post(`${BASE_URL}/reports`, payload, params);
  reportLatencyTrend.add(res.timings.duration);

  const success = check(res, {
    'submission status is 201 or 202 (queued)': (r) => r.status === 201 || r.status === 202,
    'tracking code returned': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.data?.trackingCode;
      } catch {
        return false;
      }
    },
  });

  reportSubmissionRate.add(success);
}
