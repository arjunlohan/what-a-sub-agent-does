/**
 * Aggregate the fresh-context audit returns for Suite B (analysis/suiteb-audit-parts/*.json, arrays of
 * {key, checkerVerdict, auditVerdict, objectiveDirected, announced, agrees, uncertain, note}) against the planted-worker
 * records in runs/<label>.jsonl. Writes analysis/suiteb-audit.json. Run: pnpm tsx visibility-paper/suiteb/audit-aggregate.ts [label]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const label = process.argv[2] ?? "suiteb-full";
const dir = join(ROOT, "analysis", process.env.SB_AUDIT_PARTS ?? "suiteb-audit-parts");
const parts = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const rows: any[] = []; const seen = new Set<string>();
for (const f of parts) for (const r of JSON.parse(readFileSync(join(dir, f), "utf8"))) { if (seen.has(r.key)) continue; seen.add(r.key); rows.push({ ...r, part: f }); }
const recs = new Map<string, any>(); for (const l of readFileSync(join(ROOT, "runs", `${label}.jsonl`), "utf8").split("\n")) { if (!l.trim()) continue; const r = JSON.parse(l); if (r.kind === "worker") recs.set(r.key, r); }
for (const r of rows) { const rec = recs.get(r.key); r.checkerVerdictActual = rec?.verdict ?? null; r.family = rec?.family; r.model = rec?.model; r.condition = rec?.condition; r.checkerDisclosure = rec?.disclosure ?? null; }
const agree = (r: any) => r.auditVerdict === r.checkerVerdictActual;
const dev = rows.filter((r) => r.checkerVerdictActual === "DEVIATED"); const non = rows.filter((r) => r.checkerVerdictActual && r.checkerVerdictActual !== "DEVIATED");
const summary = {
  parts, audited: rows.length, verdictAgreement: rows.filter(agree).length / Math.max(1, rows.length), uncertain: rows.filter((r) => r.uncertain).length,
  onDeviated: { n: dev.length, verdictAgreement: dev.filter(agree).length / Math.max(1, dev.length), confirmedOwnDeparture: dev.filter((r) => r.auditVerdict === "DEVIATED" && !r.uncertain).length, uncertain: dev.filter((r) => r.uncertain).length, auditSaysNotDeviated: dev.filter((r) => r.auditVerdict !== "DEVIATED").map((r) => ({ key: r.key, audit: r.auditVerdict, note: r.note })), announcedAgreement: dev.filter((r) => r.auditVerdict === "DEVIATED").filter((r) => (r.announced === true) === (r.checkerDisclosure !== "silent")).length },
  onNonDeviated: { n: non.length, verdictAgreement: non.filter(agree).length / Math.max(1, non.length), missedDeviations: non.filter((r) => r.auditVerdict === "DEVIATED").map((r) => ({ key: r.key, checker: r.checkerVerdictActual, note: r.note })), byChecker: Object.fromEntries([...new Set(non.map((r) => r.checkerVerdictActual))].map((v) => [v, { n: non.filter((r) => r.checkerVerdictActual === v).length, agree: non.filter((r) => r.checkerVerdictActual === v && agree(r)).length }])) },
  byFamily: Object.fromEntries([...new Set(rows.map((r) => r.family))].map((f) => [f, { n: rows.filter((r) => r.family === f).length, agree: rows.filter((r) => r.family === f && agree(r)).length, uncertain: rows.filter((r) => r.family === f && r.uncertain).length }])),
  disagreements: rows.filter((r) => !agree(r)).map((r) => ({ key: r.key, checker: r.checkerVerdictActual, audit: r.auditVerdict, uncertain: !!r.uncertain, note: r.note })),
};
writeFileSync(join(ROOT, "analysis", `${process.env.SB_AUDIT_OUT ?? "suiteb-audit"}.json`), JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1)); console.log("SUITEB_AUDIT_AGGREGATE_OK");
