import type { Store } from "../src/lib/store";
import type { Interview } from "../src/lib/types";

/** The deployed D1 database, reached over Cloudflare's HTTP API, for scripts that run outside Cloudflare. */
export function remoteStore(): Store {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Set ${k}`);
    return v;
  };
  const url = `https://api.cloudflare.com/client/v4/accounts/${need("CLOUDFLARE_ACCOUNT_ID")}/d1/database/${need("D1_DATABASE_ID")}/query`;
  const token = need("CLOUDFLARE_API_TOKEN");
  async function d1(sql: string, params: unknown[] = []) {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const data = (await res.json()) as any;
    if (!data.success) throw new Error(`D1: ${JSON.stringify(data.errors)}`);
    return data.result[0].results as any[];
  }
  return {
    async get(id) {
      const rows = await d1("SELECT data FROM interviews WHERE id = ?", [id]);
      return rows[0] ? (JSON.parse(rows[0].data) as Interview) : null;
    },
    async getDoc<T>(id: string) {
      const rows = await d1("SELECT data FROM interviews WHERE id = ?", [id]);
      return rows[0] ? (JSON.parse(rows[0].data) as T) : null;
    },
    async putDoc(id, doc) {
      await d1(
        "INSERT INTO interviews (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        [id, Date.now(), JSON.stringify(doc)],
      );
    },
    async put(iv) {
      await d1(
        "INSERT INTO interviews (id, created_at, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
        [iv.id, iv.created_at, JSON.stringify(iv)],
      );
    },
  };
}
