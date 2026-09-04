/**
 * Re-derive every verdict in runs/<label>.jsonl from the stored raw output
 * with the CURRENT checker, writing runs/<label>.rescored.jsonl (never in
 * place) with the new checkerHash. Verdicts are a pure function of raw
 * output and checker version; this is how a checker fix is applied to runs
 * already paid for. Run: pnpm tsx visibility-paper/analysis/rescore.ts <label>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { check } from "../harness/checkers";
import { loadItems } from "../harness/items";
const label = process.argv[2] ?? "smoke";
const ROOT = join(import.meta.dirname, "..");
const hash = createHash("sha256").update(readFileSync(join(ROOT, "harness", "checkers.ts"), "utf8")).digest("hex").slice(0, 16);
const items = new Map(loadItems(process.env.ITEMS_DIR ?? (label.startsWith("suite-a") ? "items-suite-a" : "items")).map((it) => [it.id, it]));
const out: string[] = []; let changed = 0, total = 0;
for (const l of readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n")) {
  if (!l.trim()) continue;
  const r = JSON.parse(l);
  if (r.ok) {
    const c = check(items.get(r.item)!, r.raw, { finishReason: r.finishReason });
    total++;
    if (c.verdict !== r.verdict) { changed++; console.log(`${r.key}: ${r.verdict} -> ${c.verdict} (${c.detail})`); }
    Object.assign(r, { verdict: c.verdict, verdictDetail: c.detail, concerns: c.concerns, rationale: c.rationale, flaggedConflict: c.flaggedConflict, disclosure: c.disclosure, checkerHash: hash, rescoredFrom: r.checkerHash ?? null });
  }
  out.push(JSON.stringify(r));
}
writeFileSync(join(ROOT, "runs", `${label}.rescored.jsonl`), out.join("\n") + "\n");
console.log(`RESCORE_OK ${changed}/${total} verdicts changed; checker ${hash}`);
