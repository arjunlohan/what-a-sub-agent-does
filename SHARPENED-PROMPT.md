# Sharpened prompt: worker-side context visibility paper (scoping, literature, pilot)

Produced by /sharpen on 2026-09-02 from Arjun's voice brief plus four pasted research documents (scoping report, pricing and citation audit, protocol v2, formal survey). This is the spec for the first run. Later stages are listed at the end and are gated on the decision package this run produces.

## Intent

I am writing a fourth paper in project lore, solo, for two audiences: the people who configure agent harnesses (Claude Code, OpenAI Agents SDK, LangGraph, CrewAI, Google ADK, eve) and reviewers at an NLP or agents venue. The question: in an orchestrator-worker system, how much of the hierarchy should a worker see (its parent's objective, its siblings' mandates, live peer progress), and what does each increment buy or cost in instruction adherence, accuracy, tokens, wall-clock, redundancy, and solution diversity. Long-running (multi-day) agents make this a design parameter every harness must set; today every harness sets it by default and by accident. What I need from the run is a defensible, non-anthropomorphic empirical answer plus a deployable policy table, not a new framework.

## Settled (do not re-litigate; log an objection once in DECISIONS.md and proceed)

- Models: exactly two, both through Vercel AI Gateway: `deepseek/deepseek-v4-flash-0731` (dated snapshot, the repo default in `lib/lore/models.ts`) and `meta/muse-spark-1.3-contributor`. Verified live on 2026-09-02: both answer; DeepSeek tool calls work (3 s, served by fireworks with 17 fallback providers listed in `providerMetadata.gateway.routing`); Muse 1.3 Contributor answered plain prompts (7 s, 619 reasoning tokens for a 17-token answer) but returned gateway 500s on two of two tool-calling attempts, while `meta/muse-spark-1.3` and `meta/muse-spark-1.2-contributor` completed tool calls. Treat Muse tool calling as a gate (D4).
- The n=2 objection ("idiosyncratic to two systems") is accepted, not argued. The paper claims a method plus two model case studies with a capability contrast, never a law across models. The limitation is written on day one.
- Primary dependent variable: instruction adherence under planted conflict (probe-trip rate), machine-checked. Accuracy, cost, latency, redundancy, diversity are secondary. Never an LLM judge as the primary metric.
- The corporation analogy is a hypothesis generator (organization-theory reading in D2), not evidence. No "outsmarting the boss" language in claims.
- Process is the sIVM paper's process (`paper/`, `scripts/check-paper-numbers.ts`, `scripts/experiments/gen-paper-assets.ts`): every printed number is a generated macro with provenance; every citation is resolved against the arXiv API or Crossref with names verbatim (never expand initials); no em dashes anywhere; `eve` lowercase.
- Real data only wherever task material is data (SO 2023 profiles and Djinni CVs already in MySQL and Elasticsearch; real public repositories for code tasks). Probe stimuli may be authored and must be released.
- No Docker on this machine. TheAgentCompany and SWE-bench Verified as written are out; see discovery step 2.

## Deliverables of this run

Write everything under `visibility-paper/` in this worktree (mirror the `flock-paper/` layout on branch `claude/power-of-defaults-paper-8782e2`). Publish D1 as an HTML artifact. Do not commit or push; leave files in the working tree for review.

**D1. Decision package** (`decision-package.html`, one self-contained page, artifact-published). Contents: the novelty verdict per research question with the fresh scoop evidence; the recommended paper (one), with title candidates, thesis, contribution sentence, and the reversal conditions under which the herding-and-redundancy paper (Proposal 2 in the scoping doc) replaces it; pilot results with raw numbers; the budget ledger to the cent; the venue plan; ranked open risks. Lead with the recommendation, not a survey.

**D2. Verified literature base** (`literature/bibliography.md`, `literature/refs.bib`, `literature/verification-log.csv`): 60 to 100 works. Required coverage: the eight clusters of the scoping doc; organization theory (candidates below); at least one primary source per lab: Anthropic, OpenAI, Google DeepMind, Meta, Microsoft, DeepSeek, Moonshot, Alibaba Qwen, Zhipu, MiniMax, ByteDance Seed, Thinking Machines. Each lab entry states what that lab's published system lets a subagent see, or says "undocumented". Every entry is resolved by id (`export.arxiv.org/api/query?id_list=<id>` or `api.crossref.org/works/<doi>`), title and authors copied verbatim, with a one-line use in the paper and a must-cite tier. Unresolvable candidates go in the log as rejected, with the reason. The pasted docs carry two ghosts (SWE-ContextBench, SWE-Explore) and two mangled titles (DACS is Dynamic Attentional Context Scoping; GTD is Guided Topology Diffusion): fix, do not propagate.

Read in full before forming the verdict (titles seen in the 2026-09-02 arXiv sweep; confirm content, do not trust the titles): DACS 2604.07911; Many-Tier Instruction Hierarchy in LLM Agents 2604.09443 (closest title to our seam, read first); Inherited Goal Drift 2603.03258; Asymmetric Goal Drift under Value Conflict 2603.03456; Evaluating Goal Drift in LM Agents 2505.02709; When Do Multi-Agent Systems Help? An Information Bottleneck Perspective 2607.16133; Diagnose, Localize, Align (multi-agent systems under instruction conflict) 2509.23188; Control Illusion 2502.15851; MAST 2503.13657; Anthropic's multi-agent research system post and the Claude Code subagent docs. For the long-horizon framing: OneDayAgent 2608.05013; CORPGEN 2602.14229; Architectural Design Decisions in AI Agent Harnesses 2604.18071; Dive into Claude Code 2604.14228; When Context Gets Root 2608.27299; Stochasticity in Agentic Evaluations 2512.06710 (for the draw-repeatability method).

Organization-theory candidates (from memory; verify each on Crossref before use): Galbraith 1974, the information-processing view of organization design; Simon, Administrative Behavior; Hayek 1945; Coase 1937; Jensen and Meckling 1976; Holmström 1979; Marschak and Radner 1972, team theory; Radner 1993; Bolton and Dewatripont 1994; Aghion and Tirole 1997, formal versus real authority; Dessein 2002; Alonso, Dessein and Matouschek 2008, adaptation versus coordination (the cleanest prediction for when sibling visibility should help); Garicano 2000; Crawford and Sobel 1982; Conway 1968; Wegner 1987, transactive memory; Cannon-Bowers and Salas, shared mental models; Saltzer and Schroeder 1975, least privilege and need-to-know. Use them to write one falsifiable prediction per visibility level, test the predictions, then drop the theories that did no work.

**D3. Protocol v3** (`PROTOCOL.md`): the pasted v2 adapted to two models, no Docker, and the budget. Keep: the V0 to V5 ladder; the six-verdict checker taxonomy (ADHERED, DEVIATED, FLAGGED, FAILED_FORMAT, FAILED_INCOHERENT, REFUSED); the length-matched filler control; the position ablation; the capability floor; reasoning effort held constant and reasoning tokens recorded; temperature 0 as primary. Change: "3 seeds" becomes 3 repeated draws at temperature 0, which measures provider nondeterminism and yields the detectable-effect floor exactly as the sIVM self-flip floor did (`scripts/experiments/exp0-stability.ts`); report it as such. Add one optional dose on ledger length at V4 (about 2K versus about 40K tokens of a real orchestrator ledger) as the only proxy for "late in a multi-day run"; the paper makes no other horizon claim. Pre-register: the probe set, the checkers, and the analysis plan get a timestamp (a tagged commit plus a Zenodo or OSF record that I file) before Suite A runs.

**D4. Harness and pilot, actually run** (`harness/`, `probes/`, `runs/`, `analysis/`): TypeScript on the repo's `ai` SDK (7.0 canary: `inputSchema`, `stopWhen`, `providerOptions.gateway`), reusing the exp12 patterns in `scripts/experiments/exp12-secondmodel.ts` (bounded concurrency, checkpoint every 100 draws, resume from a partial artifact, hard-fail without the API key, abort above a 5% error rate). Every request logs: model id, `providerMetadata.gateway.routing.finalProvider`, `gateway.cost`, input, output, reasoning and cache-read tokens, latency, reasoning setting, prompt hash, condition, item, draw. Pin providers with `providerOptions.gateway.only` to one provider per model (first-party `deepseek` if it serves the 0731 snapshot, otherwise one named third party, fixed for the whole study); Muse has one provider (`meta`). Discard and rerun any run whose finalProvider differs from the pin. Put the condition block first so it is the cacheable prefix. Pilot: 30 probe items across 5 domains, V0, V2, V4 and the length-matched control, 3 draws, both models (about 800 calls, under $5). Report: verdict distribution per cell, the floor, whether the checkers fired correctly on a hand-audited 10% sample, latency and cost per run, and the Muse tool-call gate (20 tool calls on 1.3 Contributor; if more than 2 fail, use 1.2 Contributor for the tool arms and say so in D1).

**D5. Deployment-path policy table** (`deployment.md`): for Claude Code subagents, OpenAI Agents SDK handoffs and agents-as-tools, LangGraph, CrewAI, Google ADK, and eve: the default worker visibility, the native knob, and what the pilot suggests the knob should be set to. Include one concrete artifact: a Claude Code subagent frontmatter plus a SubagentStart hook implementing the recommended policy.

**D6. Venue and timeline** with live checks of the submission pages on the day, and the budget upgrade path costed (A1).

## Discovery steps (do these before deciding; do not ask me)

1. Scoop check. Re-run the arXiv sweep (record the queries in `literature/sweep.md`), read the five closest papers, and state in D1 whether the worker-side seam is still open. If 2604.09443 or any other paper already measures worker deviation against a graded parent-goal dose, the recommendation flips to Proposal 2 and D1 says so plainly.
2. Suite B substrate. Confirm MySQL and Elasticsearch are up (`brew services list`; `.local-infra/`). Design Docker-free ecological tasks: an orchestrator delegating report-building over the real corpora (ground truth from SQL; the worker's tool trace shows which fields it actually read, so "extract column A only" is checkable), plus small public TypeScript repositories with runnable tests through pnpm. Evaluate Vercel Sandbox as the only route to SWE-bench-style tasks and cost it; recommend, do not build it in this run.
3. Gateway facts. Read `providerMetadata.gateway.routing` on real responses rather than docs. Measure the Muse contributor rate limit at pilot concurrency. Confirm whether `reasoning` effort is settable on both models through the gateway and with which values (the gateway lists `reasoning` and `include_reasoning` as supported parameters on both; DeepSeek lists a toggle plus `high` and `xhigh`).
4. Muse snapshot. There is no dated Muse id. Record the gateway's `created` field for the model and run every Muse condition inside one window.

## Verification and done

- D4 is done when pilot artifacts exist in `runs/`, every number in D1 is read from those artifacts by a script in `analysis/`, the ledger total matches the gateway dashboard within $0.50, and a fresh-context verifier subagent recomputes the pilot table from `runs/` and matches it.
- D2 is done when every entry has a verification-log row with the resolved id and a fetch timestamp, and zero entries were admitted by paraphrase.
- Before reporting progress, audit each claim against a tool result from this session; label anything unverified as unverified.
- D1 passes a mock referee workflow (5 referees plus a judge, as `flock-paper/adversarial-panel-20260828.json` did) before it is published; attach the verdict to the package.

## Compute

Use the Workflow tool for the literature fan-out (one agent per cluster, each returning verified entries only), for probe-set drafting with an independent checker-validation agent, and for the referee panel. Keep each workflow at or under 15 agents unless I say "ultracode". Build and run the harness in the main context; delegate independent reads to subagents and keep working while they run.

## Boundaries

- Reversible local actions are free. Ask before anything external or costly: purchasing gateway credits, any run projected above the budget cap, publishing anything beyond the artifact, and creating the Zenodo or OSF record (prepare it; I file it).
- Do not draft paper prose in this run. Do not modify `paper/` (the sIVM submission) or `flock-paper/`.
- When I describe a problem, report findings and stop.

## Decisions received 2026-09-02 (supersede the assumptions below)

- Models: `meta/muse-spark-1.3-contributor` and `deepseek/deepseek-v4-flash-0731` only; the Muse standard tier is out. Total gateway spend under $150 for the whole paper, spread across stages. Reasoning effort: the highest each model exposes. See DECISIONS.md.

## Assumptions (defaults; my answers to the four open questions override them)

- A1. Budget cap for this paper's API spend: $150 total on the two chosen models, contributor tier throughout, the training-data caveat disclosed, and the probe set pre-registered before Suite A. Upgrade path costed in D6: Muse standard tier for the recorded runs, about $500 more.
- A2. Suite B is Docker-free (discovery step 2); SWE-bench through Vercel Sandbox is a costed option only.
- A3. Venue: arXiv preprint (cs.MA, cs.CL) by 2026-10-31, then ACL Rolling Review or an ICLR 2027 workshop, with IEEE Access as the paid fallback. No hard deadline drives design choices.
- A4. Solo author. The paper frames visibility as a design parameter that long-horizon harnesses must set; it makes no multi-day claim beyond the optional ledger-length dose.

## Later stages (gated; not this run)

- Stage 2: Suite A in full (200 items, V0 to V5 plus the two controls, 3 draws, both models; about 9,600 calls, under $30 on contributor tier) after Arjun accepts D1.
- Stage 3: Suite B (30 tasks, or 15 if the budget bites) only if Stage 2 shows a non-flat visibility effect that survives the length-matched control. If flat everywhere, write the well-powered null; it directly refutes the folk belief that giving subagents more mission context is free.
- Stage 4: drafting with the two-shell build, the macro generator, the number checker, and mock-review rounds, exactly as `paper/` does it.
