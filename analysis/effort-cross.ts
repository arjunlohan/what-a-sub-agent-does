/**
 * Effort cross: each model at two effort levels on V0, V4 and HM4 (Suite A items, three draws). The Suite A main block (revised checker)
 * supplies DeepSeek at high (what the SDK's xhigh maps to) and Muse at Meta's maximum; runs/effort-cross-deepseek-max.jsonl
 * and runs/effort-cross-muse-default.jsonl supply the other level. Item-level any-draw indicators, McNemar exact between
 * effort levels within condition, reasoning tokens, latency and billed cost. Writes analysis/effort-cross.json.
 * Run: pnpm tsx visibility-paper/analysis/effort-cross.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { binomTwoSided as mcnemarExact, wilson } from "./stats";
const ROOT = join(import.meta.dirname, "..");
const load = (label: string) => { const p = join(ROOT, "runs", `${label}.jsonl`); if (!existsSync(p)) return []; const last = new Map<string, any>(); for (const l of readFileSync(p, "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); if (r.ok && r.pinned) last.set(r.key, r); } return [...last.values()]; };
// Study side under the revised checker (runs/suite-a.rescored.jsonl); the other-level runs were scored live by the same logic (checker-hash equivalence recorded in DECISIONS.md, 2026-09-04).
const main = load("suite-a.rescored"); const CONDS = ["V0", "V4", "HM4"];
const LEVELS: Record<string, Array<{ level: string; recs: any[] }>> = {
  deepseek: [{ level: "high (SDK xhigh, the study setting)", recs: main.filter((r) => r.model === "deepseek") }, { level: "max (provider)", recs: load("effort-cross-deepseek-max") }],
  muse: [{ level: "maximum (SDK xhigh, the study setting)", recs: main.filter((r) => r.model === "muse") }, { level: "provider default", recs: load("effort-cross-muse-default") }],
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const out: any = {};
for (const [m, levels] of Object.entries(LEVELS)) { out[m] = {}; for (const c of CONDS) { const cells = levels.map(({ level, recs }) => { const rs = recs.filter((r) => r.condition === c); const byItem = new Map<string, any[]>(); for (const r of rs) byItem.set(r.item, [...(byItem.get(r.item) ?? []), r]); const dev = new Set([...byItem.entries()].filter(([, g]) => g.some((r) => r.verdict === "DEVIATED")).map(([i]) => i)); const flag = new Set([...byItem.entries()].filter(([, g]) => g.some((r) => r.verdict === "FLAGGED")).map(([i]) => i)); return { level, runs: rs.length, items: byItem.size, devItems: dev, flagItems: flag, dev: dev.size, flag: flag.size, devWilson: wilson(dev.size, Math.max(1, byItem.size)), reasoning: Math.round(mean(rs.map((r) => r.reasoningTokens ?? 0))), latencyS: +(mean(rs.map((r) => r.latencyMs ?? 0)) / 1000).toFixed(1), costPerRun: +(rs.reduce((a, r) => a + (r.cost ?? 0), 0) / Math.max(1, rs.length)).toFixed(4), settings: [...new Set(rs.map((r) => r.reasoningSetting))] }; });
    const [a, b] = cells; const both = [...a.devItems].filter((i) => b.items && b.devItems.has(i)).length; const onlyA = [...a.devItems].filter((i) => !b.devItems.has(i)).length; const onlyB = [...b.devItems].filter((i) => !a.devItems.has(i)).length; const fa = [...a.flagItems].filter((i) => !b.flagItems.has(i)).length, fb = [...b.flagItems].filter((i) => !a.flagItems.has(i)).length;
    out[m][c] = { levels: cells.map(({ devItems, flagItems, ...rest }) => rest), devMcNemar: b.items ? mcnemarExact(Math.min(onlyA, onlyB), onlyA + onlyB) : null, devOnlyFirst: onlyA, devOnlySecond: onlyB, devBoth: both, flagMcNemar: b.items ? mcnemarExact(Math.min(fa, fb), fa + fb) : null, flagOnlyFirst: fa, flagOnlySecond: fb }; } }
writeFileSync(join(ROOT, "analysis", "effort-cross.json"), JSON.stringify(out, null, 1));
for (const [m, byC] of Object.entries(out) as any) for (const c of CONDS) { const x = byC[c]; console.log(`${m} ${c}: ${x.levels.map((l: any) => `${l.level}: dev ${l.dev}/${l.items} flag ${l.flag} reasoning ${l.reasoning} latency ${l.latencyS}s $${l.costPerRun} (${l.runs} runs; ${l.settings.join(",")})`).join(" | ")}; dev McNemar ${x.devMcNemar === null ? "n/a" : x.devMcNemar.toFixed(3)} (only first ${x.devOnlyFirst}, only second ${x.devOnlySecond}); flag McNemar ${x.flagMcNemar === null ? "n/a" : x.flagMcNemar.toFixed(3)}`); }
console.log("EFFORT_CROSS_OK");
