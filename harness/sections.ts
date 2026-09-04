/** Shared README section splitter (Suite A generator and fixture tests use the same code, so target titles agree). */
export type Section = { title: string; body: string; level: number };
export const cleanTitle = (t: string) => t.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/`/g, "").replace(/<[^>]+>/g, "").replace(/[^\w\s?'.+()\/:-]/g, "").replace(/\s+/g, " ").trim();
export function sectionize(doc: string): Section[] {
  const lines = doc.split("\n"); const secs: Section[] = []; let cur: Section = { title: "intro", body: "", level: 0 };
  for (const line of lines) { const m = /^(#{1,3})\s+(.*)$/.exec(line); if (m && !(m[1] === "#" && secs.length === 0 && !cur.body.trim())) { secs.push(cur); cur = { title: cleanTitle(m[2]!), body: "", level: m[1]!.length }; } else if (!m) cur.body += line + "\n"; }
  secs.push(cur); return secs.filter((s) => s.body.trim().length > 0);
}

/** Titles of the sections nested under `target` (deeper headings that follow it before the next heading of its level or shallower). */
export function nestedUnder(secs: Section[], target: string): Set<string> {
  const out = new Set<string>(); const i = secs.findIndex((s) => s.title === target); if (i < 0) return out;
  for (let k = i + 1; k < secs.length; k++) { if (secs[k]!.level <= secs[i]!.level) break; out.add(secs[k]!.title); }
  return out;
}
/** Fold every subsection into the nearest preceding shallower section, so a section's text includes its subsections (used for marker generation; the flat split is what the Suite A items were frozen with). */
export function mergeSubsections(secs: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of secs) { const parent = out.length && s.level > out[out.length - 1]!.level && out[out.length - 1]!.level > 0 ? out[out.length - 1]! : null; if (parent) parent.body += "\n" + s.body; else out.push({ ...s }); }
  return out;
}
