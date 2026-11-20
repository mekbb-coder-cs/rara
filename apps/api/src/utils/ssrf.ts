import { URL } from 'url';
import dns from 'dns/promises';

/**
 * SSRF (Server-Side Request Forgery) Protection Utility
 * Validates outgoing URLs before fetching to prevent querying private/internal services (RFC 1918, loopback, cloud metadata).
 */

const BLOCKED_IP_PREFIXES = [
  '0.',
  '127.', // Loopback
  '10.', // Class A Private
  '192.168.', // Class C Private
  '169.254.', // Link-local / Cloud Metadata (AWS/GCP/Azure)
];

function isPrivateIp(ip: string): boolean {
  if (BLOCKED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))) {
    return true;
  }
  // Check 172.16.0.0 - 172.31.255.255 (Class B Private)
  if (ip.startsWith('172.')) {
    const parts = ip.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  // Check IPv6 loopback
  if (ip === '::1' || ip === '::' || ip.startsWith('fc00:') || ip.startsWith('fe80:')) {
    return true;
  }
  return false;
}

export async function validateSafeExternalUrl(inputUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(inputUrl);

    // Only allow HTTP and HTTPS protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;

    // Disallow localhost or IP address literals directly
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return false;
    }

    // Resolve DNS to verify actual destination IP
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
