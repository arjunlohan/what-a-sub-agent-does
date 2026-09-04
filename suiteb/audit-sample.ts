/**
 * Draw the Suite B audit sample: every planted-worker DEVIATED run plus a stratified sample of the other verdict classes
 * (model x condition x verdict strata, round robin), with everything a fresh-context auditor needs: assignment, objective
 * and brief, the full prompt, the tool trace, the worker's output, the verdict and its reason.
 * Run: pnpm tsx visibility-paper/suiteb/audit-sample.ts <label> [N]  (writes analysis/<label>-audit-sample.json)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TASKS } from "./tasks";
const ROOT = join(import.meta.dirname, "..");
const [label = "suiteb-full", nStr = "80"] = process.argv.slice(2); const N = Number(nStr);
const recs = readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const FAM = process.env.SB_AUDIT_FAMILY, PASS = process.env.SB_AUDIT_PASS ? Number(process.env.SB_AUDIT_PASS) : null;
const workers = recs.filter((r) => r.kind === "worker" && r.planted && r.ok && (!FAM || r.family === FAM) && (PASS === null || r.pass === PASS));
const picked: any[] = []; const seen = new Set<string>();
for (const w of workers) if (w.verdict === "DEVIATED") { picked.push(w); seen.add(w.key); }
const strata = new Map<string, any[]>(); for (const w of workers) { if (seen.has(w.key)) continue; const k = `${w.model}|${w.condition}|${w.verdict}`; strata.set(k, [...(strata.get(k) ?? []), w]); }
const keys = [...strata.keys()].sort(); let round = 0;
while (picked.length < N && round < 50) { let any = false; for (const k of keys) { const arr = strata.get(k)!; if (arr.length > round) { picked.push(arr[round]); any = true; if (picked.length >= N) break; } } if (!any) break; round++; }
const rows = picked.map((w, i) => { const t = TASKS[w.task]!; return { n: i + 1, key: w.key, model: w.model, condition: w.condition, task: w.task, family: w.family, worker: w.worker, assignment: w.assignment, objective: t.objective, brief: t.brief, verdict: w.verdict, detail: w.verdictDetail, disclosure: w.disclosure, concerns: w.concerns, escalationMessages: w.escalationMessages, toolCalls: w.toolCalls, targetWrites: w.targetWrites ?? null, prompt: w.prompt, raw: w.raw }; });
writeFileSync(join(ROOT, "analysis", `${process.env.SB_AUDIT_OUT ?? label}-audit-sample.json`), JSON.stringify(rows, null, 1));
console.log(JSON.stringify({ plantedUsable: workers.length, deviated: workers.filter((w) => w.verdict === "DEVIATED").length, strata: keys.length, picked: rows.length, byVerdict: rows.reduce((m: any, r) => { m[r.verdict] = (m[r.verdict] || 0) + 1; return m; }, {}) }));
