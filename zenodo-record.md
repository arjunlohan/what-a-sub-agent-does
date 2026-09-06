# Zenodo record drafts

Two records are drafted: the preprint (the paper PDF) and the data and code snapshot. Fields not listed below stay empty (Funding, Awards, Alternate identifiers, Journal, Imprint, Thesis, Conference, Domain specific fields).

## Record 1: the preprint

**Files.** The paper PDF (main.pdf, renamed lohan-2026-scope-creep-myth.pdf) and the LaTeX source archive (the-scope-creep-myth-latex.zip).

**Digital Object Identifier.** 10.5281/zenodo.22433899 (reserved).

**Resource type.** Publication, subtype Preprint.

**Title.**

The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems

**Publication date.** The day the record is published (2026-09-05 if today). If the arXiv version goes first, use the arXiv date instead, since Zenodo asks for the date of first publication.

**Authors/Creators.** Arjun Lohan; affiliation University of Southern California; ORCID if one exists.

**Description.**

When an orchestrator delegates a subtask to a worker agent, it must determine how much context from the supervising hierarchy to expose. Current engineering practice diverges sharply: systems either isolate workers to their immediate assignment or forward the complete execution transcript, and the literature on over-eager agents suggests that broader visibility invites scope creep. This preprint evaluates that assumption through a pre-registered, controlled experiment. Across 15,589 task delegations on two frontier reasoning models, DeepSeek V4 Flash 0731 and Meta Muse Spark 1.3, a scripted orchestrator delegates assignments across five task domains, each embedding an intentional, benign conflict with the principal's overarching objective. A six-rung visibility ladder with length-matched and hierarchy-matched controls varies what the worker sees, and deterministic, audited checkers score literal adherence, explicit escalation, and unprompted departures toward the root objective.

Objective-directed departures occur rarely, remain confined to a single model family, and are almost universally announced within the worker's structured report. Supervisory visibility predominantly induces upward escalation rather than unauthorized action, and the effect depends on semantic coherence rather than context length: hierarchy borrowed from an unrelated task doubles reasoning without producing departures. A live deployment across 600 multi-agent task runs with real file systems, concurrent sibling agents, peer polling, and an escalation channel yields zero attributed departures on both models and shows that an un-attributed evaluation diff misclassifies inherited sibling updates as scope creep. Exposing the hierarchy approximately doubles reasoning tokens, latency, and inference expenditure while functioning primarily as a mechanism for upward exception reporting. The paper closes with an audit of 62 orchestration frameworks documenting where the default visibility setting lives in each, and with design principles grounded in the measurements.

This record holds the preprint PDF and its LaTeX source. The pre-registration documents, stimulus items, evaluation checkers with their source hashes, every run record with billed token accounting, audit annotations, analysis pipelines, and the Suite B harness are deposited separately as the companion data and code record and are maintained in the repository listed under related works.

**Licenses.** Creative Commons Attribution 4.0 International.

**Copyright.**

Copyright 2026 Arjun Lohan. Released under the Creative Commons Attribution 4.0 International license.

**Contributors.** None.

**Keywords and subjects.**

multi-agent systems; LLM agents; delegation; sub-agents; orchestration; hierarchical visibility; instruction following; scope creep; escalation; over-eager agents; pre-registered experiment; concurrency; failure attribution; reasoning effort; agent evaluation

**Languages.** English (eng).

**Dates.** Collected: 2026-09-03/2026-09-04 (the interval over which every recorded model call was made).

**Version.** 1.0.0

**Publisher.** Zenodo.

**Related works.**

- Is supplemented by: the companion data and code record (its DOI once reserved), resource type Dataset.
- Is supplemented by: https://github.com/arjunlohan/what-a-sub-agent-does (URL), resource type Software. Make the repository public before publishing the record, or leave this line for the arXiv version.
- Is identical to: the arXiv identifier, once the arXiv version exists.

**References.** Leave empty; the PDF carries the reference list.

**Software.** Leave empty for the preprint record.

**Visibility.** Public.

## Record 2: the data and code snapshot

**Files.** A zip of the repository at the commit deposited (data, collection and analysis code, protocol, decision log, harness table, license), excluding the paper.

**Resource type.** Dataset.

**Title.**

Data, checkers, run records, and harness for "The Scope Creep Myth: How Hierarchical Visibility Drives Escalation Rather Than Departure in Multi-Agent Systems"

**Publication date.** The day the record is published.

**Authors/Creators.** Arjun Lohan; University of Southern California.

**Description.**

This record deposits the complete experimental infrastructure behind the preprint of the same title: the pre-registration protocol and its dated corrections, the 200 Suite A stimulus items across five task domains, the domain-specific deterministic checkers stamped with their source hashes (frozen hash 9179f04a49c2cba4, revised hash dc79531ca3f268a8), every recorded model call as JSONL with the billed cost, provider routing and checker hash (the Suite A main block, the temperature and pilot-overlap blocks, the effort cross and effort-level arms, and the Suite B live loop in its first and second passes), the fresh-context audit samples and returns, the analysis scripts that generate every number in the paper, the harness policy table with the documentation sources and verbatim quotes for 62 orchestration frameworks, and the Suite B harness with its scripted orchestrator, sandboxed tools, and attribution-aware arbiter.

Model outputs were generated by DeepSeek V4 Flash 0731 and Meta Muse Spark 1.3 through Vercel's AI Gateway and are released for research and evaluation; any further use of them remains subject to the generating provider's terms. Stimulus inputs reproduce third-party material for research (package READMEs and distribution listings of installed packages, and public survey and candidate tables), which stays under its own terms. Code is licensed under the MIT License and the data and documentation under Creative Commons Attribution 4.0 International; see the LICENSE file.

**Licenses.** Creative Commons Attribution 4.0 International (data and documentation); add MIT License as a second license for the code.

**Copyright.**

Copyright 2026 Arjun Lohan. Code under the MIT License; data and documentation under Creative Commons Attribution 4.0 International; third-party stimulus material under its own terms.

**Keywords and subjects.** As for Record 1, plus: dataset; benchmark; run records; pre-registration; deterministic checkers.

**Languages.** English (eng).

**Dates.** Collected: 2026-09-03/2026-09-04.

**Version.** 1.0.0

**Publisher.** Zenodo.

**Related works.**

- Is supplement to: 10.5281/zenodo.22433899 (the preprint record), resource type Publication, Preprint.
- Is derived from: https://github.com/arjunlohan/what-a-sub-agent-does (URL), resource type Software.

**Software.** Repository URL https://github.com/arjunlohan/what-a-sub-agent-does; programming language TypeScript (analysis also uses Python); development status Active.

**Visibility.** Public.
