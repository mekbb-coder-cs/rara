import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
  generateAnonymousToken,
  verifyAnonymousToken,
} from '../../src/utils/crypto.js';
import { Role } from '@relieflink/shared';

describe('Tokens & Cryptography Unit Tests', () => {
  it('should hash and verify passwords using Argon2', async () => {
    const password = 'SuperSecretCrisisPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$argon2')).toBe(true);

    const isMatch = await verifyPassword(hash, password);
    expect(isMatch).toBe(true);

    const isWrongMatch = await verifyPassword(hash, 'WrongPassword123!');
    expect(isWrongMatch).toBe(false);
  });

  it('should sign and verify valid JWT access tokens', () => {
    const payload = {
      userId: 'user-uuid-1234',
      role: Role.RESPONDER,
      email: 'medic@rescue.org',
      isVerifiedResponder: true,
      assignedRegionIds: ['reg-miami-1'],
    };

    const token = generateAccessToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.role).toBe(Role.RESPONDER);
    expect(decoded.assignedRegionIds).toContain('reg-miami-1');
  });

  it('should generate secure refresh tokens and SHA-256 hashes', () => {
    const userId = 'user-uuid-5678';
    const { rawToken, tokenHash, familyId } = generateRefreshToken(userId);

    expect(rawToken).toHaveLength(96); // 48 bytes hex
    expect(tokenHash).toBe(hashToken(rawToken));
    expect(familyId).toBeDefined();
  });

  it('should issue and verify anonymous report tracking tokens', () => {
    const payload = {
      reportId: 'c7b3d889-42b8-4d64-9b2f-7707e78d91c1',
      trackingCode: 'RL-9921-X',
    };

    const token = generateAnonymousToken(payload);
    expect(token).toBeDefined();

    const verified = verifyAnonymousToken(token);
    expect(verified.reportId).toBe(payload.reportId);
    expect(verified.trackingCode).toBe(payload.trackingCode);
    expect(verified.tokenType).toBe('ANONYMOUS_REPORT_TRACKING');
  });

  it('should reject tampered anonymous tokens', () => {
    const token = generateAnonymousToken({
      reportId: 'c7b3d889-42b8-4d64-9b2f-7707e78d91c1',
      trackingCode: 'RL-9921-X',
    });

    const tampered = token.slice(0, -5) + 'abcde';
    expect(() => verifyAnonymousToken(tampered)).toThrow();
  });
});
