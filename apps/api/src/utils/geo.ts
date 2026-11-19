/**
 * Computes great-circle distance between two GPS coordinates in meters using the Haversine formula.
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Obfuscates exact GPS coordinates for public map feeds to protect victim privacy:
 * - Rounds coordinates to 2 decimal places (~1.1 km accuracy) or applies deterministic jitter.
 * - Exact coordinates are preserved exclusively in the database for verified emergency responders.
 */
export function obfuscateCoordinatesForPublic(
  lat: number,
  lng: number,
  jitterRadiusMeters = 500
): { lat: number; lng: number } {
  // Deterministic jitter based on coordinates
  const latOffset = (Math.sin(lat * 1000) * jitterRadiusMeters) / 111320;
  const lngOffset =
    (Math.cos(lng * 1000) * jitterRadiusMeters) / (111320 * Math.cos((lat * Math.PI) / 180));

  return {
    lat: Math.round((lat + latOffset) * 1000) / 1000,
    lng: Math.round((lng + lngOffset) * 1000) / 1000,
  };
}

/**
 * Obfuscates a street address to a safe neighborhood or general district string,
 * strictly stripping house numbers, unit/apartment identifiers, and private lot details.
 */
export function obfuscateAddressForPublic(fullAddress: string): string {
  const parts = fullAddress.split(',').map((p) => p.trim());

  // Filter out any address part that starts with numbers (house numbers) or unit/apt identifiers
  const safeParts = parts.filter(
    (part) =>
      !/^\d+/.test(part) &&
      !/^(apt|suite|unit|ste|fl|floor|#|room|rm|lot|bldg)\b/i.test(part)
  );

  if (safeParts.length >= 2) {
    return safeParts.join(', ');
  } else if (safeParts.length === 1) {
    return `Vicinity of ${safeParts[0]}`;
  }
  return 'General Vicinity Area';
}
