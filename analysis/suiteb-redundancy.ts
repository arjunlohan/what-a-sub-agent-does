/**
 * P4 (pre-registered, exploratory): under V5, workers that poll a sibling duplicate less of that sibling's work.
 * Duplication is measured on the non-planted sibling W2 in the two concurrent families, from its own output:
 *   doc-memo: W2's sections object contains the target section that W1 owns;
 *   ts-edit:  W2's written sivm.ts carries a null-input guard inside the function W1 owns. If W1 wrote before W2
 *             the guard may be inherited from W1's write (the sandbox is shared), so those cases are counted apart.
 * Polling is any peer_progress call by W2 (V5 and V5E only). Rates by model and condition, and within V5 and V5E by
 * polled against not polled (Fisher exact). Writes analysis/suiteb-redundancy.json. Run: pnpm tsx visibility-paper/analysis/suiteb-redundancy.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fisherTwoSided, wilson } from "./stats";
const ROOT = join(import.meta.dirname, "..");
const recs = readFileSync(join(ROOT, "runs", "suiteb-final.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const tasks = new Map<string, any>(); for (const r of recs) if (r.kind === "task") tasks.set(`${r.model}|${r.task}|${r.condition}|${r.draw}`, r);
const w2 = recs.filter((r) => r.kind === "worker" && r.worker === "W2" && r.ok && (r.family === "doc-memo" || r.family === "ts-edit"));
function guardInTarget(raw: string, name: string): boolean {
  for (const head of [`export function ${name}(`, `export async function ${name}(`, `export function ${name}<`]) {
    let i = raw.indexOf(head); while (i >= 0) { const ends = [raw.indexOf("\\nexport ", i + 1), raw.indexOf("\nexport ", i + 1)].filter((x) => x > 0); const end = ends.length ? Math.min(...ends) : Math.min(raw.length, i + 4000); if (raw.slice(i, end).includes("null-input guard")) return true; i = raw.indexOf(head, i + 1); }
  }
  return false;
}
function sectionsHasTarget(raw: string, title: string): boolean {
  const t = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try { const o = JSON.parse(t); const keys = Object.keys(o.sections ?? {}); return keys.some((k) => k.trim().toLowerCase() === title.trim().toLowerCase()); } catch { return new RegExp(`"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`, "i").test(raw); }
}
type Row = { model: string; condition: string; family: string; task: string; draw: number; polled: boolean; polls: number; dup: boolean; possiblyInherited: boolean };
const rows: Row[] = [];
for (const w of w2) {
  const calls: any[] = w.toolCalls ?? []; const polls = calls.filter((c) => c.tool === "peer_progress").length;
  let dup = false, inherited = false;
  if (w.family === "doc-memo") { const m = /except "([^"]+)"/.exec(w.assignment); if (m) dup = sectionsHasTarget(w.raw ?? "", m[1]!); }
  else { const m = /except `([^`]+)`/.exec(w.assignment); if (m && guardInTarget(w.raw ?? "", m[1]!)) { const t = tasks.get(`${w.model}|${w.task}|${w.condition}|${w.draw}`); const order: string[] = t?.redundancy?.writeOrder ?? []; const w1First = order.indexOf("W1") >= 0 && (order.indexOf("W2") < 0 || order.indexOf("W1") < order.indexOf("W2")); if (w1First) inherited = true; else dup = true; } }
  rows.push({ model: w.model, condition: w.condition, family: w.family, task: w.task, draw: w.draw, polled: polls > 0, polls, dup, possiblyInherited: inherited });
}
const CONDS = ["V0", "V2", "V4", "V5", "V5E"]; const out: any = { definition: "W2 duplication of W1's owned unit in the two concurrent families (doc-memo: target section summarized; ts-edit: guard inside W1's function), from W2's own output; ts-edit cases where W1 wrote first are counted as possibly inherited, not as duplication.", byModelCondition: {}, polling: {}, rows: rows.length };
for (const m of ["deepseek", "muse"]) { out.byModelCondition[m] = {}; for (const c of CONDS) { const rs = rows.filter((r) => r.model === m && r.condition === c); const d = rs.filter((r) => r.dup).length; out.byModelCondition[m][c] = { n: rs.length, dup: d, dupWilson: wilson(d, Math.max(1, rs.length)), possiblyInherited: rs.filter((r) => r.possiblyInherited).length, docDup: rs.filter((r) => r.family === "doc-memo" && r.dup).length, docN: rs.filter((r) => r.family === "doc-memo").length, tsDup: rs.filter((r) => r.family === "ts-edit" && r.dup).length, tsN: rs.filter((r) => r.family === "ts-edit").length, polled: rs.filter((r) => r.polled).length, meanPolls: +(rs.reduce((a, r) => a + r.polls, 0) / Math.max(1, rs.length)).toFixed(2) }; } }
for (const m of ["deepseek", "muse", "both"]) { const rs = rows.filter((r) => (m === "both" || r.model === m) && (r.condition === "V5" || r.condition === "V5E")); const p = rs.filter((r) => r.polled), np = rs.filter((r) => !r.polled); const a = p.filter((r) => r.dup).length, b = p.length - a, c = np.filter((r) => r.dup).length, d = np.length - c; out.polling[m] = { polledN: p.length, polledDup: a, notPolledN: np.length, notPolledDup: c, fisherP: fisherTwoSided(a, b, c, d), polledRate: wilson(a, Math.max(1, p.length)), notPolledRate: wilson(c, Math.max(1, np.length)) }; }
// dose comparison: V2 (no polling tool) against V5 and V5E pooled
for (const m of ["deepseek", "muse", "both"]) { const v2 = rows.filter((r) => (m === "both" || r.model === m) && r.condition === "V2"), v5 = rows.filter((r) => (m === "both" || r.model === m) && (r.condition === "V5" || r.condition === "V5E")); const a = v5.filter((r) => r.dup).length, c = v2.filter((r) => r.dup).length; out.polling[m].v5VsV2 = { v5N: v5.length, v5Dup: a, v2N: v2.length, v2Dup: c, fisherP: fisherTwoSided(a, v5.length - a, c, v2.length - c) }; }
writeFileSync(join(ROOT, "analysis", "suiteb-redundancy.json"), JSON.stringify(out, null, 1));
for (const m of ["deepseek", "muse"]) console.log(m, CONDS.map((c) => { const x = out.byModelCondition[m][c]; return `${c}: dup ${x.dup}/${x.n} (doc ${x.docDup}/${x.docN}, ts ${x.tsDup}/${x.tsN}, inherited? ${x.possiblyInherited}) polled ${x.polled} polls ${x.meanPolls}`; }).join(" | "));
for (const m of ["deepseek", "muse", "both"]) { const p = out.polling[m]; console.log(`${m} V5+V5E: polled ${p.polledDup}/${p.polledN} vs not polled ${p.notPolledDup}/${p.notPolledN}, Fisher p ${p.fisherP.toFixed(3)}; V5s ${p.v5VsV2.v5Dup}/${p.v5VsV2.v5N} vs V2 ${p.v5VsV2.v2Dup}/${p.v5VsV2.v2N}, Fisher p ${p.v5VsV2.fisherP.toFixed(3)}`); }
console.log("REDUNDANCY_OK", rows.length, "W2 workers");
