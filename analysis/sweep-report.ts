/**
 * Render a web-sweep result (literature/sweep-<date>.json) as literature/sweep-<date>.md:
 * counts, queries per angle, verified entries by tier and threat, and the judge's synthesis.
 * Run: pnpm tsx visibility-paper/analysis/sweep-report.ts literature/sweep-2026-09-03.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const file = process.argv[2]; if (!file) throw new Error("sweep json path required");
const d = JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const date = (basename(file).match(/\d{4}-\d{2}-\d{2}/) ?? ["undated"])[0];
const ok = (d.verified ?? []).filter((r: any) => r.status === "verified");
const count = (xs: any[], f: (x: any) => string) => { const m: Record<string, number> = {}; for (const x of xs) m[f(x)] = (m[f(x)] || 0) + 1; return m; };
const j = d.judge ?? {};
const li = (xs: any[], f: (x: any) => string) => xs.map((x) => `- ${f(x)}`).join("\n") || "- none";
const id = (r: any) => r.arxiv_id ? `arXiv:${r.arxiv_id}` : r.doi ? `doi:${r.doi}` : r.url;
const md = `# Web sweep ${date}

Workflow ${d.run?.workflow ?? ""} (run ${d.run?.run_id ?? ""}; ${d.run?.agents ?? d.counts?.agents} agents; ${d.run?.tool_calls ?? "n/a"} tool calls). ${d.run?.note ?? ""}

## Counts

| Quantity | Value |
|---|---|
| Existing entries at the start | ${d.counts?.known} |
| New candidates after dedupe | ${d.counts?.candidates_fresh} |
| Already known (dropped) | ${d.counts?.dup_known} |
| Cross-angle duplicates (dropped) | ${d.counts?.dup_cross} |
| Verified | ${ok.length} |
| Verified by tier | ${JSON.stringify(count(ok, (r) => r.tier))} |
| Verified by threat | ${JSON.stringify(count(ok, (r) => r.threat))} |
| Harness rows | ${d.counts?.harness_rows} |
| Model facts | ${d.counts?.model_facts} |

## Queries run per angle

${Object.entries(d.queries ?? {}).map(([k, v]: any) => `### ${k} (${v.length})\n\n${v.map((q: string) => `- ${q}`).join("\n")}`).join("\n\n")}

## Judge summary

${j.summary ?? ""}

## Must reads (${(j.must_reads ?? []).length})

${li(j.must_reads ?? [], (m) => `**${m.title}** (${m.id ?? ""}). ${m.why}`)}

## Direct and adjacent threats (${(j.direct_threats ?? []).length})

${li(j.direct_threats ?? [], (t) => `[${t.risk}] **${t.title}** (${t.id ?? ""}). What they did: ${t.what_they_did} How we differ: ${t.how_we_differ}`)}

## Suggested Suite B changes (inputs to the approval decision, not adopted by this document)

${li(j.suite_b_changes ?? [], (s) => s)}

## Suggested framing changes

${li(j.framing_changes ?? [], (s) => s)}

## Suggested harness table changes

${li(j.harness_table_changes ?? [], (s) => s)}

## Suggested model fact changes

${li(j.model_fact_changes ?? [], (s) => s)}

## Surfaces not searched

${li(j.gaps_not_searched ?? [], (s) => s)}

## Verified entries (${ok.length})

${["must", "should", "optional"].map((tier) => `### ${tier} (${ok.filter((r: any) => r.tier === tier).length})\n\n${li(ok.filter((r: any) => r.tier === tier), (r) => `**${r.resolved_title || r.title}** (${r.year}; ${r.venue || ""}; ${id(r)}); threat ${r.threat}; cluster ${r.cluster}. Use: ${r.use}${r.differentiation ? ` Differentiation: ${r.differentiation}` : ""}`)}`).join("\n\n")}
`;
writeFileSync(join(ROOT, "literature", `sweep-${date}.md`), md);
console.log(`SWEEP_REPORT_OK ${md.length} chars`);
