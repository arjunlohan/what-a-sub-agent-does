# Scoop sweep (arXiv API, newest first)

Run 2026-09-02 from this machine with `https://export.arxiv.org/api/query?search_query=<q>&sortBy=submittedDate&sortOrder=descending&max_results=10`. Titles only at this stage; the six closest papers were then read in full by the literature workflow (deep-reads.md). Re-run in the week before submission.

| Query | What it surfaced (2026 items) |
|---|---|
| `abs:subagent AND abs:context AND abs:orchestrator` | AgenticRepair 2607.29422; SwarmResearch 2607.02807; Architectural Design Decisions in AI Agent Harnesses 2604.18071; Dive into Claude Code 2604.14228; WideSeek-R1 2602.04634 |
| `abs:"sub-agent" AND (abs:isolation OR abs:visibility)` | From Monoliths to Swarms 2608.00202; RL for MAS through Orchestration Traces 2605.02801; CORPGEN 2602.14229; Stochasticity in Agentic Evaluations 2512.06710 |
| `abs:delegation AND abs:adherence AND abs:agents AND abs:LLM` | Collaborative Memory 2505.18279 (only near miss) |
| `abs:"multi-agent" AND abs:LLM AND abs:worker AND (abs:"parent" OR abs:"global goal" OR abs:"high-level goal")` | no entries |
| `abs:"multi-agent" AND abs:LLM AND (abs:"peer awareness" OR abs:"shared context" OR abs:"context sharing")` | When Do Multi-Agent Systems Help? (IB) 2607.16133; The Deliberative Illusion 2606.03032; HARP 2605.27489; Talk is Cheap, Communication is Hard 2605.01750; KV-sharing systems papers (not relevant) |
| `abs:"goal drift" AND abs:agents` | OneDayAgent 2608.05013; Structural Enforcement of Goal Integrity 2604.23646; ETI 2604.19278; Asymmetric Goal Drift 2603.03456; Inherited Goal Drift 2603.03258; Seeds of Scheming 2512.05449 |
| `abs:"context engineering" AND abs:agents` | TRACE 2608.09153; Cursorrules study 2608.10622; ACE-GraphRAG 2608.01269 |
| `abs:"instruction hierarchy" AND abs:agents` | When Context Gets Root 2608.27299; Where Instruction Hierarchy Breaks 2606.07808; Many-Tier Instruction Hierarchy 2604.09443; IH-Challenge 2603.10521; Training Agents to Self-Report Misbehavior 2602.22303; Diagnose, Localize, Align 2509.23188 |

Verdict after the full reads (deep-reads.md): none of 2604.09443, 2604.07911, 2603.03258, 2603.03456, 2607.16133, 2509.23188 manipulates a worker-side graded dose of hierarchical context or measures literal-instruction adherence against it; each rates the threat to novelty as low. The seam is open as of 2026-09-03.
