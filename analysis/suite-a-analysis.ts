/**
 * Suite A analysis (pre-registered plan, PROTOCOL.md v3.1 sections 6, 8 and 11). Item is the unit.
 *   primary   per model: McNemar exact between V0 and V4 on item-level any-DEVIATED indicators; Holm across models
 *   secondary Holm-corrected family per model: adjacent steps V0-V1, V1-V2, V2-V3, V3-V4; V2 vs LM2; V4 vs LM4;
 *             V4 vs HM4; HM4 vs LM4; V2 vs V2N; V2 vs V2P; V4L vs LML; V4 vs V4L
 *   supporting Cochran-Armitage trend over V0..V4; temperature arm agreement; pilot-overlap agreement
 *   exploratory FLAGGED, announced/silent, conflict-naming flags, domain, salience, harm class, reasoning tokens
 * Reads runs/suite-a.jsonl (+ suite-a-temp.jsonl, suite-a-overlap.jsonl, pilot.rescored.jsonl when present).
 * Writes analysis/suite-a-results.json and prints a markdown report. Works on partial data (reports coverage).
 * Run: pnpm tsx visibility-paper/analysis/suite-a-analysis.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { wilson, binomTwoSided, fisherTwoSided, cochranArmitage, icc1, holm } from "./stats";
import { loadItems } from "../harness/items";
import { MODELS } from "../harness/models";
const ROOT = join(import.meta.dirname, "..");
const FROZEN = "9179f04a49c2cba4";
type Rec = any;
function load(label: string): Map<string, Rec> { const m = new Map<string, Rec>(); const p = join(ROOT, "runs", `${label}.jsonl`); if (!existsSync(p)) return m; for (const l of readFileSync(p, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); m.set(r.key, r); } return m; }
const items = new Map(loadItems("items-suite-a").map((it) => [it.id, it]));
const SUFFIX = process.env.SUITE_A_SUFFIX ?? ""; // ".rescored" selects the records rescored under a revised checker
const main = [...load(`suite-a${SUFFIX}`).values()];
const usable = main.filter((r) => r.ok && r.pinned);
const hashes = [...new Set(usable.map((r) => r.checkerHash))];
const models = [...new Set(usable.map((r) => r.model))].sort();
const CONDS = ["V0", "V1", "V2", "V3", "V4", "LM2", "LM4", "HM2", "HM4", "V2N", "V2P", "V4L", "LML"];
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;
const fmtP = (p: number) => (p < 0.001 ? "<0.001" : p.toFixed(3));
type Cell = { runs: number; items: number; devItems: string[]; anyDev: number; allDev: number; anyFlag: number; announced: number; silent: number; prose: number; silentStrict: number; conflictFlags: number; icc: number | null; verdicts: Record<string, number>; reasoning: number; cost: number; costNormalized: number; peakShare: number; latency: number };
// Cost at one rate per model (DeepSeek first-party off-peak, Muse contributor) from the token counts; the billed cost in
// each record varies with DeepSeek's peak windows (01:00-04:00 and 06:00-10:00 UTC, weekdays), so comparisons use this.
const normCost = (r: Rec) => { const p = (MODELS as any)[r.model]; if (!p) return 0; const x = r as any; const cache = x.cacheReadTokens ?? 0; return (((x.inputTokens ?? 0) - cache) * p.priceIn + cache * p.priceCacheRead + (x.outputTokens ?? 0) * p.priceOut) / 1e6; };
const isPeak = (r: Rec) => { const ts = (r as any).ts; if (r.model !== "deepseek" || !ts) return false; const d = new Date(ts); const day = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60; return day >= 1 && day <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10)); };
function cell(m: string, c: string): Cell {
  const rs = usable.filter((r) => r.model === m && r.condition === c); const byItem = new Map<string, Rec[]>(); for (const r of rs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]);
  const groups = [...byItem.values()]; const dev = (r: Rec) => r.verdict === "DEVIATED"; const devItems = groups.filter((g) => g.some(dev)).map((g) => g[0].item).sort();
  const verdicts: Record<string, number> = {}; for (const r of rs) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
  const full = groups.filter((g) => g.length === 3); const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return { runs: rs.length, items: groups.length, devItems, anyDev: devItems.length, allDev: groups.filter((g) => g.every(dev)).length, anyFlag: groups.filter((g) => g.some((r) => r.verdict === "FLAGGED")).length, announced: rs.filter((r) => dev(r) && r.concerns.length > 0).length, silent: rs.filter((r) => dev(r) && r.concerns.length === 0).length, prose: rs.filter((r) => dev(r) && (r as any).disclosure === "prose").length, silentStrict: rs.filter((r) => dev(r) && (r as any).disclosure === "silent").length, conflictFlags: rs.filter((r) => r.verdict === "FLAGGED" && r.flaggedConflict).length, icc: full.length >= 2 ? icc1(full.map((g) => g.map((r) => (dev(r) ? 1 : 0)))) : null, verdicts, reasoning: Math.round(mean(rs.map((r) => r.reasoningTokens ?? 0))), cost: rs.reduce((a, r) => a + (r.cost ?? 0), 0), costNormalized: rs.reduce((a, r) => a + normCost(r), 0), peakShare: rs.length ? rs.filter(isPeak).length / rs.length : 0, latency: Math.round(mean(rs.map((r) => r.latencyMs))) };
}
const table: Record<string, Record<string, Cell>> = {}; for (const m of models) { table[m] = {}; for (const c of CONDS) table[m][c] = cell(m, c); }
/** Paired item-level contrast: only items present in both cells. */
function paired(m: string, a: string, b: string) { const A = table[m][a], B = table[m][b]; const itemsA = new Set(usable.filter((r) => r.model === m && r.condition === a).map((r) => r.item)); const itemsB = new Set(usable.filter((r) => r.model === m && r.condition === b).map((r) => r.item)); const both = [...itemsA].filter((i) => itemsB.has(i)); const dA = new Set(A.devItems), dB = new Set(B.devItems); const onlyA = both.filter((i) => dA.has(i) && !dB.has(i)).length, onlyB = both.filter((i) => dB.has(i) && !dA.has(i)).length, sh = both.filter((i) => dA.has(i) && dB.has(i)).length; const nA = both.filter((i) => dA.has(i)).length, nB = both.filter((i) => dB.has(i)).length; return { a, b, n: both.length, devA: nA, devB: nB, onlyA, onlyB, both: sh, diff: both.length ? (nB - nA) / both.length : 0, mcnemar_p: binomTwoSided(Math.min(onlyA, onlyB), onlyA + onlyB), fisher_p: fisherTwoSided(nB, both.length - nB, nA, both.length - nA), wilsonA: wilson(nA, both.length), wilsonB: wilson(nB, both.length) }; }
const PRIMARY = ["V0", "V4"] as const;
const SECONDARY: Array<[string, string]> = [["V0", "V1"], ["V1", "V2"], ["V2", "V3"], ["V3", "V4"], ["LM2", "V2"], ["LM4", "V4"], ["HM4", "V4"], ["LM4", "HM4"], ["V2N", "V2"], ["V2P", "V2"], ["LML", "V4L"], ["V4", "V4L"]];
const primary = Object.fromEntries(models.map((m) => [m, paired(m, PRIMARY[0], PRIMARY[1])]));
const primaryHolm = holm(models.map((m) => primary[m].mcnemar_p));
const secondary: Record<string, any[]> = {}; for (const m of models) { const ps = SECONDARY.map(([a, b]) => paired(m, a, b)); const adj = holm(ps.map((q) => q.mcnemar_p)); secondary[m] = ps.map((q, i) => ({ ...q, holm_p: adj[i] })); }
const DOSE: Record<string, number> = { V0: 0, V1: 1, V2: 2, V3: 3, V4: 4 };
const trend = Object.fromEntries(models.map((m) => { const cs = Object.keys(DOSE).filter((c) => table[m][c].items > 0); const t = cochranArmitage(cs.map((c) => ({ k: table[m][c].anyDev, n: table[m][c].items, score: DOSE[c] }))); return [m, { conds: cs, counts: cs.map((c) => table[m][c].anyDev), items: cs.map((c) => table[m][c].items), z: t.z, p: t.p }]; }));
// temperature arm: agreement of the provider-default single draw with the temperature-0 majority per item-cell
const temp = [...load(`suite-a-temp${SUFFIX}`).values()].filter((r) => r.ok && r.pinned);
const tempAgree: Record<string, any> = {}; for (const m of models) { const rs = temp.filter((r) => r.model === m); let n = 0, agree = 0, devT = 0, devZ = 0; for (const r of rs) { const zs = usable.filter((x) => x.model === m && x.item === r.item && x.condition === r.condition); if (!zs.length) continue; n++; const maj = Object.entries(zs.reduce((a: any, x) => { a[x.verdict] = (a[x.verdict] ?? 0) + 1; return a; }, {})).sort((x: any, y: any) => y[1] - x[1])[0]![0]; if (maj === r.verdict) agree++; if (r.verdict === "DEVIATED") devT++; if (zs.some((x) => x.verdict === "DEVIATED")) devZ++; } tempAgree[m] = { compared: n, agreement: n ? agree / n : null, deviatedDefault: devT, deviatedTemp0AnyDraw: devZ, runs: rs.length }; }
for (const m of models) if (tempAgree[m]) tempAgree[m].note = m === "deepseek" ? "DeepSeek thinking mode does not support temperature (api-docs.deepseek.com/guides/thinking_mode, fetched 2026-09-03): this arm is a fourth draw at provider nondeterminism, and the three main draws were not temperature-controlled either" : "provider-default temperature (one draw) versus temperature 0 (three draws)";
// pilot-overlap block: the 30 pilot items rerun; agreement with the pilot's rescored records per item-cell
const overlap = [...load(`suite-a-overlap${SUFFIX}`).values()].filter((r) => r.ok && r.pinned); const pilot = [...load("pilot.rescored").values()].filter((r) => r.ok && r.pinned);
const overlapAgree: Record<string, any> = {}; for (const m of models) { let n = 0, agree = 0, devP = 0, devO = 0; const cells = new Set(overlap.filter((r) => r.model === m).map((r) => `${r.item}|${r.condition}`)); for (const key of cells) { const [item, cond] = key.split("|"); const P = pilot.filter((r) => r.model === m && r.item === item && r.condition === cond); const O = overlap.filter((r) => r.model === m && r.item === item && r.condition === cond); if (!P.length || !O.length) continue; n++; const pd = P.some((r) => r.verdict === "DEVIATED"), od = O.some((r) => r.verdict === "DEVIATED"); if (pd === od) agree++; if (pd) devP++; if (od) devO++; } overlapAgree[m] = { itemCells: n, agreementOnAnyDeviated: n ? agree / n : null, pilotDevCells: devP, overlapDevCells: devO }; }
// exploratory breakdowns
const by = (field: string) => { const out: Record<string, Record<string, Record<string, { items: number; anyDev: number; anyFlag: number }>>> = {}; for (const m of models) { out[m] = {}; const vals = [...new Set(usable.map((r) => (items.get(r.item) as any)?.[field] ?? r[field]))].sort(); for (const v of vals) { out[m][String(v)] = {}; for (const c of CONDS) { const rs = usable.filter((r) => r.model === m && r.condition === c && ((items.get(r.item) as any)?.[field] ?? r[field]) === v); const byItem = new Map<string, Rec[]>(); for (const r of rs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]); const g = [...byItem.values()]; out[m][String(v)][c] = { items: g.length, anyDev: g.filter((x) => x.some((r) => r.verdict === "DEVIATED")).length, anyFlag: g.filter((x) => x.some((r) => r.verdict === "FLAGGED")).length }; } } } return out; };
const summary = { generatedAt: new Date().toISOString(), frozenChecker: FROZEN, checkerHashes: hashes, records: main.length, usable: usable.length, excluded: { callFailed: main.filter((r) => !r.ok).length, unpinned: main.filter((r) => r.ok && !r.pinned).length }, models, conditions: CONDS, table, primary, primaryHolm: Object.fromEntries(models.map((m, i) => [m, primaryHolm[i]])), secondary, trend, tempAgree, overlapAgree, byDomain: by("domain"), bySalience: by("salience"), byHarm: by("harm_class"), totalCost: usable.reduce((a, r) => a + (r.cost ?? 0), 0), costNormalizedTotal: usable.reduce((a, r) => a + normCost(r), 0), billedOverNormalized: Object.fromEntries(models.map((m) => { const rs = usable.filter((r) => r.model === m); const b = rs.reduce((a, r) => a + (r.cost ?? 0), 0), n = rs.reduce((a, r) => a + normCost(r), 0); return [m, n ? b / n : null]; })), peakShare: Object.fromEntries(models.map((m) => { const rs = usable.filter((r) => r.model === m); return [m, rs.length ? rs.filter(isPeak).length / rs.length : 0]; })) };
writeFileSync(join(ROOT, "analysis", `suite-a-results${SUFFIX}.json`), JSON.stringify(summary, null, 1));
console.log(`# Suite A: ${usable.length} usable runs of ${main.length} (${summary.excluded.callFailed} failed, ${summary.excluded.unpinned} unpinned); checker ${hashes.join(",")}${hashes.length === 1 && hashes[0] === FROZEN ? " (frozen)" : " (NOT the frozen hash)"}; cost $${summary.totalCost.toFixed(2)}\n`);
console.log(`| model | cond | items | runs | items any DEV | Wilson | all 3 | any FLAG | announced/silent | conflict flags | ICC | reasoning | $/run |`); console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const m of models) for (const c of CONDS) { const t = table[m][c]; if (!t.items) continue; const w = wilson(t.anyDev, t.items); console.log(`| ${m} | ${c} | ${t.items} | ${t.runs} | ${t.anyDev} | ${pct(w.lo, 0)} to ${pct(w.hi, 0)} | ${t.allDev} | ${t.anyFlag} | ${t.announced}/${t.silent} | ${t.conflictFlags} | ${t.icc === null ? "n/a" : t.icc.toFixed(2)} | ${t.reasoning} | ${t.runs ? (t.cost / t.runs).toFixed(4) : "-"} |`); }
console.log(`\n## Primary (V0 to V4, McNemar exact on items; Holm across models)`);
for (const m of models) { const q = primary[m]; console.log(`- ${m}: ${q.devA}/${q.n} to ${q.devB}/${q.n} (diff ${pct(q.diff, 1)}; only V0 ${q.onlyA}, only V4 ${q.onlyB}, both ${q.both}); McNemar p=${fmtP(q.mcnemar_p)}, Holm p=${fmtP(summary.primaryHolm[m])}, Fisher p=${fmtP(q.fisher_p)}`); }
console.log(`\n## Secondary family (Holm within model)`);
for (const m of models) for (const q of secondary[m]) if (q.n) console.log(`- ${m} ${q.a} to ${q.b}: ${q.devA}/${q.n} to ${q.devB}/${q.n} (diff ${pct(q.diff, 1)}); McNemar p=${fmtP(q.mcnemar_p)}, Holm p=${fmtP(q.holm_p)}`);
console.log(`\n## Trend (Cochran-Armitage over ${trend[models[0]]?.conds.join(",")})`);
for (const m of models) console.log(`- ${m}: counts ${trend[m].counts.join("/")} of ${trend[m].items.join("/")} items; z=${trend[m].z.toFixed(2)}, p=${fmtP(trend[m].p)}`);
console.log(`\n## Temperature arm (provider default, one draw) agreement with the temperature-0 majority: ${JSON.stringify(tempAgree)}`);
console.log(`\n## Cost: billed $${summary.totalCost.toFixed(2)}; at one rate per model $${summary.costNormalizedTotal.toFixed(2)}; billed over normalized ${JSON.stringify(Object.fromEntries(Object.entries(summary.billedOverNormalized).map(([m, v]) => [m, v === null ? null : Number((v as number).toFixed(3))])))}; DeepSeek peak-window share ${pct(summary.peakShare.deepseek ?? 0, 1)}`);
console.log(`## Pilot-overlap block agreement with the pilot (any-DEVIATED per item-cell): ${JSON.stringify(overlapAgree)}`);
console.log(`\n## Items with a deviating draw by domain (V0 / V2 / V4)`);
for (const m of models) for (const [d, cs] of Object.entries(summary.byDomain[m])) console.log(`- ${m} ${d}: ${["V0", "V2", "V4"].map((c) => `${cs[c]?.anyDev ?? 0}/${cs[c]?.items ?? 0}`).join(" / ")} (flag ${["V0", "V2", "V4"].map((c) => cs[c]?.anyFlag ?? 0).join("/")})`);
console.log("SUITE_A_ANALYSIS_OK");
