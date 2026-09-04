/**
 * Stratified audit sample for the checker: up to N records spread across
 * model x condition x verdict, written as JSON (for the record) and Markdown
 * (for the auditor), with the assignment, objective, verdict, detail and the
 * raw output. Run: pnpm tsx visibility-paper/analysis/audit-sample.ts <label> [N]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadItems } from "../harness/items";
const [label = "pilot", nStr = "72"] = process.argv.slice(2);
const N = Number(nStr);
const ROOT = join(import.meta.dirname, "..");
const items = new Map(loadItems().map((it) => [it.id, it]));
const last = new Map<string, any>();
for (const l of readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); last.set(r.key, r); }
const usable = [...last.values()].filter((r) => r.ok && r.pinned);
const strata = new Map<string, any[]>();
for (const r of usable) { const k = `${r.model}|${r.condition}|${r.verdict}`; strata.set(k, [...(strata.get(k) ?? []), r]); }
// deterministic pseudo-random order inside each stratum (mulberry32 on a fixed seed)
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(42);
for (const [, arr] of strata) arr.sort(() => rand() - 0.5);
const keys = [...strata.keys()].sort();
const picked: any[] = []; let round = 0;
// AUDIT_FOCUS=DEVIATED: every deviating run enters the sample first (they carry the primary outcome), then the strata fill the rest.
if (process.env.AUDIT_FOCUS === "DEVIATED") { for (const r of usable.filter((r) => r.verdict === "DEVIATED")) if (picked.length < N) picked.push(r); }
const already = new Set(picked.map((r) => r.key));
while (picked.length < N && round < 100) { let any = false; for (const k of keys) { const arr = strata.get(k)!; if (arr.length > round) { picked.push(arr[round]); any = true; if (picked.length >= N) break; } } if (!any) break; round++; }
const rows = picked.map((r, i) => { const it = items.get(r.item)!; return { n: i + 1, key: r.key, model: r.model, condition: r.condition, item: r.item, domain: r.domain, verdict: r.verdict, detail: r.verdictDetail, instruction: it.instruction, objective: it.objective, concerns: r.concerns, raw: r.raw }; });
writeFileSync(join(ROOT, "analysis", `${label}-audit-sample.json`), JSON.stringify(rows, null, 1));
writeFileSync(join(ROOT, "analysis", `${label}-audit-sample.md`), rows.map((r) => `## ${r.n}. ${r.key}\n- domain: ${r.domain}; verdict: **${r.verdict}** (${r.detail})\n- assignment: ${r.instruction}\n- objective (visible at V1+ only): ${r.objective}\n- concerns: ${JSON.stringify(r.concerns)}\n\n\`\`\`\n${r.raw.length > 2500 ? r.raw.slice(0, 2500) + "\n...[truncated]" : r.raw}\n\`\`\`\n`).join("\n"));
console.log(JSON.stringify({ usable: usable.length, strata: keys.length, picked: rows.length, byVerdict: Object.fromEntries([...new Set(rows.map((r) => r.verdict))].map((v) => [v, rows.filter((r) => r.verdict === v).length])) }));
