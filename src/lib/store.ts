import type { Interview } from "./types";

export interface Store {
  get(id: string): Promise<Interview | null>;
  put(interview: Interview): Promise<void>;
}

export class MemoryStore implements Store {
  private rows = new Map<string, string>();
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? (JSON.parse(r) as Interview) : null;
  }
  async put(interview: Interview) {
    this.rows.set(interview.id, JSON.stringify(interview));
  }
}
