/**
 * Ingest the literature workflow's journal (agent return values) into the
 * repo: verified bibliography, BibTeX, verification log, lab visibility
 * table, deep reads, harness deployment table, venues, critic. Agents are
 * classified by the shape of what they returned; entries are deduplicated
 * by normalized identifier. Run: pnpm tsx visibility-paper/analysis/ingest-workflow.ts <journal.jsonl | workflow-result.json as base> ...
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const journals = process.argv.slice(2);
if (!journals.length) throw new Error("journal path(s) required; later journals override earlier ones by key or identifier");
type Entry = { key: string; id_type: string; id: string; title: string; authors: string; year: number; venue: string; url: string; use: string; tier: string; cluster: string; verified_at: string; verification_source: string; note?: string };
const sweeps: any[] = [], labs: any[] = [], deeps: any[] = [], harness: any[] = [], venues: any[] = [], critics: any[] = [], fixes: any[] = [];
for (const journal of journals) {
  if (journal.endsWith(".json")) { // a workflow-result.json written by an earlier ingest serves as the base; later journals override it
    const b = JSON.parse(readFileSync(journal, "utf8"));
    if (Array.isArray(b.entries)) sweeps.push({ entries: b.entries, rejected: b.rejected ?? [] });
    for (const h of b.harnesses ?? []) harness.push(h);
    for (const d of b.deep_reads ?? []) deeps.push(d);
    if (Array.isArray(b.lab_visibility) && b.lab_visibility.length) labs.push({ entries: [], lab_visibility: b.lab_visibility });
    for (const v of b.venues ?? []) venues.push(v);
    if (b.critic) critics.push(b.critic);
    continue;
  }
  for (const line of readFileSync(journal, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const j = JSON.parse(line);
  if (j.type !== "result" || !j.result || typeof j.result !== "object") continue;
  const r = j.result;
  if (Array.isArray(r.harnesses)) harness.push(r);
  else if (Array.isArray(r.venues)) venues.push(r);
  else if (typeof r.read_in_full === "boolean") deeps.push(r);
  else if (Array.isArray(r.gaps)) critics.push(r);
  else if (Array.isArray(r.lab_visibility)) labs.push(r);
  else if (Array.isArray(r.drop_keys)) fixes.push(r);
  else if (Array.isArray(r.entries)) sweeps.push(r);
}}
const norm = (e: Entry) => (e.id_type === "arxiv" ? e.id.replace(/^arxiv:/i, "").replace(/v\d+$/, "") : e.id).toLowerCase().trim();
const byId = new Map<string, Entry>();
const byKey = new Map<string, string>(); // key -> normalized id
const dupes: string[] = [];
for (const s of [...sweeps, ...labs, ...fixes]) for (const e of (s.entries as Entry[])) {
  const k = norm(e);
  const isFix = Array.isArray(s.drop_keys);
  const prevIdOfKey = byKey.get(e.key);
  if (prevIdOfKey && prevIdOfKey !== k) { byId.delete(prevIdOfKey); } // same key re-resolved to a new identifier: replace
  const prev = byId.get(k);
  if (prev && !isFix && !prevIdOfKey) { dupes.push(`${k}: ${prev.cluster} + ${e.cluster}`); if (!prev.cluster.includes(e.cluster)) prev.cluster += `,${e.cluster}`; if (e.tier === "must") prev.tier = "must"; continue; }
  if (isFix && /\d{4}/.test(e.key) && !e.key.includes(String(e.year))) { const oldKey = e.key; e.key = e.key.replace(/\d{4}/, String(e.year)); byKey.delete(oldKey); (e as any).note = `${e.note ? e.note + " " : ""}Key renamed from ${oldKey} to match the cited edition's year.`; }
  if (prev && isFix) { const merged = { ...prev, ...e }; if (prev.cluster && !merged.cluster.includes(prev.cluster.split(",")[0])) merged.cluster = `${e.cluster},${prev.cluster}`; byId.set(k, merged); byKey.set(e.key, k); continue; }
  byId.set(k, { ...e }); byKey.set(e.key, k);
}
const dropped: string[] = [];
for (const f of fixes) for (const key of (f.drop_keys as string[])) { const id = byKey.get(key); if (id !== undefined) { byId.delete(id); byKey.delete(key); dropped.push(key); } }
const entries = [...byId.values()].sort((a, b) => a.cluster.localeCompare(b.cluster) || b.year - a.year || a.key.localeCompare(b.key));
const rejected = [...sweeps, ...labs, ...fixes].flatMap((s) => s.rejected ?? []);
const labVis = labs.flatMap((s) => s.lab_visibility ?? []);
const lit = join(ROOT, "literature"); mkdirSync(lit, { recursive: true });
writeFileSync(join(lit, "workflow-result.json"), JSON.stringify({ counts: { entries: entries.length, rejected: rejected.length, duplicates: dupes.length, dropped: dropped.length, fixes: fixes.length, deep_reads: deeps.length, harness_rows: harness.flatMap((h) => h.harnesses).length, venues: venues.flatMap((v) => v.venues).length, critics: critics.length }, entries, rejected, duplicates: dupes, lab_visibility: labVis, deep_reads: deeps, harnesses: harness, venues, critic: critics[0] ?? null }, null, 1));
// ---- BibTeX
const bibEsc = (s: string) => s.replace(/[{}]/g, "").replace(/\\/g, "");
const bib = entries.map((e) => {
  const fields: string[] = [`  title = {{${bibEsc(e.title)}}}`, `  author = {${bibEsc(e.authors)}}`, `  year = {${e.year}}`];
  let type = "misc";
  if (e.id_type === "arxiv") { fields.push(`  eprint = {${e.id.replace(/^arxiv:/i, "")}}`, `  archivePrefix = {arXiv}`, `  url = {${e.url}}`); if (e.venue && !/arxiv/i.test(e.venue)) fields.push(`  note = {${bibEsc(e.venue)}}`); }
  else if (e.id_type === "doi") { type = "article"; fields.push(`  journal = {${bibEsc(e.venue)}}`, `  doi = {${e.id.replace(/^https?:\/\/doi\.org\//i, "")}}`); }
  else { fields.push(`  howpublished = {\\url{${e.url}}}`, `  note = {${bibEsc(e.venue)}}`); }
  return `@${type}{${e.key},\n${fields.join(",\n")}\n}`;
}).join("\n\n");
writeFileSync(join(lit, "refs.bib"), `% Generated by analysis/ingest-workflow.ts; every entry resolved against arXiv or Crossref by the sweep agents (see verification-log.csv).\n\n${bib}\n`);
// ---- verification log
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
writeFileSync(join(lit, "verification-log.csv"), ["key,id_type,id,title,year,venue,cluster,tier,verified_at,verification_source,url", ...entries.map((e) => [e.key, e.id_type, e.id, e.title, e.year, e.venue, e.cluster, e.tier, e.verified_at, e.verification_source, e.url].map(csv).join(","))].join("\n") + "\n");
writeFileSync(join(lit, "rejected.csv"), ["candidate,reason", ...rejected.map((r: any) => [r.candidate, r.reason].map(csv).join(","))].join("\n") + "\n");
// ---- bibliography.md
const clusters = [...new Set(entries.map((e) => e.cluster.split(",")[0]))].sort();
let md = `# Verified literature base\n\nGenerated ${new Date().toISOString()} from the literature workflow journal by analysis/ingest-workflow.ts. ${entries.length} entries, every one resolved against the arXiv API or Crossref by the sweep agent that proposed it (identifier, fetch URL and timestamp in verification-log.csv); ${rejected.length} candidates rejected (rejected.csv); ${dupes.length} cross-cluster duplicates merged.\n\n`;
for (const c of clusters) {
  const es = entries.filter((e) => e.cluster.split(",")[0] === c);
  md += `## ${c} (${es.length})\n\n`;
  for (const e of es) md += `- **${e.title}**. ${e.authors.replace(/ and /g, ", ")} (${e.year}). ${e.venue}. ${e.id_type === "arxiv" ? `arXiv:${e.id.replace(/^arxiv:/i, "")}` : e.id_type === "doi" ? `doi:${e.id}` : e.url}. Tier: ${e.tier}. Use: ${e.use}${e.note ? ` Note: ${e.note}` : ""}\n`;
  md += "\n";
}
writeFileSync(join(lit, "bibliography.md"), md);
// ---- lab visibility
writeFileSync(join(lit, "lab-visibility.md"), `# What each lab's published system lets a sub-agent see\n\n| Lab | System | What the sub-agent sees | Source | Verified |\n|---|---|---|---|---|\n${labVis.map((l: any) => `| ${l.lab} | ${l.system} | ${l.what_subagent_sees}${l.quote ? ` ("${l.quote}")` : ""} | ${l.source_url} | ${l.verified_at} |`).join("\n")}\n`);
// ---- deep reads
writeFileSync(join(lit, "deep-reads.md"), `# Closest papers, read in full\n\n${deeps.map((d: any) => `## ${d.id}: ${d.title}\n\n- Read in full: ${d.read_in_full} (${d.text_source ?? "n/a"}); verified ${d.verified_at}\n- Manipulated: ${d.what_is_manipulated}\n- Measured: ${d.what_is_measured}\n- Models and tasks: ${d.models_and_tasks}\n- Key numbers: ${d.key_numbers ?? "n/a"}\n- Worker-side dose covered: ${d.worker_side_dose_covered}\n- Threat to novelty: ${d.threat_to_novelty ?? "n/a"}\n- Overlap: ${d.overlap}\n- Differentiation: ${d.differentiation}\n- Must cite:\n${(d.must_cite_sentences ?? []).map((s: string) => `  - ${s}`).join("\n")}\n`).join("\n")}`);
// ---- deployment table
const hsAll = harness.flatMap((h) => h.harnesses); const hsKey = (h: any) => String(h.name).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12); const hsMap = new Map<string, any>(); for (const h of hsAll) hsMap.set(hsKey(h), h); const hs = [...hsMap.values()]; // later journals replace earlier rows of the same harness
writeFileSync(join(ROOT, "deployment.md"), `# Deployment path: where a visibility policy lives in each harness\n\nGenerated from the harness-docs agent (each row fetched from the official documentation on the date shown). The pilot's recommendation per knob is added by the decision package.\n\n| Harness | Default worker visibility | Native knob | Source | Fetched | Notes |\n|---|---|---|---|---|---|\n${hs.map((h: any) => `| ${h.name} | ${h.default_visibility}${h.quote ? ` ("${h.quote}")` : ""} | ${h.knob} | ${h.doc_url} | ${h.fetched_at} | ${h.notes ?? ""} |`).join("\n")}\n\n${harness.map((h) => h.notes).filter(Boolean).join("\n\n")}\n`);
// ---- venues
const vs = venues.flatMap((v) => v.venues);
writeFileSync(join(ROOT, "venues.md"), `# Venues (live-checked)\n\n| Venue | Type | Next deadline | Notification | Indexed | APC | Fit | Source | Fetched | Notes |\n|---|---|---|---|---|---|---|---|---|---|\n${vs.map((v: any) => `| ${v.name} | ${v.type} | ${v.next_deadline} | ${v.notification ?? ""} | ${v.indexed ?? ""} | ${v.apc_usd ?? ""} | ${v.fit ?? ""} | ${v.url} | ${v.fetched_at} | ${v.notes ?? ""} |`).join("\n")}\n\n## Recommendation (from the venues agent)\n\n${venues.map((v) => v.recommendation).filter(Boolean).join("\n\n")}\n`);
// ---- critic
if (critics[0]) writeFileSync(join(lit, "critic.md"), `# Completeness critic\n\n${critics[0].summary}\n\n## Gaps\n\n${critics[0].gaps.map((g: any) => `- **${g.area}**: ${g.what_is_missing} Action: ${g.suggested_action}`).join("\n")}\n\n## Suspicious entries\n\n${(critics[0].suspicious_entries ?? []).map((s: any) => `- ${s.key}: ${s.why}`).join("\n") || "none"}\n\n## Duplicates\n\n${(critics[0].duplicates ?? []).join("\n") || "none"}\n`);
const perCluster = Object.fromEntries(clusters.map((c) => [c, entries.filter((e) => e.cluster.split(",")[0] === c).length]));
console.log(JSON.stringify({ journals: journals.length, fixes: fixes.length, dropped, sweeps: sweeps.length, labs: labs.length, deeps: deeps.length, harness: hs.length, venues: vs.length, critics: critics.length, entries: entries.length, rejected: rejected.length, duplicates: dupes.length, perCluster, tiers: { must: entries.filter((e) => e.tier === "must").length, should: entries.filter((e) => e.tier === "should").length, optional: entries.filter((e) => e.tier === "optional").length }, seamOpen: deeps.map((d: any) => `${d.id}:${d.worker_side_dose_covered ? "COVERED" : "open"}/${d.threat_to_novelty}`) }, null, 1));
console.log("INGEST_OK");
