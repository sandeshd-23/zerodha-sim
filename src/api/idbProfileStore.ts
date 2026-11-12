import { createStore, del, get, set } from 'idb-keyval';
import type { SimulationProfile } from '../types/simulator.ts';
import { summarise, type ProfileStore, type ProfileSummary } from './profileStore.ts';

const INDEX_KEY = '__index__';

/** Profiles saved on the device (IndexedDB), with an index so listing doesn't load every profile. */
export class IdbProfileStore implements ProfileStore {
  private store = createStore('kite-sim', 'profiles');
  private cache = new Map<string, SimulationProfile>();

  private async readIndex(): Promise<ProfileSummary[]> {
    return ((await get(INDEX_KEY, this.store)) as ProfileSummary[] | undefined) || [];
  }

  async list(): Promise<ProfileSummary[]> {
    const idx = await this.readIndex();
    return [...idx].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async get(id: string): Promise<SimulationProfile | null> {
    const cached = this.cache.get(id);
    if (cached) return structuredClone(cached);
    const p = (await get(`p:${id}`, this.store)) as SimulationProfile | undefined;
    if (!p) return null;
    this.cache.set(id, p);
    return structuredClone(p);
  }

  async save(profile: SimulationProfile): Promise<void> {
    const now = new Date().toISOString();
    profile.updatedAt = now;
    if (!profile.createdAt) profile.createdAt = now;
    const copy = structuredClone(profile);
    this.cache.set(profile.id, copy);
    await set(`p:${profile.id}`, copy, this.store);
    const idx = (await this.readIndex()).filter((s) => s.id !== profile.id);
    idx.push(summarise(profile));
    await set(INDEX_KEY, idx, this.store);
  }

  async delete(id: string): Promise<void> {
    this.cache.delete(id);
    await del(`p:${id}`, this.store);
    await set(
      INDEX_KEY,
      (await this.readIndex()).filter((s) => s.id !== id),
      this.store
    );
  }
}
