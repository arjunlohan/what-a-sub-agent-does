# The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems

Data, stimuli, harness and analysis for a pre-registered study of how much of the hierarchy a delegated worker agent should see, and what it does when it sees it.

Preprint: https://doi.org/10.5281/zenodo.22433898 (this DOI resolves to the latest version; version 1 is https://doi.org/10.5281/zenodo.22433899 and version 2 is https://doi.org/10.5281/zenodo.22548556).

## What is here

- `PROTOCOL.md`, `PREREGISTRATION.md`, `analysis/prereg-manifest.json` and the pre-registration archive: the frozen design, items and checker for Suite A (archive hash in the manifest), plus dated corrections after pre-registration.
- `DECISIONS.md`: the dated log of every ruling, result and revision, including checker hashes.
- `probes/`: stimulus generators, data and the 200 pre-registered items (`items-suite-a/`) and the 30 pilot items (`items/`).
- `harness/`: gateway client, visibility ladder prompts, deterministic checkers, run loop.
- `runs/`: every recorded model call as JSONL, with the billed cost, provider routing and the checker hash; Suite A main block, temperature arm, pilot-overlap block, effort checks; Suite B first pass, second pass of the concurrent code family, and the final assembled set (`suiteb-final.jsonl`).
- `analysis/`: statistics, the pre-registered Suite A analysis, mixed models, audit samples and returns, package builders; `suiteb/`: the live orchestrator-worker harness, its arbiter and analysis.
- `literature/`: the verified bibliography (`refs.bib`, `verification-log.csv`), the web sweeps and their reports, model and gateway facts; `deployment.md`: the harness policy table with sources.
- `SUITE-B.md`: the Suite B design and its pre-registered predictions.
- Third model, OpenAI GPT-6.1 Sol (added 2026-10-05, after the analysis plan was fixed; served through Amazon Bedrock): `runs/suite-a-sol.jsonl` and `runs/suite-a-sol-temp.jsonl` (Suite A main block and temperature arm), with `.frozen` and `.rescored` versions scored by the frozen and the revised checker; `runs/suiteb-sol.jsonl` and `runs/suiteb-sol.rescored.jsonl` (Suite B), with the seven task runs rerun after a credential-fallback error kept in `runs/suiteb-sol.before-rerun-20261005.jsonl` and `runs/suiteb-sol.rerun-failures.jsonl`; `runs/sol-pilot.jsonl`, `runs/suiteb-sol-smoke.jsonl` and `runs/bedrock-sol-check.json` (pilot, smoke and routing check); `run-sol.sh` (the launcher). `harness/checkers.frozen-9179f04a.ts` is the pre-registered checker file, used to score later arms under the frozen checker.
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

## Citation

Arjun Lohan. The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems. Preprint, Zenodo, 2026. https://doi.org/10.5281/zenodo.22433898

## Data notes

Stimulus inputs come from real material: survey and job-candidate tables, READMEs and distribution listings of installed packages, and this project's own source files. Third-party content is reproduced for research under its own terms.

## License

Code is under the MIT License and the data and documentation under CC BY 4.0; third-party stimulus material stays under its own terms. See LICENSE.
