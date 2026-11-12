import type { SimulationProfile } from '../types/simulator.ts';

export interface ProfileSummary {
  id: string;
  name: string;
  updatedAt: string;
  currentDate: string;
  startingCapital: number;
}

/** Persistence for simulation profiles (SQLite on the PC, IndexedDB on the phone). */
export interface ProfileStore {
  /** Newest first (by updatedAt). */
  list(): Promise<ProfileSummary[]>;
  get(id: string): Promise<SimulationProfile | null>;
  /** Sets profile.updatedAt to now and persists. */
  save(profile: SimulationProfile): Promise<void>;
  delete(id: string): Promise<void>;
}

export function summarise(p: SimulationProfile): ProfileSummary {
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    currentDate: p.currentDate || '2015-01-01',
    startingCapital: p.startingCapital || 200000,
  };
}

/** In-memory store (tests, parity checks). */
export class MemoryProfileStore implements ProfileStore {
  private map = new Map<string, string>();
  async list() {
    return Array.from(this.map.values())
      .map((s) => summarise(JSON.parse(s)))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }
  async get(id: string) {
    const s = this.map.get(id);
    return s ? (JSON.parse(s) as SimulationProfile) : null;
  }
  async save(profile: SimulationProfile) {
    const now = new Date().toISOString();
    profile.updatedAt = now;
    if (!profile.createdAt) profile.createdAt = now;
    this.map.set(profile.id, JSON.stringify(profile));
  }
  async delete(id: string) {
    this.map.delete(id);
  }
}
