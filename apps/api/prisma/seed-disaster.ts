import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Disaster simulation parameters: South Florida Hurricane & Coastal Flood Scenario
const REGION_CODE = 'US-FL-MIA';
const REGION_NAME = 'South Florida Disaster Jurisdiction';
const CENTER_LAT = 25.7617;
const CENTER_LNG = -80.1918;
const RADIUS_DEGREES = 0.35; // ~40km diameter

const HAZARD_DISTRIBUTION: Array<{ type: any; weight: number }> = [
  { type: 'FLOOD', weight: 40 },
  { type: 'MEDICAL', weight: 20 },
  { type: 'ROAD_BLOCKED', weight: 15 },
  { type: 'FOOD_WATER', weight: 10 },
  { type: 'FIRE', weight: 5 },
  { type: 'SHELTER', weight: 5 },
  { type: 'MISSING_PERSON', weight: 5 },
];

const SEVERITY_LEVELS: any[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'LIFE_THREATENING'];
const VULNERABLE_POOLS = ['children', 'elderly', 'disabled', 'pregnant'];

const STREETS = [
  'Biscayne Blvd', 'Ocean Drive', 'Flagler St', 'Collins Ave', 'Brickell Ave',
  'Coral Way', 'Tamiami Trail', 'SW 8th St', 'NW 27th Ave', 'Calle Ocho',
  'Alton Rd', 'Washington Ave', 'LeJeune Rd', 'Bird Rd', 'Kendall Drive'
];

const LOCALITIES = [
  'Downtown Miami', 'Miami Beach', 'Little Havana', 'Brickell', 'Coconut Grove',
  'Coral Gables', 'Hialeah', 'Wynwood', 'Key Biscayne', 'North Miami'
];

function pickWeightedHazard(): any {
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const item of HAZARD_DISTRIBUTION) {
    cumulative += item.weight;
    if (rand <= cumulative) return item.type;
  }
  return 'FLOOD';
}

function getRandomInRadius(centerLat: number, centerLng: number, radiusDeg: number) {
  const u = Math.random();
  const v = Math.random();
  const w = radiusDeg * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const lat = centerLat + w * Math.cos(t);
  const lng = centerLng + w * Math.sin(t);
  return { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
}

// Epicenters for duplicate clusters
const CLUSTER_EPICENTERS = [
  { name: 'MacArthur Causeway Submerged', lat: 25.7781, lng: -80.1742, type: 'FLOOD' },
  { name: 'Senior Living Center Generator Failure', lat: 25.7654, lng: -80.2198, type: 'MEDICAL' },
  { name: 'Submerged Electrical Substation Fire', lat: 25.8042, lng: -80.1989, type: 'FIRE' },
  { name: 'Downed High-Voltage Lines & Collapsed Oak', lat: 25.7291, lng: -80.2411, type: 'ROAD_BLOCKED' },
  { name: 'Evacuation Shelter Roof Collapse', lat: 25.8341, lng: -80.2831, type: 'SHELTER' },
];

export async function seedDisasterReports(count = 2000): Promise<number> {
  console.log(`🌀 Initializing Hurricane Crisis Simulation (${count} incident reports)...`);

  // Ensure region exists
  let region = await prisma.region.findUnique({ where: { code: REGION_CODE } });
  if (!region) {
    region = await prisma.region.create({
      data: {
        code: REGION_CODE,
        name: REGION_NAME,
        country: 'USA',
        state: 'FL',
        centerLat: CENTER_LAT,
        centerLng: CENTER_LNG,
        isActive: true,
      },
    });
  }

  const reportsData = [];
  const now = Date.now();

  // 1. Generate 300 reports mapped to distinct duplicate clusters
  console.log('📍 Generating duplicate report clusters at crisis epicenters...');
  for (let c = 0; c < CLUSTER_EPICENTERS.length; c++) {
    const epi = CLUSTER_EPICENTERS[c];
    const clusterReportsCount = 60; // 60 calls per major incident

    for (let i = 0; i < clusterReportsCount; i++) {
      const trackingCode = `RL-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
      const minutesAgo = Math.floor(Math.random() * 120); // within last 2 hours
      const jitterLat = epi.lat + (Math.random() - 0.5) * 0.002;
      const jitterLng = epi.lng + (Math.random() - 0.5) * 0.002;

      reportsData.push({
        trackingCode,
        title: `${epi.name} (Citizen Call #${i + 1})`,
        description: `Urgent incident at ${epi.name}. Caller reports dangerous conditions, rising waters, and immediate assistance needed.`,
        hazardType: epi.type as any,
        status: (i === 0 ? 'VERIFIED' : 'SUBMITTED') as any,
        initialUrgency: (i % 2 === 0 ? 'CRITICAL' : 'HIGH') as any,
        latitude: jitterLat,
        longitude: jitterLng,
        approximateLocation: `Vicinity of ${epi.name}`,
        exactAddressEncrypted: `${100 + i * 2} ${epi.name}, Miami, FL`,
        peopleAffectedCount: 5 + (i % 15),
        vulnerableGroups: ['elderly', 'children'],
        hasVulnerable: true,
        isAnonymous: i % 3 === 0,
        reporterName: i % 3 === 0 ? null : `Caller ${i + 1}`,
        reporterPhoneEncrypted: `+1305555${String(1000 + i).padStart(4, '0')}`,
        regionId: region.id,
        createdAt: new Date(now - minutesAgo * 60 * 1000),
        updatedAt: new Date(now - minutesAgo * 60 * 1000),
      });
    }
  }

  // 2. Generate remaining randomized distributed disaster reports
  console.log(`🌐 Synthesizing remaining distributed crisis incidents across jurisdiction...`);
  const remaining = count - reportsData.length;

  for (let i = 0; i < remaining; i++) {
    const hazardType = pickWeightedHazard();
    const coords = getRandomInRadius(CENTER_LAT, CENTER_LNG, RADIUS_DEGREES);
    const trackingCode = `RL-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
    const street = STREETS[Math.floor(Math.random() * STREETS.length)];
    const locality = LOCALITIES[Math.floor(Math.random() * LOCALITIES.length)];
    const address = `${Math.floor(100 + Math.random() * 9000)} ${street}, ${locality}, FL`;
    const hoursAgo = Math.floor(Math.random() * 48); // within last 48 hours

    const numVulnerable = Math.floor(Math.random() * 3);
    const vulnerableGroups = VULNERABLE_POOLS.slice(0, numVulnerable);

    const severityIndex = Math.floor(Math.random() * SEVERITY_LEVELS.length);
    const severity = SEVERITY_LEVELS[severityIndex];

    reportsData.push({
      trackingCode,
      title: `${hazardType.replace(/_/g, ' ')} at ${street}`,
      description: `Disaster report: ${hazardType} observed near ${street} in ${locality}. Structural disruption and water ingress reported by residents.`,
      hazardType: hazardType as any,
      status: (i % 5 === 0 ? 'VERIFIED' : 'SUBMITTED') as any,
      initialUrgency: severity,
      latitude: coords.lat,
      longitude: coords.lng,
      approximateLocation: `${street}, ${locality}`,
      exactAddressEncrypted: address,
      peopleAffectedCount: 1 + Math.floor(Math.pow(Math.random(), 2) * 50),
      vulnerableGroups,
      hasVulnerable: vulnerableGroups.length > 0,
      isAnonymous: Math.random() > 0.4,
      reporterName: Math.random() > 0.4 ? null : `Citizen ${i + 1}`,
      reporterPhoneEncrypted: `+1305555${String(Math.floor(1000 + Math.random() * 9000))}`,
      regionId: region.id,
      createdAt: new Date(now - hoursAgo * 3600 * 1000),
      updatedAt: new Date(now - hoursAgo * 3600 * 1000),
    });
  }

  // Insert in batches of 250 for speed and stability
  const batchSize = 250;
  let totalInserted = 0;

  for (let i = 0; i < reportsData.length; i += batchSize) {
    const batch = reportsData.slice(i, i + batchSize);
    await prisma.report.createMany({
      data: batch as any,
      skipDuplicates: true,
    });
    totalInserted += batch.length;
    console.log(`  ✓ Inserted ${totalInserted} / ${reportsData.length} reports`);
  }

  console.log(`✅ Simulation complete: ${totalInserted} disaster reports successfully seeded into region ${REGION_CODE}.`);
  return totalInserted;
}

if (process.argv[1]?.includes('seed-disaster')) {
  seedDisasterReports(2000)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Failed to seed disaster reports:', err);
      process.exit(1);
    });
}
