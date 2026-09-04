# Pre-registration of Suite A

Generated 2026-09-03T16:52:33.766Z by analysis/prereg.ts.

- Registration set: 138 files (items, real inputs, harness, checker, protocol v3.1, rulings, analysis plan and scripts, pilot audits, referee verdict and response), archived as `analysis/visibility-suite-a-prereg-20260903.tar.gz`.
- Archive sha256: `1d19791da41b18520007e48c17d3156a686d2b02da58d8b27b5a048470273508` (553,688 bytes).
- Checker frozen at hash `9179f04a49c2cba4` (harness/checkers.ts); any later change is disclosed and applied by rescoring under both versions.
- Items: 200 Suite A items (probes/items-suite-a), 30 pilot items (probes/items) rerun as the contamination block.
- Git: annotated tag `visibility-suite-a-prereg-20260903` on the commit that contains this file (local until pushed).

Public timestamp (the author's step; any one of these, all carrying the archive hash above):
1. Push the tag and create a GitHub release from it: `git push origin visibility-suite-a-prereg-20260903` then `gh release create visibility-suite-a-prereg-20260903 analysis/visibility-suite-a-prereg-20260903.tar.gz --title "visibility-suite-a-prereg-20260903" --notes "sha256 1d19791da41b18520007e48c17d3156a686d2b02da58d8b27b5a048470273508"` (the release's server-side timestamp is the public record).
2. Zenodo: upload `analysis/visibility-suite-a-prereg-20260903.tar.gz` as a new record, put the sha256 in the description, publish; Zenodo records the file checksum and the publication date.
3. OSF: create a registration with the archive attached and the sha256 in the summary.

Analysis plan (PROTOCOL.md section 8): one primary test per model, McNemar exact between the lowest and highest hierarchical rung on item-level indicators, Holm across the two models; a Holm-corrected secondary family of adjacent-step, filler, framing, authority and position contrasts; trend test and a separation-safe GLMM as supporting analyses; FLAGGED, announced versus silent, domain, salience, harm class and reasoning volume exploratory. Gates and the reversal condition: PROTOCOL.md section 11.
