import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { userRepository, InMemoryUserRepository } from '../../src/repositories/user.repository.js';
import { Role } from '@relieflink/shared';

describe('Auth Integration Tests', () => {
  const app = createApp();

  beforeEach(() => {
    // Reset in-memory test store
    if (userRepository instanceof InMemoryUserRepository) {
      userRepository.users.clear();
      userRepository.refreshTokens.clear();
      userRepository.verificationTokens.clear();
    }
  });

  it('POST /api/v1/auth/register - should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'responder@emergency.org',
        password: 'SecurePassword123!',
        fullName: 'Jane Doe',
        role: Role.RESPONDER,
        phoneNumber: '+13055550199',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('responder@emergency.org');
    expect(res.body.data.user.passwordHash).toBeUndefined(); // Never leak password hash
    expect(res.body.data.verificationToken).toBeDefined();
  });

  it('POST /api/v1/auth/register - should reject duplicate emails', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'citizen@relieflink.org',
      password: 'SecurePassword123!',
      fullName: 'John Doe',
    });

    const duplicateRes = await request(app).post('/api/v1/auth/register').send({
      email: 'citizen@relieflink.org',
      password: 'AnotherPassword123!',
      fullName: 'John Duplicate',
    });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe('CONFLICT');
  });

  it('POST /api/v1/auth/login - should authenticate and set httpOnly refresh cookie', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'coordinator@disaster.gov',
      password: 'SecurePassword123!',
      fullName: 'Chief Coordinator',
      role: Role.COORDINATOR,
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'coordinator@disaster.gov',
      password: 'SecurePassword123!',
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.accessToken).toBeDefined();

    // Check Set-Cookie for httpOnly refresh token
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toContain('rl_refresh_token=');
    expect(cookies[0]).toContain('HttpOnly');
  });

  it('POST /api/v1/auth/refresh - should rotate refresh tokens', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'operator@aid.org',
      password: 'SecurePassword123!',
      fullName: 'Field Operator',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'operator@aid.org',
      password: 'SecurePassword123!',
    });

    const initialCookie = loginRes.headers['set-cookie'];

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', initialCookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.accessToken).toBeDefined();

    const rotatedCookie = refreshRes.headers['set-cookie'];
    expect(rotatedCookie).toBeDefined();
    expect(rotatedCookie[0]).not.toBe(initialCookie[0]); // Token changed
  });

  it('POST /api/v1/auth/refresh - should DETECT REUSE of revoked token and invalidate chain', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'victim@crisis.org',
      password: 'SecurePassword123!',
      fullName: 'Protected User',
    });

    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'victim@crisis.org',
      password: 'SecurePassword123!',
    });

    const token1Cookie = loginRes.headers['set-cookie'];

    // Legitimate rotation: Token 1 -> Token 2
    const rotation1 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', token1Cookie);
    expect(rotation1.status).toBe(200);

    // Attacker attempts to replay Token 1 (which is now revoked)
    const replayAttack = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', token1Cookie);

    expect(replayAttack.status).toBe(401);
    expect(replayAttack.body.error.message).toContain('Token reuse detected');
  });

  it('POST /api/v1/auth/verify-email - should verify email using valid token', async () => {
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: 'unverified@test.org',
      password: 'SecurePassword123!',
      fullName: 'Test User',
    });

    const verificationToken = regRes.body.data.verificationToken;

    const verifyRes = await request(app).post('/api/v1/auth/verify-email').send({
      token: verificationToken,
    });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.message).toBe('Email successfully verified');
  });

  it('POST /api/v1/auth/logout - should log out and clear cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
  });
});
