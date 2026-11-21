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
}
