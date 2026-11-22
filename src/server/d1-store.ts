import type { Store } from "../lib/store";
import type { Interview } from "../lib/types";

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

  async getDoc<T>(id: string): Promise<T | null> {
    const row = await this.db.prepare("SELECT data FROM interviews WHERE id = ?").bind(id).first<{ data: string }>();
    return row ? (JSON.parse(row.data) as T) : null;
  }

  async putDoc(id: string, doc: unknown): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO interviews (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .bind(id, Date.now(), JSON.stringify(doc))
      .run();
  }

  async recentInterviews(limit: number): Promise<Interview[]> {
    const { results } = await this.db
      .prepare("SELECT data FROM interviews WHERE id NOT LIKE 'chat_%' AND id NOT LIKE 'recruit_%' AND id NOT LIKE 'jd_%' ORDER BY created_at DESC LIMIT ?")
      .bind(limit)
      .all<{ data: string }>();
    // Other records share this table; anything that is not an interview is dropped even if its ID is unfamiliar.
    return results.map((r) => JSON.parse(r.data) as Interview).filter((r) => (r as { kind?: string }).kind === undefined && !!r.input);
  }
}
