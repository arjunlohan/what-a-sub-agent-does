/**
 * Runner: items x conditions x draws x models, temperature 0, reasoning at
 * the pinned level, provider pinned. Every completed call is appended to a
 * JSONL file immediately (the checkpoint); rerunning the same command
 * resumes, redoing only keys whose last record failed or was served by a
 * provider other than the pin. Aborts a model's pool if its error rate
 * exceeds 5% after 50 calls, or if this invocation's spend passes the cap.
 *
 * Run from the repo root:
 *   set -a; source .env.local; set +a
 *   RUN_LABEL=pilot RUN_MODELS=deepseek,muse RUN_CONDITIONS=V0,V2,V4,LM4 RUN_DRAWS=3 \
 *     pnpm tsx visibility-paper/harness/run.ts
 * RUN_ITEMS=DE-01,CE-02 | <domain> | all      RUN_DRY=1 prints prompt sizes only
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUDGET_USD, MODELS } from "./models";
import { callWorker, sha16 } from "./gateway";
import { loadItems, RUNS, type Item } from "./items";
import { buildPrompt, type Condition } from "./prompts";
import { check, type Verdict } from "./checkers";
import { readFileSync as readSrc } from "node:fs";
const CHECKER_HASH = sha16(readSrc(join(import.meta.dirname, "checkers.ts"), "utf8"));

export type RunRecord = {
  run: string; key: string;
  model: "deepseek" | "muse" | "luna"; modelId: string;
  condition: Condition; item: string; domain: Item["domain"]; salience: Item["salience"]; draw: number;
  ts: string; promptHash: string; systemHash: string; contextChars: number; promptChars: number;
  temperature: number; reasoningSetting: string;
  ok: boolean; error: string | null; provider: string | null; pinned: boolean;
  latencyMs: number; inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; cacheReadTokens: number | null; cost: number | null;
  generationId: string | null; finishReason: string | null; warnings: string[];
  verdict: Verdict | "CALL_FAILED"; verdictDetail: string; concerns: string[]; rationale: string; flaggedConflict: boolean; checkerHash: string;
  raw: string;
};

const RUN = process.env.RUN_LABEL ?? "pilot";
const OUT = join(RUNS, process.env.RUN_OUT ?? `${RUN}.jsonl`);
const MODEL_KEYS = (process.env.RUN_MODELS ?? "deepseek,muse").split(",").map((s) => s.trim()) as Array<"deepseek" | "muse" | "luna">;
const CONDS = (process.env.RUN_CONDITIONS ?? "V0,V2,V4,LM4").split(",").map((s) => s.trim()) as Condition[];
const DRAWS = Number(process.env.RUN_DRAWS ?? 3);
const ITEMS = process.env.RUN_ITEMS ?? "all";
const DRY = process.env.RUN_DRY === "1";
const CAP = Number(process.env.RUN_BUDGET_USD ?? BUDGET_USD.pilot);
/** RUN_TEMPERATURE=default omits the temperature parameter (the provider-default arm); otherwise a number, 0 by default. */
const TEMPERATURE: number | null = process.env.RUN_TEMPERATURE === "default" ? null : Number(process.env.RUN_TEMPERATURE ?? 0);
/** RUN_REASONING=default omits the reasoning option (provider default); unset uses the model's pinned level. */
const REASONING: string | null | undefined = process.env.RUN_REASONING === "default" ? null : process.env.RUN_REASONING;
/** RUN_PROVIDER_REASONING=max sends a provider-level effort (DeepSeek: low, high, max) in addition to, or instead of, the SDK option. */
const PROVIDER_REASONING: string | null = process.env.RUN_PROVIDER_REASONING ?? null;

function selectItems(all: Item[]): Item[] {
  if (ITEMS === "all") return all;
  const wanted = new Set(ITEMS.split(",").map((s) => s.trim()));
  return all.filter((it) => wanted.has(it.id) || wanted.has(it.domain));
}

/** Keys whose LAST record is a usable success (ok and pinned); everything else is (re)run. */
function doneKeys(): Set<string> {
  const last = new Map<string, RunRecord>();
  if (existsSync(OUT)) for (const line of readFileSync(OUT, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as RunRecord;
    last.set(r.key, r);
  }
  // RUN_RETRY_BUDGET=1 treats budget-truncated records as not done so they are rerun at the current output budget.
  const retryBudget = process.env.RUN_RETRY_BUDGET === "1";
  return new Set([...last.values()].filter((r) => r.ok && r.pinned && !(retryBudget && (r.verdict === "FAILED_BUDGET" || (r.verdict === "FAILED_FORMAT" && r.finishReason === "length")))).map((r) => r.key));
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>, shouldStop: () => boolean) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) { const i = next++; await fn(items[i]!); }
  }));
}

async function main() {
  if (!DRY && !process.env.AI_GATEWAY_API_KEY) { console.error("RUN_ABORT: AI_GATEWAY_API_KEY is not set (source .env.local)"); process.exit(2); }
  mkdirSync(RUNS, { recursive: true });
  const all = loadItems();
  const items = selectItems(all);
  if (!items.length) throw new Error("no items selected");
  const indexOf = new Map(all.map((it, i) => [it.id, i] as const));
  const done = doneKeys();
  type Task = { model: "deepseek" | "muse" | "luna"; item: Item; cond: Condition; draw: number; key: string };
  const tasks: Task[] = [];
  // Draw-major order: every item-cell's first draw runs before any second draw, so the three draws of one
  // item-cell are spread across the run instead of sharing one provider state (referee round 1).
  for (const model of MODEL_KEYS) for (let draw = 1; draw <= DRAWS; draw++) for (const item of items) for (const cond of CONDS) {
    const key = `${model}|${cond}|${item.id}|${draw}`;
    if (!done.has(key)) tasks.push({ model, item, cond, draw, key });
  }
  if (DRY) {
    for (const item of items) for (const cond of CONDS) {
      const p = buildPrompt(item, cond, indexOf.get(item.id)!, all);
      console.log(`${item.id} ${cond} context=${p.contextChars} prompt=${p.user.length} system=${p.system.length}`);
    }
    console.log(`DRY: ${tasks.length} tasks pending, ${done.size} keys already done, out=${OUT}`);
    return;
  }
  console.log(`run=${RUN} models=${MODEL_KEYS.join(",")} conds=${CONDS.join(",")} draws=${DRAWS} items=${items.length} pending=${tasks.length} done=${done.size} cap=$${CAP}`);
  let spent = 0; let completed = 0; let stopped = false;
  const stats: Record<string, { calls: number; errors: number; unpinned: number; cost: number; inTok: number; outTok: number; reasonTok: number }> = {};
  const started = Date.now();
  await Promise.all(MODEL_KEYS.map(async (mk) => {
    const spec = MODELS[mk];
    const st = (stats[mk] = { calls: 0, errors: 0, unpinned: 0, cost: 0, inTok: 0, outTok: 0, reasonTok: 0 });
    const mine = tasks.filter((t) => t.model === mk);
    await mapLimit(mine, spec.concurrency, async (t) => {
      const p = buildPrompt(t.item, t.cond, indexOf.get(t.item.id)!, all);
      const res = await callWorker(spec, p.system, p.user, { temperature: TEMPERATURE, reasoning: PROVIDER_REASONING ? null : REASONING, providerReasoning: PROVIDER_REASONING });
      const chk = res.ok ? check(t.item, res.text, { finishReason: res.finishReason }) : null;
      const pinned = res.ok && res.provider === spec.only[0];
      const rec: RunRecord = {
        run: RUN, key: t.key, model: mk, modelId: spec.id, condition: t.cond, item: t.item.id, domain: t.item.domain, salience: t.item.salience, draw: t.draw,
        ts: new Date().toISOString(), promptHash: sha16(p.user), systemHash: sha16(p.system), contextChars: p.contextChars, promptChars: p.user.length,
        temperature: TEMPERATURE === null ? -1 : TEMPERATURE, reasoningSetting: PROVIDER_REASONING ? `provider-${PROVIDER_REASONING}` : REASONING === null ? "provider-default" : (REASONING ?? spec.reasoning),
        ok: res.ok, error: res.error, provider: res.provider, pinned,
        latencyMs: res.latencyMs, inputTokens: res.inputTokens, outputTokens: res.outputTokens, reasoningTokens: res.reasoningTokens, cacheReadTokens: res.cacheReadTokens, cost: res.cost,
        generationId: res.generationId, finishReason: res.finishReason, warnings: res.warnings,
        verdict: chk ? chk.verdict : "CALL_FAILED", verdictDetail: chk ? chk.detail : (res.error ?? "call failed"), concerns: chk?.concerns ?? [], rationale: chk?.rationale ?? "", flaggedConflict: chk?.flaggedConflict ?? false, checkerHash: CHECKER_HASH,
        raw: res.text,
      };
      appendFileSync(OUT, JSON.stringify(rec) + "\n");
      st.calls++; completed++;
      if (!res.ok) st.errors++;
      if (res.ok && !pinned) st.unpinned++;
      st.cost += res.cost ?? 0; spent += res.cost ?? 0;
      st.inTok += res.inputTokens ?? 0; st.outTok += res.outputTokens ?? 0; st.reasonTok += res.reasoningTokens ?? 0;
      if (completed % 20 === 0) console.log(`  ${completed}/${tasks.length} done, $${spent.toFixed(4)} spent, ${Math.round((Date.now() - started) / 1000)}s`);
      if (st.calls >= 50 && st.errors / st.calls > 0.05) { console.error(`RUN_ABORT: ${mk} error rate ${(100 * st.errors / st.calls).toFixed(1)}% after ${st.calls} calls`); stopped = true; }
      if (spent > CAP) { console.error(`RUN_ABORT: spend $${spent.toFixed(2)} exceeded cap $${CAP}`); stopped = true; }
    }, () => stopped);
  }));
  const ledgerPath = join(RUNS, "ledger.json");
  const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : { entries: [] };
  for (const mk of MODEL_KEYS) ledger.entries.push({ run: RUN, model: mk, modelId: MODELS[mk].id, ts: new Date().toISOString(), ...stats[mk] });
  ledger.total = ledger.entries.reduce((a: number, e: any) => a + e.cost, 0);
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));
  console.log(JSON.stringify({ run: RUN, completed, pending: tasks.length - completed, spent: Number(spent.toFixed(4)), stats, wallSeconds: Math.round((Date.now() - started) / 1000), ledgerTotal: Number(ledger.total.toFixed(4)) }, null, 1));
  console.log(stopped ? "RUN_STOPPED" : "RUN_DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
