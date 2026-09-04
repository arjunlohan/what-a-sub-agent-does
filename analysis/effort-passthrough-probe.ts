/**
 * Pass-through probe for the provider-level effort field on DeepSeek through the gateway: an undocumented value
 * (bogus) twice and the documented compatibility value (medium, which DeepSeek maps to high) once, on one Suite A
 * item at V4. A provider-side rejection of the undocumented value proves the field reaches DeepSeek; a silent
 * success proves nothing either way. Writes runs/effort-passthrough-probe.json.
 * Run from the repo root: set -a; source .env.local; set +a; pnpm tsx visibility-paper/analysis/effort-passthrough-probe.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODELS } from "../harness/models";
import { callWorker } from "../harness/gateway";
import { loadItems, RUNS } from "../harness/items";
import { buildPrompt } from "../harness/prompts";
const all = loadItems();
const idx = all.findIndex((it) => it.id === "ASU-01");
const p = buildPrompt(all[idx]!, "V4", idx, all);
const out: any[] = [];
for (const value of ["bogus", "bogus", "medium"]) {
  const r = await callWorker(MODELS.deepseek, p.system, p.user, { temperature: 0, reasoning: null, providerReasoning: value });
  const rec = { value, ok: r.ok, error: r.error, warnings: r.warnings, provider: r.provider, generationId: r.generationId, reasoningTokens: r.reasoningTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs, cost: r.cost };
  out.push(rec); console.log(JSON.stringify(rec));
}
writeFileSync(join(RUNS, "effort-passthrough-probe.json"), JSON.stringify(out, null, 1));
console.log("PROBE_OK");
