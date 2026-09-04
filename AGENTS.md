# visibility-ladder

Working repository for the paper on how much hierarchical context a worker sub-agent should see. Private while the paper is in preparation.

Conventions that matter here:

- No em dashes anywhere: prose, code comments, commit messages, UI copy.
- Write `eve` in lowercase.
- Real datasets only; stimuli may be authored but their inputs come from real data.
- Every citation is resolved against the arXiv API or Crossref before it enters `literature/refs.bib`; author initials are never expanded.
- Every number printed in the paper or the package is generated from artifacts under `runs/` and `analysis/`, never typed by hand.
- Never print the contents of `.env.local`; filter command output for the key before showing it.
- `runs/*.jsonl` are append-only gateway records; the checker is frozen at the hash recorded in `PREREGISTRATION.md`; pre-registered items under `probes/items-suite-a/` are not edited.
- Commit and push only when asked.
