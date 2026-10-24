# Framework survey for the revision: criteria, rules and results

Written 2026-10-23 for the journal revision. Companion table: `literature/framework-survey-2026-10.csv` (62 lines, one per archived key, in `deployment.md` order). Nothing was re-fetched: every inclusion and classification decision rests on the archived rows that Claude agent workflows fetched and excerpted on 2026-09-03 and 2026-09-04. The criteria and rules below were written for the revision and then applied to those rows, so the paper should present them as post hoc.

**Result in one paragraph.** The 62 "frameworks" are 62 deduplicated agent-written rows, not 62 products. Applying the criteria leaves 48 products (22 coding assistants, 19 SDKs or frameworks, 7 platforms): 7 rows fall outside the criteria and 7 are merged into other rows. Of the 48, 23 isolate the delegate with no documented way to pass the parent conversation, 12 isolate by default (or pass a developer-selected part of parent state) and document a way to pass more, 2 pass the parent's objective or brief by construction, 8 pass the full conversation by default (3 with a documented filter, 5 without), and 3 do not document the default. On the recommended calls, no coding assistant passes the full conversation by default; all 8 full-context defaults are SDKs or frameworks except Microsoft Copilot Studio. 15 rows need an author decision (section 8).

## 1. Where the 62 come from

- `literature/workflow-result.json`, key `harnesses`: 109 agent-written rows in five batches. b0: 9 rows from the first harness-docs agent (2026-09-03, 07:01 to 07:03Z). b1 and b2: the same 30 rows (identical, from the web sweep `sweep-2026-09-03.json`, run wf_c693c494-a09). b3: 31 rows (`sweep2-2026-09-03.json`, run wf_0c2186df-8dd). b4: 9 rows (2026-09-04 submission check, `harness-2026-09-04.journal.jsonl`). I checked b1 to b4 against those files: b1 and b3 are the sweep entries reformatted (visibility, return and sibling fields joined, pipes escaped, one whitespace difference), b4 equals the journal, and b0 exists only in `workflow-result.json`.
- Key = first 12 lowercase alphanumeric characters of the row name; the last row per key wins, in first-occurrence order (`litHarnessRows` and the `hsAll` map in `paper/build-numbers.ts`, lines 112 and 134 of the current working tree; `analysis/ingest-workflow.ts:91` for `deployment.md`). 109 rows give 62 keys; the CSV's 62 keys match the 62 rows of the `deployment.md` table.
- Recorded status of the 62: verified 42, partially_verified 17, no_subagents 3.
- Origin of the candidates: the study brief named six harnesses for the deployment table (Claude Code, OpenAI Agents SDK, LangGraph, CrewAI, Google ADK, eve; `SHARPENED-PROMPT.md:35`); the first documentation agent added Microsoft Agent Framework with AutoGen, smolagents and AGENTS.md (b0); the two sweeps and their judge passes added the rest of b1 to b3; the 2026-09-04 check fetched the nine rows the sweep judges had named but not fetched (b4).
- Artifacts of the key: LangGraph appears twice (`langgraphsub`, `langchainlan`); Devin appears three times (`devinmanaged`, `devinclisuba`, and `windsurfnowd`, Windsurf now being Devin Desktop); the three Strands rows (agents-as-tools, Swarm, Graph) collapse into `strandsagent` and only Graph survives in `deployment.md`.
- The `quote` field is truncated by an extraction artifact in four b4 rows (Goose, Junie, Manus, Dify; for example Manus reads `s conversation: `). The CSV uses full sentences from the same rows instead.

## 2. Inclusion criteria

Text for the paper:

> A product is included when (IC1) it is a publicly documented framework or SDK, hosted platform or API (including consumer agent products), or coding assistant (CLI, IDE, desktop or cloud agent); (IC2) one LLM agent can hand a subtask to another LLM agent at run time, by a tool call or spawn (sub-agent, agent as tool), a transfer of control (handoff), an assignment by a manager, leader or coordinator (team member, worker), or a turn in a shared multi-agent conversation (group chat, role-play, message pool); and (IC3) its official documentation (vendor documentation, help center, or the documentation files of its official repository) describes that mechanism, with official source code accepted, and flagged, where the documentation is silent on what the delegate receives. Excluded are conventions and file formats, products without delegation in the sense of IC2 (including fixed pipelines in which developer code or graph edges, not an agent, pass one model step's output to the next), research and evaluation harnesses, and classifiers or monitors that judge another agent's actions. Rows that describe the same product, a renamed product, or another surface or delegation primitive of an included product are merged into one row.

Deviation from the brief: the draft criterion required the documentation to *state* what the delegate receives by default. Applied literally, it removes the three products classified "not stated" (OpenAI Codex, Kimi Agent Swarm, Replit Agent), and the "not stated" class could then never occur. I kept them included, because a silent default is itself a finding. Under the literal wording the survey has 45 products (section 8).

## 3. Multi-primitive rule

Text for the paper:

> (M0) Each product is one row. Its delegation primitives are the agent-to-agent mechanisms its archived rows document; developer-wired pipelines are not primitives (IC2), and neither are reviewer, classifier or monitor agents that judge another agent's actions. Surfaces of one product that share a delegation harness (CLI, IDE, desktop, cloud) are one product. (M1) A product is classified by the primitive its documentation marks as the default (a default parameter value or a "default" label). A deprecated primitive is ignored when a current one exists; a legacy primitive is used only when the product documents no current one. (M2) If no primitive is marked, the product is classified by the primitive whose documented default passes the most parent context (full conversation, then objective or brief, then a selected part of state, then the task alone); primitives whose default is not stated are used only when no primitive has a stated default. Ties go to the primitive that exposes more: for full-context defaults the one without an isolating switch, for isolated defaults the one with a switch that adds context. Rows decided by M2 are marked ambiguous. (M3) The other primitives and their own patterns are recorded in the notes column; merged rows keep their own line with included = no.

Why M2 takes the richest primitive: the survey's question is what a delegate can receive without configuration, and the richest default primitive bounds that. The opposite choice changes seven rows; section 8 gives those counts.

How it applied: M1 decided Google ADK (chat mode is marked default), Mastra (agent networks deprecated) and Kilo Code (Orchestrator mode deprecated); M1's legacy clause decided ChatDev (1.0 chat chain, since 2.0 documents only a developer-wired graph). M2 decided OpenAI Agents SDK (handoffs over agents-as-tools), Strands (Swarm over agents-as-tools; Graph is developer-wired), CAMEL (RolePlaying over Workforce), LlamaIndex (AgentWorkflow handoffs over the orchestrator pattern), LangChain/LangGraph (subgraphs and the supervisor pattern over deepagents subagents), Copilot Studio (child agents over connected agents, a tie on full context broken toward no switch) and Claude Code (subagents with the fork type over agent teams and dynamic workflows, a tie on isolated defaults broken toward the switch). For Devin, GitHub Copilot and Kimi Code CLI the primitives with a stated default fall in the same pattern, so the choice is immaterial.

## 4. Classification rules

### Definitions

- **Delegator, delegate**: the agent that hands off a subtask, and the agent that receives it.
- **Parent context**: the delegator's conversation (user turns, its own messages, tool calls and results) and its working state (session state, memory blocks, message pool).
- **Task text**: what the delegator writes into the delegation call (prompt, task description, message, goal and context fields, tool arguments).
- **Static configuration**: the delegate's own system prompt, tools, model and skills, plus project instruction files (AGENTS.md, CLAUDE.md, steering files) loaded independently of the delegator's conversation. It is not parent context; the notes column records it where documented.
- **Documented switch**: a parameter, flag, setting, mode, delegate type, hook or call argument named in the documentation through which the delegator's conversation, or a chosen part of it, reaches the delegate, or, for a full-context default, is removed or filtered. Writing more or less into the task text is not a switch.
- **Default**: what the delegate receives when nothing is configured beyond choosing the primitive, and the delegator uses the primitive's ordinary form (a named subagent, not a fork).

### Patterns

| Code | Pattern | Rule |
|---|---|---|
| P1 | isolated | By default the delegate receives only task text or explicit call arguments plus static configuration; the parent conversation is omitted; no documented switch passes it. |
| P2 | configurable, isolated or selective default | The default is P1, or a developer-selected part of parent state (shared state keys, subscribed message types, memory blocks), and a documented switch passes the parent conversation or a chosen part of it. |
| P3 | configurable, full-context default | By default the delegate receives the delegator's whole conversation, and a documented switch removes or filters it. |
| P4 | full or shared transcript, no isolating switch | By default the delegate receives the whole conversation, either seeded with the parent's or by reading one dialogue that all agents share (group chat, role-play dyad), and no documented switch removes it. |
| P5 | objective or brief by construction | The framework itself, not the delegator's wording, adds the parent's objective, original task, plan or a ledger of other agents' contributions to the delegate's input, without the full conversation. A switch that raises it to full is noted, not reclassified. |
| P6 | not stated | The documentation describes the delegation but gives none of: a statement that the parent conversation is passed; a statement that the delegate starts from a fresh, clean, separate, own, independent or isolated context, or receives only the task; an enumeration of the delegate's complete inputs. |

P4 widens the brief's "shared transcript with no isolating switch" to include inherited transcripts (Mastra subagents, Copilot Studio child agents). The property that matters is the same: the delegate gets the full conversation and the developer cannot withhold it.

### Decision order

Apply to the primitive chosen by rule M, using only the archived row text.

1. **S0, evidence.** Use the documentation sentences quoted in the row; source code counts only where the row cites it, and the evidence type says so. If the row meets the P6 definition, stop: P6.
2. **S1, full context.** Does the delegate receive the delegator's whole conversation by default? If yes: P3 when a documented switch removes or filters it, else P4.
3. **S2, brief by construction.** Otherwise, does the framework add the parent's objective, original task, plan or contribution ledger to every delegate's input? If yes: P5.
4. **S3, isolated or selective.** Otherwise: P2 when a documented switch passes parent conversation or a chosen part of it, or when the default is a developer-selected part of parent state; else P1.

Tie-breaks for ambiguous evidence:

- **T1** An explicit "by default" sentence beats inference from examples or API signatures.
- **T2** The primitive's own page beats a comparison or overview table (Strands' comparison page labels Graph "Full Transcript", which the Graph page contradicts); the conflict goes in notes.
- **T3** When two official pages conflict, follow the one with more explicit statements and mark the row ambiguous (Goose).
- **T4** Experimental, beta and single-language switches count and are named in notes (Kimi Code CLI fork, Microsoft Agent Framework's Go-only filter).
- **T5** A statement that the delegate has its own or separate context window, loop, thread or conversation, together with a statement that it receives a task or prompt from the delegator, counts as isolated (Cline, GitHub Copilot, Gemini CLI, Junie). If the row also says the delegate inherits an undefined "context", the row is P6 and ambiguous (Replit Agent).
- **T6** When the documentation gives the delegate's complete input interface (a tool signature or a node's parameter list) and no input carries the parent conversation, apply S3 and mark the row ambiguous unless source code confirms the reading (CrewAI and smolagents are confirmed by source; n8n is not).

## 5. Counts

Included products by pattern and product type (codes follow the brief's order; rows are ordered by how much parent context reaches the delegate):

| Pattern | All | Coding assistants | SDKs/frameworks | Platforms |
|---|---:|---:|---:|---:|
| P1 isolated | 23 | 15 | 4 | 4 |
| P2 configurable, isolated or selective default | 12 | 5 | 6 | 1 |
| P5 objective or brief by construction | 2 | 0 | 2 | 0 |
| P3 configurable, full-context default | 3 | 0 | 3 | 0 |
| P4 full or shared transcript, no isolating switch | 5 | 0 | 4 | 1 |
| P6 not stated | 3 | 2 | 0 | 1 |
| Total | 48 | 22 | 19 | 7 |

Members:

- **P1 (23).** Coding assistants: Cursor, Gemini CLI, GitHub Copilot, Devin, Roo Code, Cline, Kilo Code, Amp, Factory Droid, Warp, Kiro, Hermes Agent, OpenCode, Goose, Junie CLI. SDKs: CrewAI, smolagents, eve, OpenHands Software Agent SDK. Platforms: Anthropic Managed Agents, OpenRouter subagent server tool, Manus Wide Research, n8n.
- **P2 (12).** Coding assistants: Claude Code (fork), Kimi Code CLI (experimental fork), DeepSeek Harness (fork provider), Qwen Code (fork, fork_turns), Letta (fork built-in; memory blocks shared by default). SDKs: LangChain/LangGraph (ToolRuntime forwarding; shared state keys), Vercel AI SDK (messages argument), Claude Agent SDK (fork), Agno Teams (share_member_interactions, add_team_history_to_members), PydanticAI (message_history), MetaGPT (subscription filter). Platform: Amazon Bedrock Agents Classic (conversation-history relay).
- **P5 (2).** Strands Agents SDK (Swarm), ChatDev (1.0 chat chain).
- **P3 (3).** OpenAI Agents SDK (handoffs), Google ADK (chat mode), Microsoft Agent Framework (group chat).
- **P4 (5).** AutoGen AgentChat (teams), Mastra (supervisor subagents), Microsoft Copilot Studio (child agents), CAMEL (RolePlaying), LlamaIndex AgentWorkflow (handoffs).
- **P6 (3).** OpenAI Codex, Replit Agent, Kimi Agent Swarm.

Evidence among the 48: documentation 44; documentation plus source code 3 (CrewAI worker context from `base_agent_tools.py`, smolagents task template from `code_agent.yaml`, LlamaIndex transcript sharing from `multi_agent_workflow.py`); documentation plus vendor blog 1 (Kimi Agent Swarm). Recorded status among the 48: verified 36, partially_verified 12. The sweep2 judge named five source-level rows (OWL, CrewAI, LlamaIndex, Kimi Agent Swarm, the Opus 5 evaluation harness). After screening, the evaluation harness is excluded and OWL is merged; I count Kimi Agent Swarm's help page as documentation; smolagents and CAMEL Workforce also rest partly on source files, so they are flagged too.

Product type is my assignment. Three were judgement calls: DeepSeek Harness, Hermes Agent and Letta are typed as coding assistants (agent harnesses; Letta's subagent feature belongs to its agent harness, formerly Letta Code). Typed as SDKs instead, they move 1 P1 and 2 P2 products from the coding-assistant column to the SDK column.

## 6. Products with a full-context default

| Product | Type | Primitive | Default (verbatim, from the archived row) | Switch | Pattern |
|---|---|---|---|---|---|
| OpenAI Agents SDK | SDK | handoffs | "gets to see the entire previous conversation history" | input_filter, handoff_input_filter, nest_handoff_history, handoff_history_mapper | P3 |
| Google ADK | SDK | sub-agents in chat mode (marked default) | "The agent receives the relevant conversation history" | include_contents='none'; mode='task' or 'single_turn' | P3 |
| Microsoft Agent Framework | SDK | group chat | "All agents see the full conversation history, enabling collaborative refinement" | Go GroupChatManager.UpdateHistory only; none documented for Python or C# | P3 |
| AutoGen AgentChat | SDK | teams (RoundRobinGroupChat, SelectorGroupChat) | "Each agent, during its turn, broadcasts its response to all other agents, ensuring that the entire team maintains a consistent context." | none documented | P4 |
| Mastra | SDK | supervisor subagents | "When the parent agent delegates, the subagent receives all messages from the parent agent's conversation" | none documented | P4 |
| Microsoft Copilot Studio | platform | child agents; connected agents | "It runs inside the parent and always receives the parent's conversation context, with no setting to exclude it" | child agents: none; connected agents: "Pass conversation history to this agent", on by default | P4 |
| CAMEL | SDK | RolePlaying society (peer dyad) | row: "No orchestrator; both agents see the whole alternating dialogue and the task in their system messages." | none for RolePlaying | P4 |
| LlamaIndex AgentWorkflow | SDK | handoffs | row: "AgentWorkflow handoff: the handed-off agent sees the full shared chat history plus shared state." (verified from source) | none documented | P4 |

Full context reachable only through an opt-in switch (not defaults): Claude Code, Claude Agent SDK, Qwen Code, Kimi Code CLI, DeepSeek Harness and Letta (fork types or providers); Amazon Bedrock Agents (conversation-history relay); Agno Teams (add_team_history_to_members); PydanticAI (message_history); LangChain (ToolRuntime forwarding); Vercel AI SDK (forwarding the messages argument); CAMEL Workforce (share_memory, merged); OpenAI agents-as-tools (shared session).

## 7. Exclusions and merges relative to the 62

| # | Key | Row | Decision | Reason |
|---:|---|---|---|---|
| 3 | langgraphsub | LangGraph subgraphs; LangChain supervisor; deepagents | merged into langchainlan | duplicate: same product family and documentation pages |
| 9 | agentsmdconv | AGENTS.md | excluded | convention or file format; no delegation |
| 15 | devinmanaged | Devin managed Devins and CLI subagents | merged into devinclisuba | duplicate: same product and sources (key differs by name order) |
| 23 | googlejulesa | Google Jules | excluded | no sub-agent delegation: tasks are top-level sessions; internal critics are not delegable workers |
| 27 | vercelworkfl | Vercel Workflow DevKit | excluded | no sub-agent delegation: one durable agent loop; steps receive function arguments |
| 30 | openaiagentk | OpenAI AgentKit Agent Builder | excluded | developer-wired node graph, no agent-to-agent delegation; deprecated (shutdown 2026-11-30); the coded path is the Agents SDK row |
| 31 | claudecodeag | Claude Code agent teams | merged into claudecodesu | another delegation primitive of Claude Code (M0) |
| 32 | claudecodedy | Claude Code dynamic workflows | merged into claudecodesu | another delegation primitive of Claude Code (M0) |
| 39 | anthropicmul | Opus 5 System Card multi-agent harnesses | excluded | evaluation harness, evidence is a system card |
| 40 | claudecodeau | Claude Code auto mode classifier | excluded | classifier at handoffs, evidence is an engineering post; folded into the Claude Code notes |
| 48 | camelworkfor | CAMEL Workforce | merged into camelrolepla | another delegation primitive of CAMEL (M0) |
| 49 | owlcamelaiow | OWL (camel-ai/owl) | merged into camelrolepla | re-exposes CAMEL's RolePlaying and Workforce classes, no documentation of its own on worker context (ambiguous) |
| 57 | windsurfnowd | Windsurf, now Devin Desktop | merged into devinclisuba | renamed product; its Devin Local agent is the "same harness as Devin CLI" |
| 61 | difyagentnod | Dify Agent node and Workflow as Tool | excluded | no documented agent-to-agent delegation: the developer places the Agent node; Workflow as Tool is an agent-to-workflow call (ambiguous) |

Seven excluded plus seven merged leaves 48 products. Separately, `strandsagent` stays one product, but its classification repairs the collapse: it is classified from the Swarm row in `sweep2-2026-09-03.json`, and the notes record agents-as-tools (P1) and Graph (P5).

## 8. Rows that need the author's decision

| Key | Product | Recommended call | Alternative | Effect of the alternative |
|---|---|---|---|---|
| claudecodesu | Claude Code | P2: the docs' default sentence is the fresh subagent; fork is a named type (M2 tie-break) | P3, if fork mode (on by default in interactive sessions since v2.1.232) makes untyped spawns forks, which the row does not say; P1 if classified by agent teams or workflows | P2 -1, P3 +1 (or P1 +1) |
| openaiagents | OpenAI Agents SDK | P3 via handoffs (M2) | P2 via agents-as-tools | P3 -1, P2 +1 |
| microsoftage | Microsoft Agent Framework | P3: the Go UpdateHistory filter counts (T4); footnote "Go only" | P4, if a switch must exist in Python and C# | P3 -1, P4 +1 |
| microsoftcop | Microsoft Copilot Studio | P4 via child agents (M2 tie-break) | P3 via connected agents | P4 -1, P3 +1 |
| deepseekharn | DeepSeek Harness | P2: spawn is the README's default example; `subagent` and `subagent_fork` sit side by side | P6: no product-level default provider | P2 -1, P6 +1 |
| strandsagent | Strands Agents SDK | P5 via Swarm (M2) | P1 via agents-as-tools | P5 -1, P1 +1 |
| chatdev10cha | ChatDev | P5 via the 1.0 chat chain (M1 legacy clause), with a legacy note | exclude: the current 2.0 release documents only a developer-wired graph | n 48 to 47, P5 -1 |
| camelrolepla | CAMEL | P4 via RolePlaying (M2), labelled peer dyad | P5 via Workforce, the hierarchical primitive the submitted Appendix B describes | P4 -1, P5 +1 |
| owlcamelaiow | OWL | merge into CAMEL | its own row (source-code evidence, P4 by the same M2 reading) | n 48 to 49, P4 +1 |
| llamaindexag | LlamaIndex AgentWorkflow | P4 via handoffs (M2; transcript sharing verified from source) | P1 via the orchestrator pattern | P4 -1, P1 +1 |
| langchainlan | LangChain / LangGraph | P2 via subgraphs and the supervisor pattern (M2) | P1 via deepagents subagents (fresh context, no documented switch) | P2 -1, P1 +1 |
| goosegoosedo | Goose | P1: two pages state isolation and the defaults table lists only extensions as inherited (T3) | P6: the Subagents page says "using your current session's context" | P1 -1, P6 +1 |
| replitagenta | Replit Agent | P6: "inherits your full project context" is undefined (T5) | P1: separate threads "without mixing up the conversations" | P6 -1, P1 +1 |
| difyagentnod | Dify | exclude (IC2) | include as P1 (the invited agent gets the "Agent task" text plus wired variables) | n 48 to 49, P1 +1 |
| n8naiagentto | n8n | P1 from the AI Agent Tool's parameter inventory (T6) | P6: no sentence says the parent's memory is withheld | P1 -1, P6 +1 |

Two global decisions:

- **Not-stated products.** Recommended: keep them (n = 48). Under the literal draft criterion they are excluded: n = 45 with P1 23, P2 12, P5 2, P3 3, P4 5.
- **Direction of M2.** Recommended: richest default (as applied). With the least-context primitive and the opposite tie-breaks instead, OpenAI Agents SDK goes to P2; Strands, LlamaIndex, LangChain/LangGraph and Claude Code to P1; CAMEL to P5; Copilot Studio to P3. Counts become P1 27, P2 11, P5 2, P3 3, P4 2, P6 3, and the full-context defaults drop from 8 to 5 (ADK, Agent Framework, Copilot Studio, AutoGen, Mastra).

## 9. Proposed replacement for Table 6

| Pattern | n (coding / SDK / platform) | Example products | Full-context-default products |
|---|---|---|---|
| Isolated: task text or call arguments only, parent conversation omitted, no documented switch | 23 (15 / 4 / 4) | Cursor, Gemini CLI, GitHub Copilot, Devin, Roo Code, Cline, Kiro, OpenCode, CrewAI, smolagents, Anthropic Managed Agents, OpenRouter | none |
| Configurable, isolated or selective default: a documented switch passes more | 12 (5 / 6 / 1) | Claude Code and Qwen Code (fork), Claude Agent SDK, LangChain/LangGraph, Agno Teams, PydanticAI, Amazon Bedrock Agents | none |
| Objective or brief by construction | 2 (0 / 2 / 0) | Strands Agents Swarm, ChatDev 1.0 chat chain | none |
| Full-context default, with or without a switch | 8 (0 / 7 / 1) | listed in the last column | OpenAI Agents SDK handoffs (s), Google ADK chat mode (s), Microsoft Agent Framework group chat (s, Go only), AutoGen AgentChat teams, Mastra supervisor subagents, Microsoft Copilot Studio child agents, CAMEL RolePlaying (peer dyad), LlamaIndex AgentWorkflow handoffs |
| Not stated in the documentation | 3 (2 / 0 / 1) | OpenAI Codex, Replit Agent, Kimi Agent Swarm | n/a |

(s): a documented switch removes or filters the inherited conversation.

LaTeX in the paper's style. Per `AGENTS.md`, the counts must be generated rather than typed: count `included = yes` rows by `pattern` and `product_type` in the CSV inside `paper/build-numbers.ts` and replace the literals with macros. I did not edit `build-numbers.ts`.

```latex
\begin{table}[t]
\caption{Default context a delegated agent receives in 48 orchestration products, screened from 62 archived documentation rows fetched on 2026-09-03 and 2026-09-04 (criteria and rules in Appendix~\ref{app:harness}). $n$ gives coding assistants / SDKs and frameworks / platforms; (s) marks a documented switch that removes or filters the inherited conversation.}\label{tab:paradigms}
\begin{tabular*}{\textwidth}{@{\extracolsep\fill}p{0.22\textwidth}p{0.1\textwidth}p{0.33\textwidth}p{0.27\textwidth}@{}}
\toprule
pattern & $n$ & example products & full-context defaults \\
\midrule
isolated & 23 (15/4/4) & Cursor, Gemini CLI, GitHub Copilot, Devin, Roo Code, Cline, Kiro, CrewAI, smolagents, Anthropic Managed Agents, OpenRouter & none \\
configurable, isolated or selective default & 12 (5/6/1) & Claude Code and Qwen Code (fork), Claude Agent SDK, LangChain/LangGraph, Agno Teams, PydanticAI, Amazon Bedrock Agents & none \\
objective or brief by construction & 2 (0/2/0) & Strands Agents Swarm, ChatDev 1.0 & none \\
full-context default & 8 (0/7/1) & see last column & OpenAI Agents SDK handoffs (s), Google ADK chat mode (s), Microsoft Agent Framework group chat (s, Go only), AutoGen AgentChat teams, Mastra subagents, Microsoft Copilot Studio child agents, CAMEL RolePlaying, LlamaIndex AgentWorkflow handoffs \\
not stated & 3 (2/0/1) & OpenAI Codex, Replit Agent, Kimi Agent Swarm & n/a \\
\botrule
\end{tabular*}
\end{table}
```

## 10. Proposed method paragraph

> Candidate products came from six harnesses named in the study brief, extended by a first documentation agent, two agent literature sweeps run on 2026-09-03 with judge passes over their results, and a completeness check on 2026-09-04. For each candidate, a Claude agent fetched the official documentation (vendor documentation, help center, or the documentation files of the official repository) on 2026-09-03 or 2026-09-04 and recorded verbatim excerpts on what a delegated agent receives by default, the documented configuration switches, the source URL and the fetch date; where the documentation was silent, the agent read the official source code, and those rows are flagged. Merging rows by a normalized product name gave 62 rows. For this revision, the author wrote inclusion criteria and classification rules (Appendix B) and applied them to the archived rows without re-fetching. Seven rows fall outside the criteria (a file convention, four products without agent-to-agent delegation, an evaluation harness and a classifier), and seven are merged into other rows as duplicates, a renamed product, or further delegation primitives of the same product, leaving 48 products: 22 coding assistants, 19 SDKs or frameworks and 7 platforms. Each product is classified once, by the delegation primitive its documentation marks as the default or, where none is marked, by the primitive whose default passes the most parent context; the 15 rows that needed a judgement call are recorded with the alternative reading. The full table, with excerpts, switches, URLs, fetch dates, evidence type and notes, is archived in the repository (`literature/framework-survey-2026-10.csv`).

## 11. Changes relative to the submitted Section 6, Table 6 and Appendix B

- "62 orchestration frameworks" (via `\litHarnessRows`) becomes 48 products screened from 62 rows. The 62 counted duplicates, merged primitives and non-products.
- Isolated row: Claude Code moves to P2 because of the documented fork type (ambiguous). Devin CLI becomes Devin (three rows merged). Cursor, Gemini CLI and smolagents stay.
- Configurable row: LangGraph and Bedrock stay as P2. OpenAI Agents SDK handoffs is P3. "OpenAI Responses multi-agent API" is not one of the 62 rows (it rests on a verified literature entry, see section 12): drop it from the table or add it as a fetched row. Dify is excluded under IC2 (ambiguous).
- Shared row: AutoGen and LlamaIndex stay (P4). Microsoft Agent Framework becomes P3 because of the Go filter callback (ambiguous).
- Full-context defaults missing from the submitted Table 6: Google ADK chat mode, Microsoft Copilot Studio, Mastra, CAMEL RolePlaying.
- Appendix B: the CAMEL entry describes Workforce, a merged primitive; under M2, CAMEL is classified by RolePlaying (ambiguous). The Dify entry goes if Dify stays excluded. The Claude Code entry should mention the fork type.
- The two Section 6 claims after the table remain supported by the rows: static instruction files reach nominally isolated delegates (Claude Code CLAUDE.md, Kiro steering files, Hermes Agent context files, Codex AGENTS.md layers, Kimi Code project override files that replace a sub-agent's system prompt), and Copilot Studio states that subagents "don't inherently know they're part of an orchestration" (several b4 rows also note that the docs never say whether the child is told).

## 12. Products named in the sweep files that never became rows

Not added to the survey; listed so the paper can say they were seen and why they are not counted.

| Product | Where it appears | What the archive says | Why it is not a row |
|---|---|---|---|
| OpenAI Responses API multi-agent (beta) | sweep2 verified entry (must tier) | `fork_turns` sets how much of the parent conversation each sub-agent inherits (all, none, or a turn count) | literature entry only; cited in the submitted Table 6 |
| Codex `multi_agents.rs` | sweep2 verified entry | the sub-agent hint carries no user goal or parent brief; full-history forks inherit model and effort | source file for an existing row (Codex); not merged into it |
| Google Antigravity subagents | sweep2 verified entry | clean context, result message to the parent, messaging with parents, children and peers | literature entry only |
| xAI Grok Build subagents | sweep2 verified entry | own context window, summary to the parent, nesting depth one | literature entry only |
| Meta Muse Code (Subagent fanout cookbook) | sweep2 verified entry | each child gets a role and a per-task objective in its own git worktree | literature entry only |
| Meta Hermes team coordination cookbook | sweep2 verified entry | the PM writes brief.md and runbook.md that specialists re-read on spawn | a recipe, not a product |
| MiniMax Agent Team | sweep2 verified entry (blog) | workers with isolated context receive a scoped brief with constraints and forbidden actions | literature entry only |
| TRAE subagents (ByteDance) | sweep2 verified entry | subagents run in independent context windows | literature entry only |
| ZCode subagents (Zhipu) | sweep2 verified entry | isolated context by default; `injectAgentsMd` switch for project policy | literature entry only |
| ReDel | sweep2 verified entry | research toolkit; the entry says to confirm its delegation scheme against its docs before tabling | research toolkit |
| SearchSwarm; Self-Manager | sweep1 verified entries | research harnesses (rationale briefs to subagents; isolated subthreads with control blocks) | research harnesses |
| Coze, Qoder CLI, CodeBuddy, AgentScope, Youtu-Agent, Kimi K3 Swarm and Claw Groups, MiniMax Agent Team docs | sweep2 judge gaps | fetched, no verified entry | no archived excerpt |
| Mistral Vibe remote agents; xAI, Zhipu and ByteDance Seed surfaces | sweep1 judge gaps | listed or fetched, no verified entry | no archived excerpt |
| Qwen Code agent-team teammates; Kimi Code tower mode | sweep2 judge gaps | named features without a visibility statement | features of existing rows |

Outside the sweep files, `literature/lab-visibility.md` (from `workflow-result.json`, key `lab_visibility`) also documents systems that are not rows: DeerFlow 2.0 (isolated per its README), Youtu-Agent OrchestraAgent (worker prompt carries the original problem, full plan and previous trajectory, per source), Qwen-Agent GroupChat (whole shared transcript), Muse Code, Claude Research, xAI Grok multi-agent mode, and Microsoft Agent Framework's Handoff and Magentic orchestrations.

## 13. CSV notes and checks

- Columns follow the brief, in snake_case, plus `product_type` (needed for the per-type counts). `pattern` is empty for excluded and merged rows; their notes give the primitive-level reading.
- `default_context_excerpt` holds one to three segments, each `label: "verbatim text"`. Labels: `doc` (a documentation sentence as the row quotes it), `row` (the archived row's own wording, used where the row quotes no sentence on the point), `source` (source code or a prompt template), `card` (system card), `blog` (vendor engineering post).
- Every excerpt was checked by script to be a verbatim substring of `deployment.md` or of the harness entries in the two sweep JSON files and the 2026-09-04 journal; the check failed as expected on altered text (negative control). Excerpts were cut to avoid the em dashes some documentation sentences contain.
- `source_url`, `fetch_date` and `row_status` are copied from the archived row; for `strandsagent` the URL field lists the Swarm, agents-as-tools and Graph pages.
