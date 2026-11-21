import type { Interview } from "./types";

export interface Store {
  get(id: string): Promise<Interview | null>;
  put(interview: Interview): Promise<void>;
}

export class D1Store implements Store {
  constructor(private db: D1Database) {}

  async get(id: string): Promise<Interview | null> {
    const row = await this.db.prepare("SELECT data FROM interviews WHERE id = ?").bind(id).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as Interview) : null;
  }

  async put(interview: Interview): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO interviews (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .bind(interview.id, interview.created_at, JSON.stringify(interview))
      .run();
  }
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
