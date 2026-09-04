/**
 * DeepSeek effort levels through the gateway, V4 on the 200 Suite A items with three draws: the study setting (SDK xhigh,
 * runs/suite-a.rescored.jsonl), provider max (runs/effort-cross-deepseek-max.jsonl), explicit provider high and low
 * (runs/effort-levels-deepseek-{high,low}.jsonl) and thinking disabled at the provider (runs/effort-levels-deepseek-nothink.jsonl).
 * Per level: reasoning and output tokens, latency, billed cost, verdict counts. Paired by item and draw against the study
 * setting: sign test on reasoning tokens (binomial two-sided), mean and median paired differences; item-level any-draw
 * McNemar for flags and departures. Also carries the pass-through probe (runs/effort-passthrough-probe.json).
 * Writes analysis/effort-levels.json. Run: pnpm tsx visibility-paper/analysis/effort-levels.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { binomTwoSided, wilson } from "./stats";
const ROOT = join(import.meta.dirname, "..");
const load = (label: string) => { const p = join(ROOT, "runs", `${label}.jsonl`); if (!existsSync(p)) return []; const last = new Map<string, any>(); for (const l of readFileSync(p, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); last.set(r.key, r); } return [...last.values()]; };
const usable = (rs: any[]) => rs.filter((r) => r.ok && r.pinned && r.model === "deepseek" && r.condition === "V4");
const LEVELS: Array<{ id: string; label: string; recs: any[] }> = [
  { id: "study", label: "study setting (SDK xhigh)", recs: usable(load("suite-a.rescored")) },
  { id: "max", label: "provider max", recs: usable(load("effort-cross-deepseek-max")) },
  { id: "high", label: "provider high (explicit)", recs: usable(load("effort-levels-deepseek-high")) },
  { id: "low", label: "provider low", recs: usable(load("effort-levels-deepseek-low")) },
  { id: "nothink", label: "thinking disabled", recs: usable(load("effort-levels-deepseek-nothink")) },
];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quant = (xs: number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]!; };
const pairKey = (r: any) => `${r.item}|${r.draw}`;
const itemsWith = (rs: any[], v: string) => new Set(rs.filter((r) => r.verdict === v).map((r) => r.item));
const summary = (rs: any[]) => ({
  runs: rs.length, items: new Set(rs.map((r) => r.item)).size, pending: 600 - rs.length,
  reasoningMean: Math.round(mean(rs.map((r) => r.reasoningTokens ?? 0))), reasoningMedian: quant(rs.map((r) => r.reasoningTokens ?? 0), 0.5), reasoningP90: quant(rs.map((r) => r.reasoningTokens ?? 0), 0.9),
  reasoningZero: rs.filter((r) => !(r.reasoningTokens ?? 0)).length,
  outputMean: Math.round(mean(rs.map((r) => r.outputTokens ?? 0))), visibleMean: Math.round(mean(rs.map((r) => (r.outputTokens ?? 0) - (r.reasoningTokens ?? 0)))),
  latencyS: +(mean(rs.map((r) => r.latencyMs ?? 0)) / 1000).toFixed(1), costPerRun: +mean(rs.map((r) => r.cost ?? 0)).toFixed(5),
  flaggedRuns: rs.filter((r) => r.verdict === "FLAGGED").length, flaggedItems: itemsWith(rs, "FLAGGED").size, conflictFlagRuns: rs.filter((r) => r.flaggedConflict).length,
  deviatedRuns: rs.filter((r) => r.verdict === "DEVIATED").length, deviatedItems: itemsWith(rs, "DEVIATED").size, deviatedKeys: rs.filter((r) => r.verdict === "DEVIATED").map((r) => `${r.item}#${r.draw}: ${r.verdictDetail}`.slice(0, 160)),
  adheredRuns: rs.filter((r) => r.verdict === "ADHERED").length, failedRuns: rs.filter((r) => String(r.verdict).startsWith("FAILED")).length,
  settings: [...new Set(rs.map((r) => r.reasoningSetting))], checkerHashes: [...new Set(rs.map((r) => r.checkerHash))], warnings: [...new Set(rs.flatMap((r) => r.warnings ?? []))].slice(0, 5), temperature: [...new Set(rs.map((r) => r.temperature))],
});
const paired = (a: any[], b: any[]) => { // b against a, same item and draw
  const A = new Map(a.map((r) => [pairKey(r), r])); const diffs: number[] = []; let higher = 0, lower = 0, equal = 0;
  for (const r of b) { const s = A.get(pairKey(r)); if (!s) continue; const d = (r.reasoningTokens ?? 0) - (s.reasoningTokens ?? 0); diffs.push(d); if (d > 0) higher++; else if (d < 0) lower++; else equal++; }
  const fa = itemsWith(a, "FLAGGED"), fb = itemsWith(b, "FLAGGED"), da = itemsWith(a, "DEVIATED"), db = itemsWith(b, "DEVIATED");
  const itemsB = new Set(b.map((r) => r.item)); const only = (x: Set<string>, y: Set<string>) => [...x].filter((i) => itemsB.has(i) && !y.has(i)).length;
  const fOnlyA = only(fa, fb), fOnlyB = only(fb, fa), dOnlyA = only(da, db), dOnlyB = only(db, da);
  return { pairs: diffs.length, higher, lower, equal, signP: binomTwoSided(Math.min(higher, lower), higher + lower), meanDiff: Math.round(mean(diffs)), medianDiff: quant(diffs, 0.5),
    flagOnlyFirst: fOnlyA, flagOnlySecond: fOnlyB, flagMcNemar: binomTwoSided(Math.min(fOnlyA, fOnlyB), fOnlyA + fOnlyB), devOnlyFirst: dOnlyA, devOnlySecond: dOnlyB, devMcNemar: binomTwoSided(Math.min(dOnlyA, dOnlyB), dOnlyA + dOnlyB) };
};
const out: any = { levels: {}, pairedAgainstStudy: {}, pairedAgainstHigh: {}, probe: existsSync(join(ROOT, "runs", "effort-passthrough-probe.json")) ? JSON.parse(readFileSync(join(ROOT, "runs", "effort-passthrough-probe.json"), "utf8")) : null };
const study = LEVELS[0]!.recs, high = LEVELS.find((l) => l.id === "high")!.recs;
for (const l of LEVELS) { out.levels[l.id] = { label: l.label, ...summary(l.recs) }; if (l.id !== "study" && l.recs.length) out.pairedAgainstStudy[l.id] = paired(study, l.recs); if (l.id !== "high" && l.recs.length && high.length) out.pairedAgainstHigh[l.id] = paired(high, l.recs); }
out.flagWilson = Object.fromEntries(LEVELS.map((l) => [l.id, wilson(itemsWith(l.recs, "FLAGGED").size, Math.max(1, new Set(l.recs.map((r) => r.item)).size))]));
writeFileSync(join(ROOT, "analysis", "effort-levels.json"), JSON.stringify(out, null, 1));
for (const [id, s] of Object.entries(out.levels) as any) console.log(`${id.padEnd(8)} ${String(s.runs).padStart(3)} runs (${s.items} items): reasoning mean ${s.reasoningMean} median ${s.reasoningMedian} p90 ${s.reasoningP90} zero ${s.reasoningZero}; visible ${s.visibleMean}; latency ${s.latencyS}s; $${s.costPerRun}/run; flagged ${s.flaggedRuns} runs/${s.flaggedItems} items (conflict ${s.conflictFlagRuns}); deviated ${s.deviatedRuns}/${s.deviatedItems}; failed ${s.failedRuns}; settings ${s.settings.join(",")}; checker ${s.checkerHashes.join(",")}; warnings ${s.warnings.length}`);
for (const [id, p] of Object.entries(out.pairedAgainstStudy) as any) console.log(`vs study: ${id.padEnd(8)} pairs ${p.pairs}: higher ${p.higher} lower ${p.lower} equal ${p.equal} sign p ${p.signP.toExponential(2)}; mean diff ${p.meanDiff} median diff ${p.medianDiff}; flags only-study ${p.flagOnlyFirst} only-${id} ${p.flagOnlySecond} p ${p.flagMcNemar.toFixed(3)}; dev only-study ${p.devOnlyFirst} only-${id} ${p.devOnlySecond} p ${p.devMcNemar.toFixed(3)}`);
for (const [id, p] of Object.entries(out.pairedAgainstHigh) as any) console.log(`vs high:  ${id.padEnd(8)} pairs ${p.pairs}: higher ${p.higher} lower ${p.lower} equal ${p.equal} sign p ${p.signP.toExponential(2)}; mean diff ${p.meanDiff} median diff ${p.medianDiff}`);
console.log("EFFORT_LEVELS_OK");
