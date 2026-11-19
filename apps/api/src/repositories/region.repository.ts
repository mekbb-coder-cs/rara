import { prisma } from '../config/db.js';

export interface RegionRecord {
  id: string;
  code: string;
  name: string;
  country: string;
  state: string | null;
  centerLat: Float64Array | number;
  centerLng: Float64Array | number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRegionRepository {
  findById(id: string): Promise<RegionRecord | null>;
  findByCode(code: string): Promise<RegionRecord | null>;
  createRegion(data: {
    code: string;
    name: string;
    country: string;
    state?: string;
    centerLat: number;
    centerLng: number;
  }): Promise<RegionRecord>;
  listActiveRegions(): Promise<RegionRecord[]>;
}

export class InMemoryRegionRepository implements IRegionRepository {
  public regions: Map<string, RegionRecord> = new Map();

  async findById(id: string): Promise<RegionRecord | null> {
    return this.regions.get(id) || null;
  }

  async findByCode(code: string): Promise<RegionRecord | null> {
    for (const r of this.regions.values()) {
      if (r.code === code) return r;
    }
    return null;
  }

  async createRegion(data: {
    code: string;
    name: string;
    country: string;
    state?: string;
    centerLat: number;
    centerLng: number;
  }): Promise<RegionRecord> {
    const id = crypto.randomUUID();
    const now = new Date();
    const region: RegionRecord = {
      id,
      code: data.code,
      name: data.name,
      country: data.country,
      state: data.state || null,
      centerLat: data.centerLat,
      centerLng: data.centerLng,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.regions.set(id, region);
    return region;
  }

  async listActiveRegions(): Promise<RegionRecord[]> {
    return Array.from(this.regions.values()).filter((r) => r.isActive);
  }
}

export class PrismaRegionRepository implements IRegionRepository {
  async findById(id: string): Promise<RegionRecord | null> {
    const region = await prisma.region.findUnique({ where: { id } });
    return (region as unknown as RegionRecord) || null;
  }

  async findByCode(code: string): Promise<RegionRecord | null> {
    const region = await prisma.region.findUnique({ where: { code } });
    return (region as unknown as RegionRecord) || null;
  }

  async createRegion(data: {
    code: string;
    name: string;
    country: string;
    state?: string;
    centerLat: number;
    centerLng: number;
  }): Promise<RegionRecord> {
    const region = await prisma.region.create({
      data: {
        code: data.code,
        name: data.name,
        country: data.country,
        state: data.state,
        centerLat: data.centerLat,
        centerLng: data.centerLng,
      },
    });
    return region as unknown as RegionRecord;
  }

  async listActiveRegions(): Promise<RegionRecord[]> {
    const regions = await prisma.region.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return regions as unknown as RegionRecord[];
  }
}

export const regionRepository: IRegionRepository =
  process.env.NODE_ENV === 'test' ? new InMemoryRegionRepository() : new PrismaRegionRepository();
