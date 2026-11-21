/** Pulls the first JSON object out of model output that may be fenced or wrapped in prose. */
export function extractJson<T = unknown>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [trimmed, fenced?.[1]?.trim()];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as T;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("No JSON object found in model output");
}
