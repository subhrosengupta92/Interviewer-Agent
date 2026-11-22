import type { Interview } from "./types";

export interface Store {
  get(id: string): Promise<Interview | null>;
  put(interview: Interview): Promise<void>;
  /** Other records (chats), kept in the same table under their own IDs. */
  getDoc<T>(id: string): Promise<T | null>;
  putDoc(id: string, doc: unknown): Promise<void>;
  /** The most recent interviews (not chats), newest first. */
  recentInterviews(limit: number): Promise<Interview[]>;
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
  async recentInterviews(limit: number) {
    return [...this.rows.values()]
      .map((r) => JSON.parse(r) as Interview)
      .filter((r) => (r as { kind?: string }).kind === undefined && r.input)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  }
}
