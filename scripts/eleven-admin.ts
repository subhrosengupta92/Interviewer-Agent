/** Small helper for build-time scripts. The key comes from ELEVENLABS_API_KEY. */
const BASE = "https://api.elevenlabs.io";

export async function el<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Set ELEVENLABS_API_KEY");
  const res = await fetch(BASE + path, {
    method,
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : {}) as T;
}
