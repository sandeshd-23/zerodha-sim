import { deleteProfileById, getProfileById, listProfiles, saveProfile } from './db.ts';
import type { ProfileStore } from '../src/api/profileStore.ts';
import type { SimulationProfile } from '../src/types/simulator.ts';

export class SqliteProfileStore implements ProfileStore {
  async list() {
    return listProfiles();
  }
  async get(id: string) {
    return getProfileById(id);
  }
  async save(profile: SimulationProfile) {
    saveProfile(profile);
  }
  async delete(id: string) {
    deleteProfileById(id);
  }
}
