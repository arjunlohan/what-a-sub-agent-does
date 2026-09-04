/**
 * Aggregate the fresh-context audit returns for Suite A (analysis/suite-a-audit-parts/*.json, each a JSON array of
 * {key, checkerVerdict, auditVerdict, objectiveDirected, announced, agrees, note}) against the checker's records.
 * Writes analysis/suite-a-audit.json and prints the agreement table. Run: pnpm tsx visibility-paper/analysis/audit-aggregate.ts
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const dir = join(ROOT, "analysis", "suite-a-audit-parts");
const parts = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const rows: any[] = []; const seen = new Map<string, any>();
for (const f of parts) for (const r of JSON.parse(readFileSync(join(dir, f), "utf8"))) { r.part = f; if (seen.has(r.key)) { seen.get(r.key).duplicateOf = f; rows.push({ ...r, duplicate: true }); continue; } seen.set(r.key, r); rows.push(r); }
const records = new Map<string, any>();
for (const line of readFileSync(join(ROOT, "runs", "suite-a.jsonl"), "utf8").split("\n")) { if (!line.trim()) continue; const r = JSON.parse(line); if (r.ok) records.set(r.key, r); }
const revised = new Map<string, any>(); { const p = join(ROOT, "runs", "suite-a.rescored.jsonl"); if (existsSync(p)) for (const line of readFileSync(p, "utf8").split("\n")) { if (!line.trim()) continue; const r = JSON.parse(line); if (r.ok) revised.set(r.key, r); } }
const uniq = rows.filter((r) => !r.duplicate);
for (const r of uniq) { const rev = revised.get(r.key); r.revisedVerdict = rev?.verdict ?? null; r.revisedDisclosure = rev?.disclosure ?? null; const rec = records.get(r.key); r.checkerVerdictActual = rec?.verdict ?? null; r.checkerAnnounced = rec ? (rec.verdict === "DEVIATED" ? (rec.concerns?.length ?? 0) > 0 : null) : null; r.condition = rec?.condition; r.model = rec?.model; r.domain = rec?.domain; }
const agreesVerdict = (r: any) => r.auditVerdict === r.checkerVerdictActual;
const summary = {
  parts, audited: uniq.length, duplicatesAcrossSamples: rows.length - uniq.length,
  verdictAgreement: uniq.filter(agreesVerdict).length / uniq.length,
  onDeviated: (() => { const d = uniq.filter((r) => r.checkerVerdictActual === "DEVIATED"); return { n: d.length, verdictAgreement: d.filter(agreesVerdict).length / Math.max(1, d.length), objectiveDirected: d.filter((r) => r.auditVerdict === "DEVIATED" && r.objectiveDirected === true).length, notObjectiveDirected: d.filter((r) => r.auditVerdict === "DEVIATED" && r.objectiveDirected === false).length, auditSaysNotDeviated: d.filter((r) => r.auditVerdict !== "DEVIATED").map((r) => ({ key: r.key, audit: r.auditVerdict, note: r.note })) }; })(),
  announcedFlag: (() => { const d = uniq.filter((r) => r.checkerVerdictActual === "DEVIATED" && r.auditVerdict === "DEVIATED"); return { n: d.length, agreement: d.filter((r) => r.announced === r.checkerAnnounced).length / Math.max(1, d.length), checkerSilent: d.filter((r) => r.checkerAnnounced === false).length, checkerSilentAuditAnnounced: d.filter((r) => r.checkerAnnounced === false && r.announced === true).map((r) => ({ key: r.key, note: r.note })), checkerAnnouncedAuditSilent: d.filter((r) => r.checkerAnnounced === true && r.announced === false).map((r) => ({ key: r.key, note: r.note })), auditSilent: d.filter((r) => r.announced === false).length }; })(),
  onNonDeviated: (() => { const d = uniq.filter((r) => r.checkerVerdictActual && r.checkerVerdictActual !== "DEVIATED"); return { n: d.length, verdictAgreement: d.filter(agreesVerdict).length / Math.max(1, d.length), missedDeviations: d.filter((r) => r.auditVerdict === "DEVIATED").map((r) => ({ key: r.key, checker: r.checkerVerdictActual, note: r.note })), byChecker: Object.fromEntries([...new Set(d.map((r) => r.checkerVerdictActual))].map((v) => [v, { n: d.filter((r) => r.checkerVerdictActual === v).length, agree: d.filter((r) => r.checkerVerdictActual === v && agreesVerdict(r)).length }])) }; })(),
  revised: revised.size ? (() => { const withRev = uniq.filter((r) => r.revisedVerdict); const agree = (r: any) => r.auditVerdict === r.revisedVerdict; const d = withRev.filter((r) => r.revisedVerdict === "DEVIATED"); const dd = d.filter((r) => r.auditVerdict === "DEVIATED"); return { n: withRev.length, verdictAgreement: withRev.filter(agree).length / Math.max(1, withRev.length), onDeviated: { n: d.length, verdictAgreement: d.filter(agree).length / Math.max(1, d.length) }, disclosure: { n: dd.length, byRevised: dd.reduce((m: any, r) => { m[r.revisedDisclosure] = (m[r.revisedDisclosure] || 0) + 1; return m; }, {}), auditAnnouncedWhenRevisedSilent: dd.filter((r) => r.revisedDisclosure === "silent" && r.announced === true).map((r) => r.key), auditSilentWhenRevisedNotSilent: dd.filter((r) => r.revisedDisclosure !== "silent" && r.announced === false).map((r) => r.key) }, disagreements: withRev.filter((r) => !agree(r)).map((r) => ({ key: r.key, revised: r.revisedVerdict, audit: r.auditVerdict, note: r.note })) }; })() : null,
  disagreements: uniq.filter((r) => !agreesVerdict(r)).map((r) => ({ key: r.key, checker: r.checkerVerdictActual, audit: r.auditVerdict, note: r.note })),
  byModelDeviated: Object.fromEntries(["deepseek", "muse"].map((m) => { const d = uniq.filter((r) => r.model === m && r.checkerVerdictActual === "DEVIATED"); return [m, { n: d.length, confirmed: d.filter((r) => r.auditVerdict === "DEVIATED").length, objectiveDirected: d.filter((r) => r.auditVerdict === "DEVIATED" && r.objectiveDirected).length, silentConfirmed: d.filter((r) => r.auditVerdict === "DEVIATED" && r.announced === false).length }]; })),
};
writeFileSync(join(ROOT, "analysis", "suite-a-audit.json"), JSON.stringify({ summary, rows: uniq }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.log("AUDIT_AGGREGATE_OK");
