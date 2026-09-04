/**
 * Independent verifier: re-derives every verdict from the stored raw output
 * with the checker, compares with the stored verdict, and recomputes the
 * per-cell DEVIATED counts with plain loops. Prints mismatches; exits 1 if
 * any verdict disagrees. Run: pnpm tsx visibility-paper/analysis/verify-pilot.ts [label]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../harness/checkers";
import { loadItems } from "../harness/items";
import type { RunRecord } from "../harness/run";

const label = process.argv[2] ?? "pilot";
const ROOT = join(import.meta.dirname, "..");
const items = new Map(loadItems().map((it) => [it.id, it]));
const last = new Map<string, RunRecord>();
for (const l of readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l) as RunRecord; last.set(r.key, r); }
let mismatches = 0; const counts: Record<string, { n: number; deviated: number }> = {};
for (const r of last.values()) {
  if (!r.ok || !r.pinned) continue;
  const it = items.get(r.item); if (!it) { console.log(`MISSING ITEM ${r.item}`); mismatches++; continue; }
  const v = check(it, r.raw, { finishReason: r.finishReason }).verdict;
  if (v !== r.verdict) { mismatches++; console.log(`MISMATCH ${r.key}: stored ${r.verdict}, recomputed ${v}`); }
  const k = `${r.model}|${r.condition}`; counts[k] ??= { n: 0, deviated: 0 }; counts[k].n++; if (v === "DEVIATED") counts[k].deviated++;
}
const summary = JSON.parse(readFileSync(join(ROOT, "analysis", `${label}-summary.json`), "utf8"));
for (const [k, c] of Object.entries(counts)) {
  const [m, cond] = k.split("|"); const t = summary.table?.[m]?.[cond];
  if (!t || t.n !== c.n || t.counts.DEVIATED !== c.deviated) { mismatches++; console.log(`TABLE MISMATCH ${k}: verifier ${c.deviated}/${c.n}, summary ${t?.counts?.DEVIATED}/${t?.n}`); }
}
console.log(JSON.stringify(counts));
console.log(mismatches ? `VERIFY_FAIL ${mismatches}` : "VERIFY_OK");
process.exit(mismatches ? 1 : 0);
