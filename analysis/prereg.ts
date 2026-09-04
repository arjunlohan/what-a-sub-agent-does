/**
 * Pre-registration packer: archives the frozen registration set (items, inputs, checker, harness, protocol,
 * rulings, analysis plan and scripts), records a sha256 per file and for the archive, and writes
 * analysis/prereg-manifest.json. The git tag and the public deposit (Zenodo or OSF, filed by the author) carry
 * the same archive hash. Run: pnpm tsx visibility-paper/analysis/prereg.ts <tagname>
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
const ROOT = join(import.meta.dirname, "..");
const tag = process.argv[2] ?? "visibility-suite-a-prereg";
const INCLUDE = ["PROTOCOL.md", "DECISIONS.md", "SHARPENED-PROMPT.md", "harness", "probes/items", "probes/items-suite-a", "probes/author.ts", "probes/author-suite-a.ts", "probes/build-inputs.ts", "probes/data", "analysis/stats.ts", "analysis/power.ts", "analysis/power.json", "analysis/pilot-table.ts", "analysis/verify-pilot.ts", "analysis/rescore.ts", "analysis/checker-tests.ts", "analysis/audit.json", "analysis/stimulus-audit.json", "analysis/referee-verdict.json", "analysis/referee-response.json"];
function walk(p: string, out: string[] = []): string[] { const abs = join(ROOT, p); if (!existsSync(abs)) return out; if (statSync(abs).isDirectory()) { for (const n of readdirSync(abs).sort()) walk(join(p, n), out); } else out.push(p); return out; }
const files = INCLUDE.flatMap((p) => walk(p)).filter((f) => !/\.DS_Store$/.test(f));
const sha = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");
const entries = files.map((f) => ({ path: f, bytes: statSync(join(ROOT, f)).size, sha256: sha(readFileSync(join(ROOT, f))) }));
const archive = join(ROOT, "analysis", `${tag}.tar.gz`);
execSync(`tar -czf "${archive}" --exclude .DS_Store -C "${ROOT}" ${files.map((f) => `"${f}"`).join(" ")}`);
const checkerHash = sha(readFileSync(join(ROOT, "harness", "checkers.ts"))).slice(0, 16);
const itemsSuiteA = walk("probes/items-suite-a").reduce((a, f) => a + JSON.parse(readFileSync(join(ROOT, f), "utf8")).length, 0);
const manifest = { tag, createdAt: new Date().toISOString(), archive: relative(ROOT, archive), archiveSha256: sha(readFileSync(archive)), archiveBytes: statSync(archive).size, checkerHash, itemsSuiteA, pilotItems: walk("probes/items").reduce((a, f) => a + JSON.parse(readFileSync(join(ROOT, f), "utf8")).length, 0), fileCount: entries.length, files: entries };
writeFileSync(join(ROOT, "analysis", "prereg-manifest.json"), JSON.stringify(manifest, null, 1));
const doc = `# Pre-registration of Suite A

Generated ${manifest.createdAt} by analysis/prereg.ts.

- Registration set: ${entries.length} files (items, real inputs, harness, checker, protocol v3.1, rulings, analysis plan and scripts, pilot audits, referee verdict and response), archived as \`${manifest.archive}\`.
- Archive sha256: \`${manifest.archiveSha256}\` (${manifest.archiveBytes.toLocaleString()} bytes).
- Checker frozen at hash \`${checkerHash}\` (harness/checkers.ts); any later change is disclosed and applied by rescoring under both versions.
- Items: ${itemsSuiteA} Suite A items (probes/items-suite-a), ${manifest.pilotItems} pilot items (probes/items) rerun as the contamination block.
- Git: annotated tag \`${tag}\` on the commit that contains this file (local until pushed).

Public timestamp (the author's step; any one of these, all carrying the archive hash above):
1. Push the tag and create a GitHub release from it: \`git push origin ${tag}\` then \`gh release create ${tag} ${manifest.archive} --title "${tag}" --notes "sha256 ${manifest.archiveSha256}"\` (the release's server-side timestamp is the public record).
2. Zenodo: upload \`${manifest.archive}\` as a new record, put the sha256 in the description, publish; Zenodo records the file checksum and the publication date.
3. OSF: create a registration with the archive attached and the sha256 in the summary.

Analysis plan (PROTOCOL.md section 8): one primary test per model, McNemar exact between the lowest and highest hierarchical rung on item-level indicators, Holm across the two models; a Holm-corrected secondary family of adjacent-step, filler, framing, authority and position contrasts; trend test and a separation-safe GLMM as supporting analyses; FLAGGED, announced versus silent, domain, salience, harm class and reasoning volume exploratory. Gates and the reversal condition: PROTOCOL.md section 11.
`;
writeFileSync(join(ROOT, "PREREGISTRATION.md"), doc);
console.log(JSON.stringify({ tag, archive: manifest.archive, archiveSha256: manifest.archiveSha256, archiveBytes: manifest.archiveBytes, checkerHash, itemsSuiteA, fileCount: entries.length }, null, 1));
console.log("PREREG_OK");
