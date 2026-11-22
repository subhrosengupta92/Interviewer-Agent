import type { Interview } from "./types";

export interface Store {
  get(id: string): Promise<Interview | null>;
  put(interview: Interview): Promise<void>;
  /** Other records (chats), kept in the same table under their own IDs. */
  getDoc<T>(id: string): Promise<T | null>;
  putDoc(id: string, doc: unknown): Promise<void>;
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
  async getDoc<T>(id: string) {
    const r = this.rows.get(id);
    return r ? (JSON.parse(r) as T) : null;
  }
  async putDoc(id: string, doc: unknown) {
    this.rows.set(id, JSON.stringify(doc));
  }
}
