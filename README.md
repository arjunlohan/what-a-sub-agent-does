# The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems

Data, stimuli, harness and analysis for a study, with a pre-specified analysis plan, of how much of the hierarchy a delegated worker agent should see, and what it does when it sees it.

Preprint: https://doi.org/10.5281/zenodo.22433898 (this DOI resolves to the latest version; version 1 is https://doi.org/10.5281/zenodo.22433899 and version 2 is https://doi.org/10.5281/zenodo.22548556).

## What is here

- `PROTOCOL.md`, `PREREGISTRATION.md`, `analysis/prereg-manifest.json` and the registration archive: the frozen design, items and checker for Suite A (archive hash in the manifest), plus dated corrections made after the archive was hashed. The archive was hashed 24 seconds before the first model call, and its first public timestamp came during collection, so the plan is pre-specified and attested by the author, not independently pre-registered.
- `DECISIONS.md`: the dated log of every ruling, result and revision, including checker hashes.
- `probes/`: stimulus generators, data and the 200 pre-specified items (`items-suite-a/`) and the 30 pilot items (`items/`).
- `harness/`: gateway client, visibility ladder prompts, deterministic checkers, run loop.
- `runs/`: every recorded model call as JSONL, with the billed cost, provider routing and the checker hash; Suite A main block, temperature arm, pilot-overlap block, effort checks; Suite B first pass, second pass of the concurrent code family, and the final assembled set (`suiteb-final.jsonl`).
- `analysis/`: statistics, the pre-specified Suite A analysis, mixed models, audit samples and returns, package builders; `suiteb/`: the live orchestrator-worker harness, its arbiter and analysis.
- `literature/`: the verified bibliography (`refs.bib`, `verification-log.csv`), the web sweeps and their reports, model and gateway facts; `deployment.md`: the harness policy table with sources.
- `SUITE-B.md`: the Suite B design and the predictions fixed before its launch.
- Third model, OpenAI GPT-6.1 Sol (added 2026-10-05, after the analysis plan was fixed; served through Amazon Bedrock): `runs/suite-a-sol.jsonl` and `runs/suite-a-sol-temp.jsonl` (Suite A main block and temperature arm), with `.frozen` and `.rescored` versions scored by the frozen and the revised checker; `runs/suiteb-sol.jsonl` and `runs/suiteb-sol.rescored.jsonl` (Suite B), with the seven task runs rerun after a credential-fallback error kept in `runs/suiteb-sol.before-rerun-20261005.jsonl` and `runs/suiteb-sol.rerun-failures.jsonl`; `runs/sol-pilot.jsonl`, `runs/suiteb-sol-smoke.jsonl` and `runs/bedrock-sol-check.json` (pilot, smoke and routing check); `run-sol.sh` (the launcher). `harness/checkers.frozen-9179f04a.ts` is the pre-specified checker file, used to score later arms under the frozen checker.
- `paper/build-numbers.ts` and `paper/figures.py`: the generators that turn the artifacts above into every number and figure in the paper (`paper/gen/numbers.json` lists each number with its value; `paper/gen/` holds the generated tables and `paper/figures/` the figures). The manuscript sources are not in this repository.

## Running

Node 22 or newer and pnpm; a Vercel AI Gateway key in `.env.local` (see `.env.example`).

```bash
pnpm install
pnpm checker-tests
```

Suite A: `bash run-suite-a.sh` (environment variables select models, conditions, draws and budgets). Suite B additionally needs a MySQL database named `lore` for the extraction family.

## Reproducing the numbers

The recorded runs are included, so the analysis reproduces without any model call. From the repository root:

```bash
pnpm tsx analysis/suite-a-analysis.ts                    # Suite A under the frozen checker (analysis/suite-a-results.json)
SUITE_A_SUFFIX=.rescored pnpm tsx analysis/suite-a-analysis.ts   # the same under the revised checker
pnpm tsx analysis/effort-cross.ts                        # effort cross (analysis/effort-cross.json)
pnpm tsx analysis/effort-levels.ts                       # DeepSeek effort levels (analysis/effort-levels.json)
pnpm tsx suiteb/analyze.ts suiteb-final                  # Suite B aggregates and predictions
pnpm tsx analysis/suiteb-redundancy.ts                   # the P4 duplication measure
RESCORE_CHECKER=frozen pnpm tsx analysis/rescore.ts suite-a-sol   # GPT-6.1 Sol under the frozen checker (runs/suite-a-sol.frozen.jsonl)
SUITE_A_LABEL=suite-a-sol SUITE_A_SUFFIX=.frozen pnpm tsx analysis/suite-a-analysis.ts     # Sol results (analysis/suite-a-results-sol.frozen.json)
SUITE_A_LABEL=suite-a-sol SUITE_A_SUFFIX=.rescored pnpm tsx analysis/suite-a-analysis.ts   # the same under the revised checker
pnpm tsx suiteb/analyze.ts suiteb-sol.rescored           # Sol Suite B aggregates
python3 analysis/glmm.py                                 # mixed models (needs statsmodels, numpy, pandas)
pnpm tsx paper/build-numbers.ts                          # every number in the paper, to paper/gen/
python3 paper/figures.py                                 # the figures, to paper/figures/ (needs matplotlib)
```

Verdicts are a pure function of the stored output and the checker version. The Suite A checker hashes are 9179f04a49c2cba4 (frozen before the run) and dc79531ca3f268a8 (revised after the audit); the Suite B arbiter logic is 5244f7de5c54a4f2. `pnpm checker-tests` runs the 887 fixture tests; `analysis/rescore.ts <label>` re-derives every verdict of a run file with the current checker.

## Revision analyses (v1.1.0)

Added for the journal revision on 2026-10-23 (rulings and findings in `DECISIONS.md`). They re-analyse the stored run records; the only new model calls are the audit's judge calls.

- `analysis/revision-suite-a.py`: Suite A under the frozen and the revised checker. Paired item-level contrasts (exact McNemar, Wilson and Tango intervals, Holm within the registered families), the conflict-naming escalation measure, an exact within-item permutation trend test and GEE with item clusters, exact conditional logistic regression, the dose by model interaction, the registered mixed models refitted by MCMC (PyMC), escalation minus departure, leave-one-domain-out and leave-one-template-out analyses, the defective item excluded, the temperature arm and token matching. Output `analysis/revision-suite-a.json`, with a summary in `analysis/revision-suite-a-report.md` and the cells in `analysis/revision-suite-a-cells.csv`.
- Blinded audit of the Suite A verdicts (`analysis/audit2.ts`): a stratified sample of 429 records over all three models (`runs/audit2-sample.json`) and a census extension (every summary that failed only its word limit; every other flagged record in V0, V2, V4 and the four controls; every other adhering summary in V0, V4, LM4 and HM4). Judge prompts with their hashes are in `runs/audit2-prompts.jsonl`, `runs/audit2b-prompts.jsonl` and `runs/audit2c-prompts.jsonl`, the raw responses of the two judges (Claude Opus 5.5 and Gemini 4 Argon) in `runs/audit2*-judge-*.jsonl`, and the parsed verdicts in `runs/audit2-judgements.json`. The author's blinded labels are in `runs/audit2-human.json`, with the record map in `runs/audit2-human-map.json` and the labelling page template in `analysis/audit2-labeling.html`. `analysis/audit2_aggregate.py` computes agreement, Cohen's kappa, confirmed and missed departures, the census counts and the adjudicated verdicts (`analysis/audit2.json`, `analysis/audit2-adjudicated.json`).
- `analysis/revision-suite-a-adjudicated.py`: the same Suite A analyses on the audit-adjudicated verdicts (`analysis/revision-suite-a-adjudicated.json`); with `--census`, the contrasts between the cells both censuses cover, with the census corrections added (`analysis/revision-suite-a-census.json`).
- `analysis/revision-suite-b.ts` with `suiteb/attribution.ts`: Suite B's attribution replay (inherited, stale write-back and genuine writes) and the lost-update count (`analysis/revision-suite-b.json`, summary in `analysis/revision-suite-b-report.md`); `suiteb/arbiter.test.ts` runs 11 targeted tests of the arbiter. The script rebuilds the Suite B task definitions from the project-lore checkout whose core module, installed package READMEs and dist directories the tasks copied (see `suiteb/tasks.ts`); that checkout is not part of this repository, so set `SB_REPO_ROOT` and `SB_CORE_DIR` to it. Without them the script stops with an error rather than recomputing with tasks missing.
- `analysis/pilot-material.py` and `analysis/item-templates.py`: Suite A items that reuse pilot inputs, and the 34 stimulus templates.
- `literature/framework-survey-2026-10.csv` and `.md`: the framework survey under written inclusion criteria and classification rules; `literature/revision-additions-2026-10.bib`: the verified literature additions.
- `paper/build-numbers-revision.ts`: every revision number (`paper/gen/numbers-rev.tex`) and table (`paper/gen/rev-*.tex`). It also runs the checker fixtures.

From the repository root (the Python steps used Python 3.14.7 with numpy 2.5.3, scipy 1.18.1, pandas 3.0.5, statsmodels 0.15.0, pymc 6.3.2, arviz 1.3.0 and matplotlib 3.11.1):

```bash
python3 analysis/revision-suite-a.py                     # includes the MCMC refits
pnpm tsx analysis/audit2.ts judgements                   # verdicts from the stored judge responses; no model call
python3 analysis/audit2_aggregate.py
python3 analysis/revision-suite-a-adjudicated.py
python3 analysis/revision-suite-a-adjudicated.py --census
pnpm tsx analysis/revision-suite-b.ts
pnpm tsx suiteb/arbiter.test.ts
pnpm tsx paper/build-numbers.ts && pnpm tsx paper/build-numbers-revision.ts
FIG_STYLE=springer python3 paper/figures.py              # the journal figures, to paper/springer/
```

Re-running the judges (`AUDIT_SET=a|b|c pnpm tsx analysis/audit2.ts judge opus|gemini`) needs a gateway key and appends to the stored responses.

## Citation

Arjun Lohan. The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems. Preprint, Zenodo, 2026. https://doi.org/10.5281/zenodo.22433898

## Data notes

Stimulus inputs come from real material: survey and job-candidate tables, READMEs and distribution listings of installed packages, and this project's own source files. Third-party content is reproduced for research under its own terms.

## License

Code is under the MIT License and the data and documentation under CC BY 4.0; third-party stimulus material stays under its own terms. See LICENSE.
