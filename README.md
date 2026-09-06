# The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems

Data, stimuli, harness and analysis for a pre-registered study of how much of the hierarchy a delegated worker agent should see, and what it does when it sees it. The paper is in preparation; the preprint link will be added here when it is public.

## What is here

- `PROTOCOL.md`, `PREREGISTRATION.md`, `analysis/prereg-manifest.json` and the pre-registration archive: the frozen design, items and checker for Suite A (archive hash in the manifest), plus dated corrections after pre-registration.
- `DECISIONS.md`: the dated log of every ruling, result and revision, including checker hashes.
- `probes/`: stimulus generators, data and the 200 pre-registered items (`items-suite-a/`) and the 30 pilot items (`items/`).
- `harness/`: gateway client, visibility ladder prompts, deterministic checkers, run loop.
- `runs/`: every recorded model call as JSONL, with the billed cost, provider routing and the checker hash; Suite A main block, temperature arm, pilot-overlap block, effort checks; Suite B first pass, second pass of the concurrent code family, and the final assembled set (`suiteb-final.jsonl`).
- `analysis/`: statistics, the pre-registered Suite A analysis, mixed models, audit samples and returns, package builders; `suiteb/`: the live orchestrator-worker harness, its arbiter and analysis.
- `literature/`: the verified bibliography (`refs.bib`, `verification-log.csv`), the web sweeps and their reports, model and gateway facts; `deployment.md`: the harness policy table with sources.
- `SUITE-B.md`: the Suite B design and its pre-registered predictions.

## Running

Node 22 or newer and pnpm; a Vercel AI Gateway key in `.env.local` (see `.env.example`).

```bash
pnpm install
pnpm checker-tests
```

Suite A: `bash run-suite-a.sh` (environment variables select models, conditions, draws and budgets). Suite B additionally needs a MySQL database named `lore` for the extraction family. Every number in the paper is generated from `runs/` and `analysis/` by scripts in this repository.

## Data notes

Stimulus inputs come from real material: survey and job-candidate tables, READMEs and distribution listings of installed packages, and this project's own source files. Third-party content is reproduced for research under its own terms.

## License

Code is under the MIT License and the data and documentation under CC BY 4.0; third-party stimulus material stays under its own terms. See LICENSE.
