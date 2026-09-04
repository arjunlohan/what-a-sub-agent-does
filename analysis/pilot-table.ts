/**
 * Pilot table from runs/<label>.jsonl: per model x condition verdict rates,
 * the draw-disagreement floor, cost, latency, reasoning tokens. Writes
 * analysis/<label>-summary.json and prints a markdown table. Every number in
 * the decision package comes from this file, never from prose.
 * Run: pnpm tsx visibility-paper/analysis/pilot-table.ts [label]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { VERDICTS } from "../harness/checkers";
import type { RunRecord } from "../harness/run";
import { wilson, binomTwoSided, fisherTwoSided, cochranArmitage, icc1 } from "./stats";

const label = process.argv[2] ?? "pilot";
const ROOT = join(import.meta.dirname, "..");
const lines = readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n").filter((l) => l.trim());
const last = new Map<string, RunRecord>();
for (const l of lines) { const r = JSON.parse(l) as RunRecord; last.set(r.key, r); }
const all = [...last.values()];
const usable = all.filter((r) => r.ok && r.pinned);
const excluded = { callFailed: all.filter((r) => !r.ok).length, unpinned: all.filter((r) => r.ok && !r.pinned).length };

type Cell = { n: number; counts: Record<string, number>; rates: Record<string, number>; latencyMs: number; latencyP95Ms: number; inputTokens: number; reasoningTokens: number; outputTokens: number; costPerRun: number; cost: number; disagreement: number | null; flaggedConflictRuns: number };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function cell(rs: RunRecord[]): Cell {
  const counts: Record<string, number> = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  for (const r of rs) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const rates = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, rs.length ? v / rs.length : 0]));
  const byItem = new Map<string, RunRecord[]>();
  for (const r of rs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]);
  const multi = [...byItem.values()].filter((g) => g.length > 1);
  const disagreement = multi.length ? multi.filter((g) => new Set(g.map((r) => r.verdict)).size > 1).length / multi.length : null;
  const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
  return { n: rs.length, counts, rates, latencyMs: Math.round(mean(rs.map((r) => r.latencyMs))), latencyP95Ms: lat.length ? lat[Math.min(lat.length - 1, Math.floor(0.95 * lat.length))]! : 0, inputTokens: Math.round(mean(rs.map((r) => r.inputTokens ?? 0))), flaggedConflictRuns: rs.filter((r) => r.verdict === "FLAGGED" && (r as any).flaggedConflict).length, reasoningTokens: Math.round(mean(rs.map((r) => r.reasoningTokens ?? 0))), outputTokens: Math.round(mean(rs.map((r) => r.outputTokens ?? 0))), costPerRun: mean(rs.map((r) => r.cost ?? 0)), cost: rs.reduce((a, r) => a + (r.cost ?? 0), 0), disagreement };
}
const models = [...new Set(usable.map((r) => r.model))].sort();
const conds = [...new Set(usable.map((r) => r.condition))].sort();
const domains = [...new Set(usable.map((r) => r.domain))].sort();
const table: Record<string, Record<string, Cell>> = {};
for (const m of models) { table[m] = {}; for (const c of conds) table[m][c] = cell(usable.filter((r) => r.model === m && r.condition === c)); }
const byDomain: Record<string, Record<string, Record<string, Cell>>> = {};
for (const m of models) { byDomain[m] = {}; for (const d of domains) { byDomain[m][d] = {}; for (const c of conds) byDomain[m][d][c] = cell(usable.filter((r) => r.model === m && r.domain === d && r.condition === c)); } }
const bySalience: Record<string, Record<string, Record<string, Cell>>> = {};
for (const m of models) { bySalience[m] = {}; for (const s of ["blatant", "subtle"]) { bySalience[m][s] = {}; for (const c of conds) bySalience[m][s][c] = cell(usable.filter((r) => r.model === m && r.salience === s && r.condition === c)); } }
const contextChars = Object.fromEntries(conds.map((c) => [c, Math.round(mean(usable.filter((r) => r.condition === c).map((r) => r.contextChars)))]));
// ---------------------------------------------------------------- item-level analysis (the item is the unit; draws are near-replicates)
type ItemCell = { nItems: number; itemsAnyDev: number; itemsAllDev: number; itemsAnyFlag: number; announcedRuns: number; silentRuns: number; devItems: string[]; icc: number | null; unstableItems: number; pairs: Record<string, number> };
const itemCell = (rs: RunRecord[]): ItemCell => {
  const byItem = new Map<string, RunRecord[]>(); for (const r of rs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]);
  const groups = [...byItem.values()];
  const dev = (r: RunRecord) => r.verdict === "DEVIATED";
  const devItems = groups.filter((g) => g.some(dev)).map((g) => g[0]!.item).sort();
  const pairs: Record<string, number> = {}; let unstable = 0;
  for (const g of groups) { const vs = [...new Set(g.map((r) => r.verdict))].sort(); if (vs.length > 1) { unstable++; const k = vs.join("/"); pairs[k] = (pairs[k] ?? 0) + 1; } }
  const equal = groups.every((g) => g.length === groups[0]!.length);
  return { nItems: groups.length, itemsAnyDev: devItems.length, itemsAllDev: groups.filter((g) => g.every(dev)).length, itemsAnyFlag: groups.filter((g) => g.some((r) => r.verdict === "FLAGGED")).length, announcedRuns: rs.filter((r) => dev(r) && r.concerns.length > 0).length, silentRuns: rs.filter((r) => dev(r) && r.concerns.length === 0).length, devItems, icc: equal ? icc1(groups.map((g) => g.map((r) => (dev(r) ? 1 : 0)))) : null, unstableItems: unstable, pairs };
};
const items: Record<string, Record<string, ItemCell>> = {};
for (const m of models) { items[m] = {}; for (const c of conds) items[m][c] = itemCell(usable.filter((r) => r.model === m && r.condition === c)); }
const devSet = (m: string, c: string) => new Set(items[m]?.[c]?.devItems ?? []);
const PAIRS: Array<[string, string]> = [["V0", "V2"], ["V0", "V4"], ["LM4", "V4"], ["V2", "V4"], ["LM4", "V2"]];
const paired: Record<string, Array<{ a: string; b: string; nItems: number; devA: number; devB: number; onlyA: number; onlyB: number; both: number; mcnemar_p: number; fisher_p: number; wilsonA: any; wilsonB: any }>> = {};
for (const m of models) { paired[m] = []; for (const [a, b] of PAIRS) { if (!(conds as string[]).includes(a) || !(conds as string[]).includes(b)) continue; const A = devSet(m, a), B = devSet(m, b); const n = items[m][a].nItems; const onlyA = [...A].filter((i) => !B.has(i)).length, onlyB = [...B].filter((i) => !A.has(i)).length, both = [...A].filter((i) => B.has(i)).length; paired[m].push({ a, b, nItems: n, devA: A.size, devB: B.size, onlyA, onlyB, both, mcnemar_p: binomTwoSided(Math.min(onlyA, onlyB), onlyA + onlyB), fisher_p: fisherTwoSided(B.size, n - B.size, A.size, n - A.size), wilsonA: wilson(A.size, n), wilsonB: wilson(B.size, n) }); } }
const DOSE: Record<string, number> = { V0: 0, V1: 1, V2: 2, V3: 3, V4: 4 };
const trend: Record<string, { conds: string[]; counts: number[]; nItems: number; z: number; p: number }> = {};
for (const m of models) { const cs = conds.filter((c) => c in DOSE).sort((x, y) => DOSE[x] - DOSE[y]); const t = cochranArmitage(cs.map((c) => ({ k: items[m][c].itemsAnyDev, n: items[m][c].nItems, score: DOSE[c] }))); trend[m] = { conds: cs, counts: cs.map((c) => items[m][c].itemsAnyDev), nItems: items[m][cs[0]!].nItems, z: t.z, p: t.p }; }
const floor = Object.fromEntries(models.map((m) => [m, Math.max(...["V0", "LM2", "LM4"].filter((c) => (conds as string[]).includes(c)).map((c) => table[m][c].disagreement ?? 0))]));
const crosstab: Record<string, Record<string, Record<string, string>>> = {};
for (const m of models) { crosstab[m] = {}; for (const it of [...new Set(usable.map((r) => r.item))].sort()) { crosstab[m][it] = {}; for (const c of conds) { const g = usable.filter((r) => r.model === m && r.item === it && r.condition === c); const cnt: Record<string, number> = {}; for (const r of g) cnt[r.verdict] = (cnt[r.verdict] ?? 0) + 1; const maj = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "-"; crosstab[m][it][c] = Object.keys(cnt).length > 1 ? `${maj}*` : maj; } } }
const checkerHashes = [...new Set(usable.map((r) => (r as any).checkerHash).filter(Boolean))];
const summary = { label, generatedAt: new Date().toISOString(), records: all.length, usable: usable.length, excluded, models, conditions: conds, domains, contextChars, checkerHashes, table, items, paired, trend, floor, crosstab, byDomain, bySalience, totalCost: usable.reduce((a, r) => a + (r.cost ?? 0), 0) + all.filter((r) => !r.pinned && r.ok).reduce((a, r) => a + (r.cost ?? 0), 0) };
writeFileSync(join(ROOT, "analysis", `${label}-summary.json`), JSON.stringify(summary, null, 1));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(`# ${label}: ${usable.length} usable runs (${excluded.callFailed} call failures, ${excluded.unpinned} unpinned excluded), total cost $${summary.totalCost.toFixed(4)}\n`);
console.log(`| model | cond | n | ${VERDICTS.join(" | ")} | draw disagreement | latency ms | reasoning tok | $/run |`);
console.log(`|---|---|---|${VERDICTS.map(() => "---").join("|")}|---|---|---|---|`);
for (const m of models) for (const c of conds) { const t = table[m][c]; console.log(`| ${m} | ${c} | ${t.n} | ${VERDICTS.map((v) => pct(t.rates[v] ?? 0)).join(" | ")} | ${t.disagreement === null ? "n/a" : pct(t.disagreement)} | ${t.latencyMs} | ${t.reasoningTokens} | ${t.costPerRun.toFixed(5)} |`); }
console.log(`\n## DEVIATED by domain (count/n)`);
console.log(`| model | domain | ${conds.join(" | ")} |`); console.log(`|---|---|${conds.map(() => "---").join("|")}|`);
for (const m of models) for (const d of domains) console.log(`| ${m} | ${d} | ${conds.map((c) => `${byDomain[m][d][c].counts.DEVIATED}/${byDomain[m][d][c].n}`).join(" | ")} |`);
console.log(`\n## DEVIATED by salience (count/n)`);
for (const m of models) for (const s of ["blatant", "subtle"]) console.log(`| ${m} | ${s} | ${conds.map((c) => `${bySalience[m][s][c].counts.DEVIATED}/${bySalience[m][s][c].n}`).join(" | ")} |`);
console.log(`\n## Item level (the unit of analysis): items with any DEVIATED draw / items, Wilson 95%, announced vs silent DEVIATED runs, ICC of the DEVIATED indicator, unstable item-cells`);
console.log(`| model | cond | items any DEV | Wilson | all 3 DEV | items any FLAG | announced/silent runs | ICC | unstable | pairs |`); console.log(`|---|---|---|---|---|---|---|---|---|---|`);
for (const m of models) for (const c of conds) { const t = items[m][c]; const w = wilson(t.itemsAnyDev, t.nItems); console.log(`| ${m} | ${c} | ${t.itemsAnyDev}/${t.nItems} | ${pct(w.lo)} to ${pct(w.hi)} | ${t.itemsAllDev} | ${t.itemsAnyFlag} | ${t.announcedRuns}/${t.silentRuns} | ${t.icc === null ? "n/a" : t.icc.toFixed(2)} | ${t.unstableItems} | ${Object.entries(t.pairs).map(([k, v]) => `${k}:${v}`).join(" ") || "-"} |`); }
console.log(`\n## Paired item-level contrasts (McNemar exact on discordant items; Fisher shown for reference)`);
for (const m of models) for (const q of paired[m]) console.log(`- ${m} ${q.a} -> ${q.b}: ${q.devA}/${q.nItems} -> ${q.devB}/${q.nItems}; only ${q.a} ${q.onlyA}, only ${q.b} ${q.onlyB}, both ${q.both}; McNemar p=${q.mcnemar_p.toFixed(3)}, Fisher p=${q.fisher_p.toFixed(3)}`);
for (const m of models) console.log(`- ${m} Cochran-Armitage trend over ${trend[m].conds.join(",")}: counts ${trend[m].counts.join("/")} of ${trend[m].nItems}, z=${trend[m].z.toFixed(2)}, p=${trend[m].p.toFixed(3)}`);
console.log(`\nfloor (draw disagreement at V0 and LM cells): ${JSON.stringify(floor)}; checker hashes in these records: ${checkerHashes.join(", ")}`);
console.log(`\ncontext chars by condition: ${JSON.stringify(contextChars)}`);
console.log("PILOT_TABLE_OK");
