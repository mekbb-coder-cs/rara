import { Role, TokenType } from '@relieflink/shared';
import { prisma } from '../config/db.js';

export interface UserRecord {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string | null;
  fullName: string | null;
  role: Role;
  isVerifiedResponder: boolean;
  isEmailVerified: boolean;
  badgeNumber: string | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RefreshTokenRecord {
  id: string;
  tokenHash: string;
  familyId: string;
  userId: string;
  isRevoked: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedByTokenHash: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface VerificationTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  type: TokenType;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface IUserRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  createUser(data: {
    email?: string;
    phoneNumber?: string;
    passwordHash: string;
    fullName?: string;
    role?: Role;
    badgeNumber?: string;
  }): Promise<UserRecord>;
  updateUser(id: string, data: Partial<UserRecord>): Promise<UserRecord>;
  getUserRegionIds(userId: string): Promise<string[]>;
  assignUserToRegion(userId: string, regionId: string): Promise<void>;

  // Refresh Tokens
  createRefreshToken(data: {
    tokenHash: string;
    familyId: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshTokenRecord>;
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(id: string, replacedByTokenHash?: string): Promise<void>;
  revokeTokenFamily(familyId: string): Promise<void>;
  revokeAllUserTokens(userId: string): Promise<void>;

  // Verification Tokens
  createVerificationToken(data: {
    userId: string;
    tokenHash: string;
    type: TokenType;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord>;
  findVerificationToken(tokenHash: string, type: TokenType): Promise<VerificationTokenRecord | null>;
  markVerificationTokenUsed(id: string): Promise<void>;
}

// In-Memory Implementation for Tests & Standalone Operation
export class InMemoryUserRepository implements IUserRepository {
  public users: Map<string, UserRecord> = new Map();
  public refreshTokens: Map<string, RefreshTokenRecord> = new Map();
  public verificationTokens: Map<string, VerificationTokenRecord> = new Map();
  public userRegions: Map<string, Set<string>> = new Map();

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) || null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const target = email.toLowerCase();
    for (const user of this.users.values()) {
      if (user.email?.toLowerCase() === target) return user;
    }
    return null;
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.phoneNumber === phone) return user;
    }
    return null;
  }

  async createUser(data: {
    email?: string;
    phoneNumber?: string;
    passwordHash: string;
    fullName?: string;
    role?: Role;
    badgeNumber?: string;
  }): Promise<UserRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const user: UserRecord = {
      id,
      email: data.email?.toLowerCase() || null,
      phoneNumber: data.phoneNumber || null,
      passwordHash: data.passwordHash,
      fullName: data.fullName || null,
      role: data.role || Role.REPORTER,
      isVerifiedResponder: false,
      isEmailVerified: false,
      badgeNumber: data.badgeNumber || null,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    const updated = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async getUserRegionIds(userId: string): Promise<string[]> {
    const regions = this.userRegions.get(userId);
    return regions ? Array.from(regions) : [];
  }

  async assignUserToRegion(userId: string, regionId: string): Promise<void> {
    if (!this.userRegions.has(userId)) {
      this.userRegions.set(userId, new Set());
    }
    this.userRegions.get(userId)!.add(regionId);
  }

  async createRefreshToken(data: {
    tokenHash: string;
    familyId: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshTokenRecord> {
    const id = crypto.randomUUID();
    const record: RefreshTokenRecord = {
      id,
      tokenHash: data.tokenHash,
      familyId: data.familyId,
      userId: data.userId,
      isRevoked: false,
      expiresAt: data.expiresAt,
      revokedAt: null,
      replacedByTokenHash: null,
      ipAddress: data.ipAddress || null,
      userAgent: data.userAgent || null,
      createdAt: new Date(),
    };
    this.refreshTokens.set(data.tokenHash, record);
    return record;
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenHash) || null;
  }

  async revokeRefreshToken(id: string, replacedByTokenHash?: string): Promise<void> {
    for (const [hash, record] of this.refreshTokens.entries()) {
      if (record.id === id) {
        this.refreshTokens.set(hash, {
          ...record,
          isRevoked: true,
          revokedAt: new Date(),
          replacedByTokenHash: replacedByTokenHash || record.replacedByTokenHash,
        });
        break;
      }
    }
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    for (const [hash, record] of this.refreshTokens.entries()) {
      if (record.familyId === familyId) {
        this.refreshTokens.set(hash, {
          ...record,
          isRevoked: true,
          revokedAt: new Date(),
        });
      }
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    for (const [hash, record] of this.refreshTokens.entries()) {
      if (record.userId === userId) {
        this.refreshTokens.set(hash, {
          ...record,
          isRevoked: true,
          revokedAt: new Date(),
        });
      }
    }
  }

  async createVerificationToken(data: {
    userId: string;
    tokenHash: string;
    type: TokenType;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    const id = crypto.randomUUID();
    const record: VerificationTokenRecord = {
      id,
      userId: data.userId,
      tokenHash: data.tokenHash,
      type: data.type,
      expiresAt: data.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    };
    this.verificationTokens.set(data.tokenHash, record);
    return record;
  }

  async findVerificationToken(tokenHash: string, type: TokenType): Promise<VerificationTokenRecord | null> {
    const record = this.verificationTokens.get(tokenHash);
    if (!record || record.type !== type) return null;
    return record;
  }

  async markVerificationTokenUsed(id: string): Promise<void> {
    for (const [hash, record] of this.verificationTokens.entries()) {
      if (record.id === id) {
        this.verificationTokens.set(hash, {
          ...record,
          usedAt: new Date(),
        });
        break;
      }
    }
  }
}

// Prisma Implementation
export class PrismaUserRepository implements IUserRepository {
  async findById(id: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({ where: { id } });
    return (user as unknown as UserRecord) || null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    return (user as unknown as UserRecord) || null;
  }

  async findByPhone(phoneNumber: string): Promise<UserRecord | null> {
    const user = await prisma.user.findUnique({ where: { phoneNumber } });
    return (user as unknown as UserRecord) || null;
  }

  async createUser(data: {
    email?: string;
    phoneNumber?: string;
    passwordHash: string;
    fullName?: string;
    role?: Role;
    badgeNumber?: string;
  }): Promise<UserRecord> {
    const user = await prisma.user.create({
      data: {
        email: data.email?.toLowerCase(),
        phoneNumber: data.phoneNumber,
        passwordHash: data.passwordHash,
        fullName: data.fullName,
        role: data.role as any,
        badgeNumber: data.badgeNumber,
      },
    });
    return user as unknown as UserRecord;
  }

  async updateUser(id: string, data: Partial<UserRecord>): Promise<UserRecord> {
    const user = await prisma.user.update({
      where: { id },
      data: data as any,
    });
    return user as unknown as UserRecord;
  }

  async getUserRegionIds(userId: string): Promise<string[]> {
    const userRegions = await prisma.userRegion.findMany({
      where: { userId },
      select: { regionId: true },
    });
    return userRegions.map((ur) => ur.regionId);
  }

  async assignUserToRegion(userId: string, regionId: string): Promise<void> {
    await prisma.userRegion.upsert({
      where: {
        userId_regionId: { userId, regionId },
      },
      create: { userId, regionId },
      update: {},
    });
  }

  async createRefreshToken(data: {
    tokenHash: string;
    familyId: string;
    userId: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<RefreshTokenRecord> {
    const token = await prisma.refreshToken.create({
      data: {
        tokenHash: data.tokenHash,
        familyId: data.familyId,
        userId: data.userId,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
    return token as unknown as RefreshTokenRecord;
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const token = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    return (token as unknown as RefreshTokenRecord) || null;
  }

  async revokeRefreshToken(id: string, replacedByTokenHash?: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        replacedByTokenHash,
      },
    });
  }

  async revokeTokenFamily(familyId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { familyId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  async createVerificationToken(data: {
    userId: string;
    tokenHash: string;
    type: TokenType;
    expiresAt: Date;
  }): Promise<VerificationTokenRecord> {
    const token = await prisma.verificationToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        type: data.type as any,
        expiresAt: data.expiresAt,
      },
    });
    return token as unknown as VerificationTokenRecord;
  }

  async findVerificationToken(tokenHash: string, type: TokenType): Promise<VerificationTokenRecord | null> {
    const token = await prisma.verificationToken.findFirst({
      where: { tokenHash, type: type as any },
    });
    return (token as unknown as VerificationTokenRecord) || null;
  }

  async markVerificationTokenUsed(id: string): Promise<void> {
    await prisma.verificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}

// Factory instantiation
export const userRepository: IUserRepository =
  process.env.NODE_ENV === 'test' ? new InMemoryUserRepository() : new PrismaUserRepository();
