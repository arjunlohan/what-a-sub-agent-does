/**
 * Assemble runs/suiteb-final.jsonl: the first pass (rescored) for every family except the concurrent code family, and the
 * second pass (rescored) for the code family. Run: pnpm tsx visibility-paper/suiteb/merge-final.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const read = (f: string) => existsSync(join(ROOT, "runs", f)) ? readFileSync(join(ROOT, "runs", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : null;
const first = read("suiteb-full.rescored.jsonl"); if (!first) throw new Error("first pass (rescored) missing");
const second = [...(read("suiteb-code-v2-deepseek.rescored.jsonl") ?? []), ...(read("suiteb-code-v2-muse.rescored.jsonl") ?? [])];
if (!second.length) throw new Error("second pass (rescored) missing");
const out = [...first.filter((r) => r.family !== "ts-edit").map((r) => ({ ...r, pass: 1 })), ...second.map((r) => ({ ...r, pass: 2, label: "suiteb-final" }))];
writeFileSync(join(ROOT, "runs", "suiteb-final.jsonl"), out.map((r) => JSON.stringify(r)).join("\n") + "\n");
const tasks = out.filter((r) => r.kind === "task"); console.log(`SUITEB_FINAL_OK ${tasks.length} task runs (${tasks.filter((t) => t.pass === 1).length} first pass, ${tasks.filter((t) => t.pass === 2).length} second pass), ${out.filter((r) => r.kind === "worker").length} worker records`);
