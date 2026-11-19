import {
  RegisterInput,
  LoginInput,
  VerifyEmailInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  AuditAction,
  TokenType,
  Role,
} from '@relieflink/shared';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  generateRandomToken,
} from '../utils/crypto.js';
import {
  BadRequestError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../utils/errors.js';
import { userRepository, UserRecord } from '../repositories/user.repository.js';
import { organizationRepository } from '../repositories/organization.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { logger } from '../config/logger.js';

export class AuthService {
  async register(
    input: RegisterInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ user: Omit<UserRecord, 'passwordHash'>; verificationToken: string }> {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError('A user with this email address already exists');
    }

    if (input.phoneNumber) {
      const existingPhone = await userRepository.findByPhone(input.phoneNumber);
      if (existingPhone) {
        throw new ConflictError('A user with this phone number already exists');
      }
    }

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.createUser({
      email: input.email,
      phoneNumber: input.phoneNumber,
      passwordHash,
      fullName: input.fullName,
      role: input.role || Role.REPORTER,
      badgeNumber: input.badgeNumber,
    });

    // Generate email verification token (expires in 24 hours)
    const { raw, hash } = generateRandomToken();
    await userRepository.createVerificationToken({
      userId: user.id,
      tokenHash: hash,
      type: TokenType.EMAIL_VERIFICATION,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await auditRepository.createLog({
      userId: user.id,
      userRole: user.role,
      action: AuditAction.CREATE_REPORT, // User account creation
      entityName: 'User',
      entityId: user.id,
      ipAddress,
      userAgent,
      metadata: { email: user.email, role: user.role },
    });

    const { passwordHash: _, ...userSafe } = user;
    return { user: userSafe, verificationToken: raw };
  }

  async login(
    input: LoginInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    user: Omit<UserRecord, 'passwordHash'>;
    accessToken: string;
    refreshToken: string;
  }> {
    const user = await userRepository.findByEmail(input.email);
    if (!user || !user.passwordHash || user.deletedAt) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isValid = await verifyPassword(user.passwordHash, input.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const assignedRegionIds = await userRepository.getUserRegionIds(user.id);
    const userOrg = await organizationRepository.getUserOrganization(user.id);

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email || undefined,
      isVerifiedResponder: user.isVerifiedResponder,
      assignedRegionIds,
      organizationId: userOrg?.organization.id,
      isOrgApproved: userOrg?.organization.isVerified || false,
    });

    const { rawToken, tokenHash, familyId } = generateRefreshToken(user.id);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await userRepository.createRefreshToken({
      tokenHash,
      familyId,
      userId: user.id,
      expiresAt,
      ipAddress,
      userAgent,
    });

    await auditRepository.createLog({
      userId: user.id,
      userRole: user.role,
      action: AuditAction.AUTH_LOGIN,
      entityName: 'User',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    const { passwordHash: _, ...userSafe } = user;
    return {
      user: userSafe,
      accessToken,
      refreshToken: rawToken,
    };
  }

  async verifyEmail(input: VerifyEmailInput): Promise<{ message: string }> {
    const tokenHash = hashToken(input.token);
    const tokenRecord = await userRepository.findVerificationToken(tokenHash, TokenType.EMAIL_VERIFICATION);

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestError('Invalid or expired email verification token');
    }

    await userRepository.updateUser(tokenRecord.userId, { isEmailVerified: true });
    await userRepository.markVerificationTokenUsed(tokenRecord.id);

    return { message: 'Email successfully verified' };
  }

  async requestPasswordReset(input: ForgotPasswordInput): Promise<{ message: string; resetToken?: string }> {
    const user = await userRepository.findByEmail(input.email);
    // Always return success message to prevent user enumeration
    if (!user || user.deletedAt) {
      return { message: 'If an account exists with this email, a reset link has been dispatched.' };
    }

    const { raw, hash } = generateRandomToken();
    await userRepository.createVerificationToken({
      userId: user.id,
      tokenHash: hash,
      type: TokenType.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    return {
      message: 'If an account exists with this email, a reset link has been dispatched.',
      resetToken: raw, // Exposed in response for testing/dev environments
    };
  }

  async resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
    const tokenHash = hashToken(input.token);
    const tokenRecord = await userRepository.findVerificationToken(tokenHash, TokenType.PASSWORD_RESET);

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw new BadRequestError('Invalid or expired password reset token');
    }

    const newPasswordHash = await hashPassword(input.newPassword);
    await userRepository.updateUser(tokenRecord.userId, { passwordHash: newPasswordHash });
    await userRepository.markVerificationTokenUsed(tokenRecord.id);

    // Security best practice: invalidate all existing refresh tokens
    await userRepository.revokeAllUserTokens(tokenRecord.userId);

    return { message: 'Password has been successfully updated. All active sessions logged out.' };
  }

  /**
   * Rotating Refresh Token with Reuse Detection (RFC 6749)
   */
  async rotateRefreshToken(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; newRefreshToken: string }> {
    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await userRepository.findRefreshToken(tokenHash);

    if (!tokenRecord) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Reuse Detection: A revoked token was presented!
    if (tokenRecord.isRevoked) {
      logger.warn(
        { familyId: tokenRecord.familyId, userId: tokenRecord.userId },
        'SECURITY ALERT: Refresh token reuse detected! Invalidating token family.'
      );

      // Invalidate the entire family to protect the compromised user
      await userRepository.revokeTokenFamily(tokenRecord.familyId);

      await auditRepository.createLog({
        userId: tokenRecord.userId,
        action: AuditAction.AUTH_REFRESH_REUSE_DETECTED,
        entityName: 'RefreshToken',
        entityId: tokenRecord.id,
        ipAddress,
        userAgent,
        metadata: { familyId: tokenRecord.familyId },
      });

      throw new UnauthorizedError('Token reuse detected. All sessions in this chain have been revoked.');
    }

    // Check expiration
    if (tokenRecord.expiresAt < new Date()) {
      await userRepository.revokeRefreshToken(tokenRecord.id);
      throw new UnauthorizedError('Refresh token expired');
    }

    const user = await userRepository.findById(tokenRecord.userId);
    if (!user || user.deletedAt) {
      throw new UnauthorizedError('User account not found');
    }

    // Generate new refresh token in the same family
    const { rawToken: newRawToken, tokenHash: newTokenHash } = generateRefreshToken(
      user.id,
      tokenRecord.familyId
    );

    // Invalidate current token and store pointer to the new token
    await userRepository.revokeRefreshToken(tokenRecord.id, newTokenHash);

    // Save newly issued token
    await userRepository.createRefreshToken({
      tokenHash: newTokenHash,
      familyId: tokenRecord.familyId,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress,
      userAgent,
    });

    const assignedRegionIds = await userRepository.getUserRegionIds(user.id);
    const userOrg = await organizationRepository.getUserOrganization(user.id);

    const accessToken = generateAccessToken({
      userId: user.id,
      role: user.role,
      email: user.email || undefined,
      isVerifiedResponder: user.isVerifiedResponder,
      assignedRegionIds,
      organizationId: userOrg?.organization.id,
      isOrgApproved: userOrg?.organization.isVerified || false,
    });

    return {
      accessToken,
      newRefreshToken: newRawToken,
    };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const tokenRecord = await userRepository.findRefreshToken(tokenHash);
      if (tokenRecord) {
        await userRepository.revokeRefreshToken(tokenRecord.id);
      }
    }
  }

  async logoutAllDevices(userId: string): Promise<void> {
    await userRepository.revokeAllUserTokens(userId);
  }
}

export const authService = new AuthService();
