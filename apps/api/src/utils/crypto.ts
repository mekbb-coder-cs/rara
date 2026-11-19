import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { hash, verify } from '@node-rs/argon2';
import { env } from '../config/env.js';
import { JwtUserPayload, AnonymousTrackingPayload } from '@relieflink/shared';
import { UnauthorizedError } from './errors.js';

// ==========================================
// ARGON2 PASSWORD HASHING
// ==========================================

export async function hashPassword(password: string): Promise<string> {
  return await hash(password, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hashString: string, plainText: string): Promise<boolean> {
  try {
    return await verify(hashString, plainText);
  } catch {
    return false;
  }
}

// ==========================================
// TOKENS (JWT & REFRESH)
// ==========================================

export function generateAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as any,
  });
}

export function verifyAccessToken(token: string): JwtUserPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUserPayload;
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired access token', error);
  }
}

export function generateRefreshToken(userId: string, familyId?: string): {
  rawToken: string;
  tokenHash: string;
  familyId: string;
} {
  const rawToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawToken);
  const activeFamilyId = familyId || crypto.randomUUID();

  return {
    rawToken,
    tokenHash,
    familyId: activeFamilyId,
  };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRandomToken(bytes = 32): { raw: string; hash: string } {
  const raw = crypto.randomBytes(bytes).toString('hex');
  const hash = hashToken(raw);
  return { raw, hash };
}

// ==========================================
// ANONYMOUS REPORT TRACKING TOKEN
// ==========================================

export function generateAnonymousToken(payload: { reportId: string; trackingCode: string }): string {
  const fullPayload: AnonymousTrackingPayload = {
    reportId: payload.reportId,
    trackingCode: payload.trackingCode,
    tokenType: 'ANONYMOUS_REPORT_TRACKING',
  };

  return jwt.sign(fullPayload, env.ANONYMOUS_TOKEN_SECRET, {
    expiresIn: env.ANONYMOUS_TOKEN_EXPIRES_IN as any,
  });
}

export function verifyAnonymousToken(token: string): AnonymousTrackingPayload {
  try {
    const decoded = jwt.verify(token, env.ANONYMOUS_TOKEN_SECRET) as AnonymousTrackingPayload;
    if (decoded.tokenType !== 'ANONYMOUS_REPORT_TRACKING') {
      throw new UnauthorizedError('Invalid anonymous token type');
    }
    return decoded;
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired anonymous tracking token', error);
  }
}
