/**
 * Convert a web-sweep workflow result (verified candidates, harness rows, model facts) into
 * (a) a journal that analysis/ingest-workflow.ts merges into the literature base and
 * (b) literature/model-facts.md.
 * Run: pnpm tsx visibility-paper/analysis/ingest-sweep.ts literature/sweep-2026-09-03.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const file = process.argv[2]; if (!file) throw new Error("sweep json path (relative to visibility-paper) required");
const sweep = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const date = (basename(file).match(/\d{4}-\d{2}-\d{2}/) ?? ["2026-09-03"])[0];
const verifiedAt = sweep.completed_at ?? `${date}T00:00:00Z`;
const base = JSON.parse(readFileSync(join(ROOT, "literature", "workflow-result.json"), "utf8"));
const usedKeys = new Set<string>(base.entries.map((e: any) => e.key));
// The verifiers used the sweep prompt's cluster names; map them onto the literature base's clusters.
const CLUSTER: Record<string, string> = { "C1-architectures": "C1-architectures", "C2-instruction-hierarchy": "C6-hierarchy", "C3-goal-drift": "C5-drift", "C4-failure-taxonomy": "C3-failures", "C5-org-theory": "C9-organization-theory", "C6-cost-scaling": "C4-topology", "C7-long-horizon": "C5-drift", "C8-reasoning-effort": "C10-benchmarks-methods", "C9-benchmarks": "C10-benchmarks-methods", "C10-harness-docs": "C11-labs-us" };
const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "are", "can", "its", "into", "how", "why", "what", "when", "who", "not", "llm", "llms", "agent", "agents", "multi", "based", "via", "towards", "toward", "under", "over", "your", "you", "does", "dont", "don", "large", "language", "model", "models", "study", "paper", "report", "system", "systems"]);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
const surname = (s: string) => { const first = (s || "").split(/ and |,|;/)[0].trim(); const toks = first.split(/\s+/); const last = toks[toks.length - 1] ?? ""; return last.toLowerCase().replace(/[^a-z]/g, "") || "web"; };
const mkKey = (author: string, year: number, title: string) => { const k = `${surname(author)}${year}${words(title).slice(0, 2).join("")}`; let kk = k, i = 2; while (usedKeys.has(kk)) kk = `${k}${i++}`; usedKeys.add(kk); return kk; };
const esc = (s: unknown) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const entries: any[] = []; const rejected: any[] = [];
for (const r of sweep.verified ?? []) {
  const title = r.resolved_title || r.title;
  if (r.status !== "verified") { rejected.push({ candidate: r.title, reason: `web sweep ${date}: ${r.status}` }); continue; }
  if (r.tier === "reject") { rejected.push({ candidate: title, reason: `web sweep ${date}: rejected on reading. ${r.abstract_gist ?? ""}`.trim() }); continue; }
  const arx = (r.arxiv_id || "").match(/(\d{4}\.\d{4,5})/)?.[1];
  const doi = (r.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  const id_type = arx ? "arxiv" : doi ? "doi" : "url";
  const id = arx ?? (doi || r.url);
  if (!id) { rejected.push({ candidate: title, reason: `web sweep ${date}: no identifier` }); continue; }
  const year = parseInt(r.year, 10) || parseInt(date, 10);
  let cluster = CLUSTER[r.cluster] ?? r.cluster ?? "C1-architectures";
  if (r.cluster === "C10-harness-docs" && /kimi|moonshot|deepseek|qwen|alibaba|bytedance|zhipu|baidu|tencent/i.test(`${r.url} ${r.venue} ${title}`)) cluster = "C11-labs-cn";
  const authors = r.authors || (id_type === "url" ? (r.venue || "").split("(")[0].trim() : "");
  entries.push({ key: mkKey(authors, year, title), id_type, id, title, authors, year, venue: r.venue || (id_type === "arxiv" ? "arXiv preprint" : ""), url: r.url || (arx ? `https://arxiv.org/abs/${arx}` : ""), use: r.use || "", tier: r.tier || "optional", cluster, verified_at: verifiedAt, verification_source: r.verification_source || r.url || "", note: [`Web sweep ${date} (WebSearch, WebFetch, arXiv API, Crossref).`, `Threat: ${r.threat ?? "none"}.`, r.differentiation ? `Differentiation: ${r.differentiation}` : "", r.abstract_gist ? `Gist: ${r.abstract_gist}` : ""].filter(Boolean).join(" ") });
}
const harnesses = (sweep.harness ?? []).map((h: any) => ({ name: esc(h.harness), default_visibility: esc([h.default_visibility, h.returned_to_parent ? `Returned to parent: ${h.returned_to_parent}` : "", h.sibling_or_ledger_visibility ? `Siblings or ledger: ${h.sibling_or_ledger_visibility}` : ""].filter(Boolean).join(" ")), quote: esc(h.evidence_quote), knob: esc(h.knobs), doc_url: esc(h.source_url), fetched_at: esc(`${date}${h.doc_version_or_date ? ` (doc: ${h.doc_version_or_date})` : ""}`), notes: esc(`${h.status}. ${h.changed_since_first_table ?? ""}`) }));
const changed = (sweep.harness ?? []).filter((h: any) => /^changed/i.test(h.changed_since_first_table ?? "")).map((h: any) => h.harness.split("(")[0].trim());
const added = (sweep.harness ?? []).filter((h: any) => /new row/i.test(h.changed_since_first_table ?? "")).length;
const journal = join(ROOT, "literature", `sweep-${date}.journal.jsonl`);
writeFileSync(journal, [JSON.stringify({ type: "result", key: `web-sweep-${date}-entries`, result: { entries, rejected } }), JSON.stringify({ type: "result", key: `web-sweep-${date}-harness`, result: { harnesses, notes: `Web sweep ${date}: ${harnesses.length} rows fetched from official documentation (${added} new harnesses; rows changed since the first table: ${changed.join(", ") || "none"}). Status per row is in the Notes column; rows for the same harness from the earlier table are replaced.` } })].join("\n") + "\n");
const facts = sweep.model ?? [];
writeFileSync(join(ROOT, "literature", "model-facts.md"), `# Model and gateway facts (web sweep ${date})\n\nEach fact was fetched from the source page by the model-facts agent on ${date}; the DeepSeek rate card, the Meta contributor terms and the DeepSeek privacy policy were additionally fetched directly (DECISIONS.md, ${date}).\n\n| Topic | Claim | Evidence quote | Source | Confidence | Implication |\n|---|---|---|---|---|---|\n${facts.map((f: any) => `| ${esc(f.topic)} | ${esc(f.claim)} | ${esc(f.evidence_quote)} | ${esc(f.source_url)} | ${esc(f.confidence)} | ${esc(f.implication)} |`).join("\n")}\n`);
console.log(JSON.stringify({ journal: basename(journal), entries: entries.length, rejected: rejected.length, harness_rows: harnesses.length, added, changed, model_facts: facts.length, tiers: entries.reduce((m: any, e) => { m[e.tier] = (m[e.tier] || 0) + 1; return m; }, {}) }));
console.log("INGEST_SWEEP_OK");
