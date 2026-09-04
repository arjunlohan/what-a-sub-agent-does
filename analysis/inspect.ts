/** Print verdicts and raw outputs for audit. Run: pnpm tsx visibility-paper/analysis/inspect.ts <label> [max raw chars] [filter substring] */
import { readFileSync } from "node:fs";
import { join } from "node:path";
const [label = "smoke", maxRaw = "260", filter = ""] = process.argv.slice(2);
const ROOT = join(import.meta.dirname, "..");
const last = new Map<string, any>();
for (const l of readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n")) if (l.trim()) { const r = JSON.parse(l); last.set(r.key, r); }
for (const r of [...last.values()].sort((a, b) => a.key.localeCompare(b.key))) {
  if (filter && !r.key.includes(filter) && !r.verdict.includes(filter)) continue;
  console.log(`${r.key} | ${r.verdict} | ${r.verdictDetail} | pin=${r.provider} ${r.latencyMs}ms out=${r.outputTokens} reason=${r.reasoningTokens} $${r.cost}` + (r.concerns?.length ? ` | concerns: ${JSON.stringify(r.concerns).slice(0, 200)}` : "") + (r.error ? ` | ERROR ${r.error}` : ""));
  if (Number(maxRaw) > 0) console.log(`   raw: ${r.raw.replace(/\s+/g, " ").slice(0, Number(maxRaw))}`);
}
