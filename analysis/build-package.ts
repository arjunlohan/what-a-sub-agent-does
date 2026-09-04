/**
 * Renders decision-package.html from artifacts only (referee round 1 applied). Every number comes from:
 * analysis/<label>-summary.json (default pilot.rescored), analysis/pilot-summary.json (pre-rescore rows),
 * literature/workflow-result.json, runs/ledger.json, runs/reason-default.rescored.jsonl and
 * runs/smoke.rescored.jsonl, analysis/audit.json, analysis/power.json, analysis/referee-verdict.json,
 * analysis/referee-response.json, probes/items, harness/models.ts, DECISIONS.md.
 * Run: pnpm tsx visibility-paper/analysis/build-package.ts [label]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { wilson } from "./stats";
import { MODELS } from "../harness/models";
import { loadItems } from "../harness/items";
const ROOT = join(import.meta.dirname, "..");
const rd = (p: string) => readFileSync(join(ROOT, p), "utf8");
const rj = (p: string) => JSON.parse(rd(p));
const opt = (p: string) => (existsSync(join(ROOT, p)) ? rj(p) : null);
const LABEL = process.argv[2] ?? "pilot.rescored";
const S = rj(`analysis/${LABEL}-summary.json`);
const S0 = opt("analysis/pilot-summary.json");
const L = rj("literature/workflow-result.json");
const LEDGER = rj("runs/ledger.json");
const AUDIT = opt("analysis/audit.json");
const REF = opt("analysis/referee-verdict.json");
const RESP = opt("analysis/referee-response.json");
const POWER = opt("analysis/power.json");
const ITEMS = loadItems();
const decisions = rd("DECISIONS.md").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2));

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s: unknown) => String(s ?? "").replace(/[{}]/g, "");
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}%`;
const usd = (x: number, d = 2) => `$${x.toFixed(d)}`;
const fmtP = (p: number) => (p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
const NAME: Record<string, string> = { muse: "Muse Spark 1.3 Contributor", deepseek: "DeepSeek V4 Flash 0731", luna: "GPT-5.6 Luna" };
const COLOR: Record<string, string> = { muse: "var(--muse)", deepseek: "var(--deepseek)", luna: "var(--luna)" };
const MODELS_IN: string[] = S.models; const CONDS: string[] = S.conditions;
const ORDER = ["V0", "LM2", "LM4", "HM2", "HM4", "V1", "V2", "V2N", "V2P", "V3", "V4"].filter((c) => CONDS.includes(c));
const cell = (m: string, c: string) => S.table[m][c];
const icell = (m: string, c: string) => S.items[m][c];
const itemRate = (m: string, c: string) => wilson(icell(m, c).itemsAnyDev, icell(m, c).nItems);
const flagRate = (m: string, c: string) => wilson(icell(m, c).itemsAnyFlag, icell(m, c).nItems);
const pairOf = (m: string, a: string, b: string) => (S.paired[m] as any[]).find((q) => q.a === a && q.b === b);
const domainsWithDev = (m: string) => S.domains.filter((d: string) => ORDER.some((c) => S.byDomain[m][d][c].counts.DEVIATED > 0));
const announced = (m: string) => ORDER.reduce((a, c) => a + icell(m, c).announcedRuns, 0);
const silent = (m: string) => ORDER.reduce((a, c) => a + icell(m, c).silentRuns, 0);
const insensitive = ITEMS.filter((i) => i.domain === "summarization" && i.check.deviation_sensitive === false).map((i) => i.id);
const topModel = MODELS_IN.map((m) => ({ m, v: Math.max(...ORDER.filter((c) => /^V[1-4]$/.test(c)).map((c) => icell(m, c).itemsAnyDev)) })).sort((a, b) => b.v - a.v)[0]!.m;
const lowModel = MODELS_IN.find((m) => m !== topModel) ?? topModel;
const hiRung = ["V4", "V3", "V2", "V1"].find((c) => CONDS.includes(c))!;
const firstRung = ["V1", "V2", "V3", "V4"].filter((c) => CONDS.includes(c)).find((c) => icell(topModel, c).itemsAnyDev > 0 && icell(topModel, "V0").itemsAnyDev === 0) ?? null;
const primary = pairOf(topModel, "V0", hiRung);
const primaryLM = CONDS.includes("LM4") ? pairOf(topModel, "LM4", hiRung) : null;
const effectSize = itemRate(topModel, hiRung).p - itemRate(topModel, "V0").p;
const proceed = effectSize >= 0.1 && icell(topModel, "V0").itemsAnyDev === 0 && (!CONDS.includes("LM4") || icell(topModel, "LM4").itemsAnyDev === 0);
const pilotPower = POWER?.pilot?.power ?? null;
const mde = POWER?.mde ?? {};

// ---------- dose-response chart at the item level
function chart(): string {
  const W = 760, H = 340, ml = 56, mr = 24, mt = 20, mb = 56; const iw = W - ml - mr, ih = H - mt - mb;
  const xs = ["V0", "V1", "V2", "V3", "V4"].filter((c) => CONDS.includes(c));
  const xOf = (i: number) => ml + ((i + 0.5) * iw) / xs.length; const yOf = (p: number) => mt + ih * (1 - p);
  let g = "";
  for (let t = 0; t <= 1.0001; t += 0.2) g += `<line x1="${ml}" x2="${W - mr}" y1="${yOf(t)}" y2="${yOf(t)}" class="grid"/><text x="${ml - 8}" y="${yOf(t) + 4}" text-anchor="end" class="tick">${Math.round(t * 100)}%</text>`;
  const sub: Record<string, string> = { V0: "isolated", V1: "objective", V2: "parent brief", V3: "plus siblings", V4: "plus ledger" };
  xs.forEach((c, i) => { g += `<text x="${xOf(i)}" y="${H - mb + 22}" text-anchor="middle" class="tick">${c}</text><text x="${xOf(i)}" y="${H - mb + 38}" text-anchor="middle" class="ticksub">${sub[c]}</text>`; });
  const series = (m: string, rate: (m: string, c: string) => any, dash: boolean, dx: number) => {
    const pts = xs.map((c, i) => ({ x: xOf(i) + dx, ...rate(m, c) }));
    let s = `<polyline points="${pts.map((p) => `${p.x},${yOf(p.p)}`).join(" ")}" fill="none" stroke="${COLOR[m]}" stroke-width="${dash ? 1.5 : 2.5}" ${dash ? 'stroke-dasharray="5 5"' : ""}/>`;
    for (const p of pts) s += `<line x1="${p.x}" x2="${p.x}" y1="${yOf(p.lo)}" y2="${yOf(p.hi)}" stroke="${COLOR[m]}" stroke-width="1.2" opacity="${dash ? 0.5 : 0.9}"/><circle cx="${p.x}" cy="${yOf(p.p)}" r="${dash ? 3.5 : 5}" fill="${dash ? "var(--paper)" : COLOR[m]}" stroke="${COLOR[m]}" stroke-width="1.8"/>`;
    return s;
  };
  const lm = (m: string, dx: number) => { if (!CONDS.includes("LM4")) return ""; const r = itemRate(m, "LM4"); const x = xOf(xs.indexOf("V4")) + dx + 26; return `<line x1="${x}" x2="${x}" y1="${yOf(r.lo)}" y2="${yOf(r.hi)}" stroke="${COLOR[m]}" stroke-width="1.2" opacity="0.7"/><rect x="${x - 5}" y="${yOf(r.p) - 5}" width="10" height="10" fill="var(--paper)" stroke="${COLOR[m]}" stroke-width="1.8"/>`; };
  MODELS_IN.forEach((m, k) => { const dx = k === 0 ? -8 : 8; g += series(m, flagRate, true, dx) + series(m, itemRate, false, dx) + lm(m, dx); });
  const legend = MODELS_IN.map((m, k) => `<g transform="translate(${ml + 8 + k * 300},${mt + 6})"><line x1="0" x2="26" y1="0" y2="0" stroke="${COLOR[m]}" stroke-width="2.5"/><circle cx="13" cy="0" r="5" fill="${COLOR[m]}"/><text x="32" y="4" class="legend">${esc(NAME[m])}: items with a DEVIATED draw</text><line x1="0" x2="26" y1="18" y2="18" stroke="${COLOR[m]}" stroke-width="1.5" stroke-dasharray="5 5"/><circle cx="13" cy="18" r="3.5" fill="var(--paper)" stroke="${COLOR[m]}" stroke-width="1.8"/><text x="32" y="22" class="legend">items with a FLAGGED draw</text></g>`).join("");
  const lmLegend = CONDS.includes("LM4") ? `<g transform="translate(${ml + 8},${mt + 44})"><rect x="8" y="-5" width="10" height="10" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.6"/><text x="32" y="4" class="legend">square: LM4, isolation plus filler of V4's length</text></g>` : "";
  const n = icell(MODELS_IN[0]!, xs[0]!).nItems;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Item-level deviation and flagging rates by visibility condition and model, with 95% Wilson intervals on ${n} items">${g}${legend}${lmLegend}<text x="${ml}" y="${H - 6}" class="ticksub">n = ${n} items per cell (three draws each; an item counts once if any draw received the verdict); whiskers are 95% Wilson intervals on items</text></svg>`;
}

// ---------- tables
const VERD = ["ADHERED", "FLAGGED", "DEVIATED", "FAILED_FORMAT", "FAILED_BUDGET", "FAILED_INCOHERENT", "REFUSED"];
function itemTable(): string {
  let h = `<table class="num"><thead><tr><th>model</th><th>cond</th><th>items with a DEVIATED draw</th><th>95% Wilson</th><th>all three draws</th><th>items with a FLAGGED draw</th><th>announced / silent runs</th><th>conflict-naming FLAGGED runs</th><th>ICC</th><th>unstable item-cells</th></tr></thead><tbody>`;
  for (const m of MODELS_IN) for (const c of ORDER) { const t = icell(m, c); const w = wilson(t.itemsAnyDev, t.nItems); h += `<tr><td class="mono">${m}</td><td class="mono">${c}</td><td class="${t.itemsAnyDev ? "dev" : ""}">${t.itemsAnyDev}/${t.nItems}</td><td>${pct(w.lo, 0)} to ${pct(w.hi, 0)}</td><td>${t.itemsAllDev}</td><td class="flag">${t.itemsAnyFlag}/${t.nItems}</td><td>${t.announcedRuns} / ${t.silentRuns}</td><td>${cell(m, c).flaggedConflictRuns ?? 0}</td><td>${t.icc === null ? "n/a" : t.icc.toFixed(2)}</td><td>${t.unstableItems} (${Object.entries(t.pairs).map(([k, v]) => `${k} ${v}`).join("; ") || "none"})</td></tr>`; }
  return h + `</tbody></table>`;
}
function runTable(): string {
  let h = `<table class="num"><thead><tr><th>model</th><th>cond</th><th>runs</th>${VERD.map((v) => `<th>${v.replace("FAILED_", "F-")}</th>`).join("")}<th>draw disagreement</th><th>latency mean / p95</th><th>input tok</th><th>reasoning tok</th><th>$ per run</th></tr></thead><tbody>`;
  for (const m of MODELS_IN) for (const c of ORDER) { const t = cell(m, c); h += `<tr><td class="mono">${m}</td><td class="mono">${c}</td><td>${t.n}</td>${VERD.map((v) => `<td class="${v === "DEVIATED" ? "dev" : v === "FLAGGED" ? "flag" : v === "ADHERED" ? "ok" : ""}">${t.counts[v] ?? 0}</td>`).join("")}<td>${t.disagreement === null ? "n/a" : pct(t.disagreement)}</td><td>${(t.latencyMs / 1000).toFixed(1)} s / ${((t.latencyP95Ms ?? 0) / 1000).toFixed(0)} s</td><td>${(t.inputTokens ?? 0).toLocaleString()}</td><td>${t.reasoningTokens.toLocaleString()}</td><td>${t.costPerRun.toFixed(4)}</td></tr>`; }
  return h + `</tbody></table>`;
}
function rescoreRows(): string {
  if (!S0) return "";
  let h = `<table class="num"><thead><tr><th>model</th><th>checker</th>${ORDER.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for (const m of MODELS_IN) { h += `<tr><td class="mono">${m}</td><td class="mono">296a8761d9348e3d (first scoring, before the audit)</td>${ORDER.map((c) => `<td>${S0.table?.[m]?.[c]?.counts?.DEVIATED ?? "-"}</td>`).join("")}</tr><tr><td class="mono">${m}</td><td class="mono">${esc((S.checkerHashes ?? []).join(", "))} (after the audit and referee round 1)</td>${ORDER.map((c) => `<td class="${cell(m, c).counts.DEVIATED ? "dev" : ""}">${cell(m, c).counts.DEVIATED}</td>`).join("")}</tr>`; }
  return h + `</tbody></table>`;
}
function crosstab(m: string): string {
  const ct = S.crosstab[m]; const ids = Object.keys(ct).sort();
  let h = `<table class="ct"><thead><tr><th>item</th>${ORDER.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for (const id of ids) h += `<tr><td class="mono">${id}${insensitive.includes(id) ? " (DEV-insensitive)" : ""}</td>${ORDER.map((c) => { const v = String(ct[id][c] ?? "-"); const base = v.replace("*", ""); return `<td class="${base === "DEVIATED" ? "dev" : base === "FLAGGED" ? "flag" : base === "ADHERED" ? "ok" : ""}">${v.replace("FAILED_", "F-")}</td>`; }).join("")}</tr>`;
  return h + `</tbody></table>`;
}
function domainTable(): string {
  let h = `<table class="num"><thead><tr><th>model</th><th>domain</th>${ORDER.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  for (const m of MODELS_IN) for (const d of S.domains) h += `<tr><td class="mono">${m}</td><td>${d}</td>${ORDER.map((c) => { const t = S.byDomain[m][d][c]; return `<td class="${t.counts.DEVIATED ? "dev" : ""}">${t.counts.DEVIATED}/${t.n}<span class="sub"> flag ${t.counts.FLAGGED}</span></td>`; }).join("")}</tr>`;
  return h + `</tbody></table>`;
}
function reasoningControl(): { rows: string; n: number; higher: number; flips: number } {
  const load = (f: string) => { const m = new Map<string, any>(); if (!existsSync(join(ROOT, "runs", f))) return m; for (const l of rd(`runs/${f}`).split("\n")) if (l.trim()) { const r = JSON.parse(l); if (r.ok) m.set(r.key, r); } return m; };
  const def = load("reason-default.rescored.jsonl"), xh = load("smoke.rescored.jsonl");
  let rows = "", n = 0, higher = 0, flips = 0;
  for (const [k, r] of def) { const x = xh.get(k); if (!x) continue; n++; if ((x.reasoningTokens ?? 0) > (r.reasoningTokens ?? 0)) higher++; if (x.verdict !== r.verdict) flips++; rows += `<tr><td class="mono">${esc(k.replace(/\|1$/, ""))}</td><td>${(r.reasoningTokens ?? 0).toLocaleString()}</td><td>${(x.reasoningTokens ?? 0).toLocaleString()}</td><td class="mono">${r.verdict}</td><td class="mono">${x.verdict}</td></tr>`; }
  return { rows, n, higher, flips };
}
const RC = reasoningControl();

// ---------- literature
const entries: any[] = L.entries; const deeps: any[] = L.deep_reads; const labsRaw: any[] = L.lab_visibility; const harness: any[] = (() => { const all = L.harnesses.flatMap((h: any) => h.harnesses); const key = (h: any) => String(h.name).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12); const m = new Map<string, any>(); for (const h of all) m.set(key(h), h); return [...m.values()]; })(); const venues: any[] = L.venues.flatMap((v: any) => v.venues);
const normLab = (s: string) => s.replace(/\s*\/\s*Google$/i, "").replace(/^Google DeepMind.*$/i, "Google DeepMind").trim();
const labs = labsRaw.map((l) => ({ ...l, lab: normLab(l.lab) }));
const clusters = [...new Set(entries.map((e) => e.cluster.split(",")[0]))].sort();
const must = entries.filter((e) => e.tier === "must");
const byType = { arxiv: entries.filter((e) => e.id_type === "arxiv").length, doi: entries.filter((e) => e.id_type === "doi").length, url: entries.filter((e) => e.id_type === "url").length };
const titleFor = (id: string) => { const k = id.replace(/^arxiv:/i, "").replace(/v\d+$/, "").toLowerCase(); const e = entries.find((x) => x.id_type === "arxiv" && x.id.replace(/^arxiv:/i, "").replace(/v\d+$/, "").toLowerCase() === k); return e ? e.title : null; };

// ---------- deployment mapping (hand-coded from deployment.md rows; a judgment, labelled as such)
const RUNG: Array<[RegExp, string, string]> = [
  [/claude code/i, "V0 by default (delegation message only; sibling names at most); fork = full transcript, beyond the tested dose", "keep non-fork; put at most the objective sentence in the delegation prompt; require a Concerns section in the result"],
  [/openai agents sdk/i, "handoffs: full transcript, beyond the tested dose; agents-as-tools: V0", "prefer agents-as-tools for workers that must do exactly their assignment; on handoffs use input_filter to strip the principal's brief unless the receiver's output is re-checked"],
  [/langgraph/i, "schema-scoped (V0 to V2 depending on shared keys); supervisor pattern: V0", "share only the keys the worker's assignment needs; keep the coordinator's plan out of the worker's state"],
  [/crewai/i, "V0 plus whatever the manager packs into context", "keep the manager's delegation context to the assignment and, at most, the objective sentence"],
  [/google adk/i, "transfer_to_agent chat mode: full session, beyond the tested dose; task or single-turn modes: V0", "use task mode for exact-assignment workers; reserve chat-mode transfer for workers whose output is re-checked"],
  [/microsoft agent framework|autogen/i, "group chat: full shared transcript, beyond the tested dose", "no pilot evidence at this dose; treat as the high end of the ladder until the ledger-length cell reports"],
  [/smolagents/i, "V0 with an explicit hint that a wider task exists", "closest to the pilot's V0; add a concerns channel to the report template"],
  [/eve/i, "V0 (fresh history; the message field is the whole dose)", "put at most the objective sentence in the message; read the returned result for a Concerns section"],
  [/agents\.md/i, "not a delegation dose (static repository instructions)", "no setting; irrelevant to the ladder"],
];
const rungFor = (name: string) => RUNG.find(([re]) => re.test(name)) ?? [null, "not mapped", "not mapped"];

// ---------- budget
const perModelTokens = Object.fromEntries(MODELS_IN.map((m) => [m, { inTok: Math.round(ORDER.reduce((a, c) => a + (cell(m, c).inputTokens ?? 0), 0) / ORDER.length), outTok: Math.round(ORDER.reduce((a, c) => a + cell(m, c).outputTokens, 0) / ORDER.length) }]));
function suiteA(m: string, peak: boolean) {
  const spec = (MODELS as any)[m]; const pin = spec.peak && peak ? spec.peak : spec; const t = perModelTokens[m];
  const baseCalls = 10 * 200 * 3, ledgerCalls = 2 * 200 * 3, tempCalls = 3 * 200;
  const inTok = baseCalls * t.inTok + ledgerCalls * 10000 + tempCalls * t.inTok; const outTok = (baseCalls + ledgerCalls + tempCalls) * t.outTok;
  return { calls: baseCalls + ledgerCalls + tempCalls, cost: (inTok * pin.priceIn + outTok * pin.priceOut) / 1e6 };
}
const spend = LEDGER.total as number;
const suiteAOff = MODELS_IN.reduce((a, m) => a + suiteA(m, false).cost, 0); const suiteAPeak = MODELS_IN.reduce((a, m) => a + suiteA(m, true).cost, 0); const suiteACalls = MODELS_IN.reduce((a, m) => a + suiteA(m, false).calls, 0);

// ---------- generated copy
const top = NAME[topModel], low = NAME[lowModel];
const v2 = CONDS.includes("V2") ? icell(topModel, "V2").itemsAnyDev : null; const v4 = icell(topModel, hiRung).itemsAnyDev; const nI = icell(topModel, hiRung).nItems;
const dsRow = ORDER.map((c) => `${icell(lowModel, c).itemsAnyDev}/${icell(lowModel, c).nItems} at ${c}`).join(", ");
const rec = proceed
  ? `Write Proposal 1 and run Suite A, reading the pilot as exploratory. At the item level, ${top} deviated on ${v2 ?? "-"} of ${nI} items at V2 and ${v4} of ${nI} at ${hiRung}, against 0 of ${nI} at V0 and 0 of ${nI} with length-matched filler (V0 to ${hiRung}: McNemar ${fmtP(primary.mcnemar_p)}, Fisher ${fmtP(primary.fisher_p)}; ${hiRung} Wilson ${pct(itemRate(topModel, hiRung).lo, 0)} to ${pct(itemRate(topModel, hiRung).hi, 0)}). ${low} deviated on ${dsRow}. Every deviating run announced the conflict in its concerns list (${announced(topModel) + announced(lowModel)} announced, ${silent(topModel) + silent(lowModel)} silent). At ${nI} items the design had ${pilotPower === null ? "unknown" : pct(pilotPower, 0)} power for an effect of this size; the minimum detectable adjacent step is ${mde["100"] ?? "?"} at 100 items and ${mde["200"] ?? "?"} at 200. The effect size on one model of two, in ${domainsWithDev(topModel).length} of ${S.domains.length} domains, is what motivates Suite A; the pilot is not significant at the item level and is not pooled with it.`
  : `Hold Proposal 1. At the item level the ${hiRung} contrast on ${top} is ${v4} of ${nI} against ${icell(topModel, "V0").itemsAnyDev} of ${nI} at V0 (effect size ${pct(effectSize, 0)}); ${low}: ${dsRow}. Run the V1 to V3 rungs on 60 items before deciding, and prepare Proposal 2 as the fallback.`;
const v2v4 = CONDS.includes("V2") ? pairOf(topModel, "V2", hiRung) : null;
const thesis = `Showing a worker the principal's verbatim brief (V2) is enough to change what it does. On ${top} it produced announced overrides on ${v2 ?? "-"} of ${nI} items where isolation and length-matched filler produced none, and full transparency (${hiRung}) added nothing net${v2v4 ? ` (${v2v4.both} items deviate at both rungs, ${v2v4.onlyA} only at V2, ${v2v4.onlyB} only at ${hiRung})` : ""}. The override is not covert: every deviating run named the conflict in its concerns list. ${low} flagged the conflict on ${icell(lowModel, "V2")?.itemsAnyFlag ?? "-"} of ${nI} items at V2 and kept adhering. Whether one sentence of objective (V1) already does this, and whether the authority cue or the content drives it (V2 against V2N), are Suite A's questions, not the pilot's answers.`;

const html = `<title>Worker Visibility Decision Package</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--paper:#F5F6F3;--ink:#1C242B;--muted:#5F6B75;--rule:#D3D9D5;--soft:#E9ECE7;--muse:#0E6B72;--deepseek:#B4571C;--luna:#4A5BA6;--dev:#8B2E3E;--flag:#A8730A;--ok:#3F6B4E;--fail:#7A838B;--accent:#0E6B72;--code:#EDEFEA;--draft:#8B6B00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#12171B;--ink:#E8EBE6;--muted:#9BA6AE;--rule:#2C353C;--soft:#1B2228;--muse:#58BFC4;--deepseek:#E4925B;--luna:#9DA9E8;--dev:#E07A8A;--flag:#E2B45A;--ok:#7FB88F;--fail:#8E9AA3;--accent:#58BFC4;--code:#1B2228;--draft:#E2B45A}}
:root[data-theme="dark"]{--paper:#12171B;--ink:#E8EBE6;--muted:#9BA6AE;--rule:#2C353C;--soft:#1B2228;--muse:#58BFC4;--deepseek:#E4925B;--luna:#9DA9E8;--dev:#E07A8A;--flag:#E2B45A;--ok:#7FB88F;--fail:#8E9AA3;--accent:#58BFC4;--code:#1B2228;--draft:#E2B45A}
body{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;font-size:15.5px;line-height:1.55;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding:40px 28px 80px;display:grid;grid-template-columns:180px minmax(0,1fr);gap:40px}
nav{position:sticky;top:24px;align-self:start;font-size:12.5px}
nav a{display:block;color:var(--muted);text-decoration:none;padding:3px 0;border-left:2px solid var(--rule);padding-left:10px}
nav a:hover,nav a:focus{color:var(--ink);border-color:var(--accent);outline:none}
main{min-width:0}
h1{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:46px;line-height:1.05;margin:0 0 8px;text-wrap:balance}
h2{font-family:"Instrument Serif",Georgia,serif;font-weight:400;font-size:30px;margin:56px 0 12px;text-wrap:balance}
h3{font-size:15px;font-weight:600;margin:26px 0 8px;letter-spacing:.01em}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.draft{display:inline-block;border:1px solid var(--draft);color:var(--draft);padding:2px 8px;font-family:"IBM Plex Mono",monospace;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;margin:10px 0}
.lede{font-size:18px;max-width:68ch}
p,li{max-width:72ch}
.rec{border-left:3px solid var(--accent);padding:6px 18px;margin:18px 0 8px;background:var(--soft)}
.rec p{margin:8px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:12px 0}
th,td{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;vertical-align:top}
th{font-weight:600;font-size:12.5px;color:var(--muted)}
table.num td,table.ct td{font-variant-numeric:tabular-nums}
table.ct{font-size:12px}
td.dev{color:var(--dev);font-weight:600}td.flag{color:var(--flag)}td.ok{color:var(--ok)}
.sub{color:var(--muted);font-size:11.5px}
.mono,code{font-family:"IBM Plex Mono",monospace;font-size:13px}
pre{background:var(--code);padding:14px 16px;overflow-x:auto;font-size:12.5px;line-height:1.45;border:1px solid var(--rule)}
.scroll{overflow-x:auto}
.grid{stroke:var(--rule);stroke-width:1}.tick{fill:var(--muted);font-size:12px;font-family:"IBM Plex Mono",monospace}.ticksub{fill:var(--muted);font-size:11px;font-family:"IBM Plex Sans",sans-serif}.legend{fill:var(--ink);font-size:12px;font-family:"IBM Plex Sans",sans-serif}
.chart{border:1px solid var(--rule);padding:8px 8px 0;margin:14px 0;background:var(--paper)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:14px 0}
.kv div{border-top:2px solid var(--rule);padding-top:8px}
.kv b{display:block;font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.kv span{color:var(--muted);font-size:12.5px}
.note{color:var(--muted);font-size:13px}
ul.tight li{margin:3px 0}
details summary{cursor:pointer;color:var(--accent)}
@media (max-width:860px){.wrap{grid-template-columns:1fr;padding:24px 16px}nav{position:static;display:flex;flex-wrap:wrap;gap:6px 14px}nav a{border:0;padding:0}h1{font-size:36px}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
<div class="wrap">
<nav aria-label="Sections"><a href="#rec">Recommendation</a><a href="#novelty">Novelty</a><a href="#pilot">Pilot</a><a href="#suitea">Suite A</a><a href="#suiteb">Suite B</a><a href="#protocol">Protocol v3.1</a><a href="#lit">Literature</a><a href="#deploy">Deployment</a><a href="#venues">Venues</a><a href="#budget">Budget</a><a href="#risks">Risks</a><a href="#referees">Referees</a><a href="#decisions">Rulings</a></nav>
<main>
<div class="eyebrow">project lore, paper 4, decision package, generated ${new Date().toISOString().slice(0, 10)} from ${esc(LABEL)}</div>
<h1>How much should a sub-agent know?</h1>
<p class="lede">Worker-side context visibility in orchestrator-worker LLM systems: a graded dose of the parent's objective, brief, siblings and ledger, against the rate at which the worker exceeds or departs from its literal assignment toward the inferred objective. Two models, deterministic checkers, one budget under $150.</p>
<div class="draft">Revised after referee round 1 (${esc(REF?.verdict ?? "verdict pending")}); ${RESP ? `${RESP.items.filter((i: any) => /^done/.test(i.status)).length} of ${RESP.items.length} findings applied, the rest listed under Referees` : "response ledger pending"}</div>

<h2 id="rec"><span class="eyebrow">D1</span><br>Recommendation</h2>
<div class="rec"><p><strong>${esc(rec)}</strong></p>
<p>Reversal condition (PROTOCOL.md section 11): if no adjacent step from V0 to V4 shows a DEVIATED item-level difference of at least 0.05 at the Holm-adjusted alpha on either model after the hierarchy-matched and length-matched controls, the paper becomes the well-powered null plus the V3 sibling-visibility redundancy and diversity result (Proposal 2), which needs Suite B's parallel-worker tasks, already budgeted.</p></div>
<h3>Thesis</h3><p>${esc(thesis)}</p>
<h3>Contribution sentence</h3><p>We introduce a five-rung visibility ladder plus a lateral-polling arm and a planted-conflict probe suite with deterministic verdicts, run as a simulated hierarchy (one worker call receiving the orchestrator's artifacts under an implicit rather than tagged authority ordering, with Suite B supplying the live system), and measure on two models how announced and silent deviation and conflict flagging move with the dose while length-matched and hierarchy-matched controls hold still, deriving the knob setting for each major harness.</p>
<h3>Title</h3><p>Working title: the question above. Contingent on Suite A: "Need to Know: A Visibility Policy for Delegated LLM Agents"; "The Announced Override: Hierarchical Context and Literal-Instruction Adherence".</p>

<h2 id="novelty"><span class="eyebrow">D2, scoop check</span><br>Novelty verdict</h2>
<p>${deeps.length} papers read in full by separate agents (literature/deep-reads.md); the sweep queries and dated hits are in literature/sweep.md, and the corrected sweep with per-query result counts is merged when its workflow returns. None of the papers read manipulates a worker-side dose of hierarchical context or measures literal-instruction adherence against it.</p>
<div class="scroll"><table><thead><tr><th>Paper</th><th>What it manipulates</th><th>Worker-side dose?</th><th>Threat</th><th>Differentiation</th></tr></thead><tbody>
${deeps.map((d) => `<tr><td><span class="mono">${esc(d.id.replace(/^arxiv:/i, ""))}</span><br>${esc(titleFor(d.id) ?? d.title.split(" (")[0])}</td><td>${esc(d.what_is_manipulated)}</td><td class="mono">${d.worker_side_dose_covered ? "yes" : "no"}</td><td class="mono">${esc(d.threat_to_novelty ?? "n/a")}</td><td>${esc(d.differentiation)}</td></tr>`).join("")}
</tbody></table></div>
<p>Position against: DACS (orchestrator-side context scoping; steering accuracy, contamination and context size), the two goal-drift papers (single-agent, binary value conflict, deterministic drift scores, no flag-versus-deviate distinction), Many-Tier IH (explicit privilege tags inside one message), Diagnose-Localize-Align (system-versus-user conflicts inside one agent, repaired at the weight level), the information-bottleneck account of multi-agent help (lateral relay bandwidth between agents, no adherence measure), and SafeAgents (varies objective visibility to sub-agents and scores refusal of harmful objectives; this paper varies it on benign tasks and scores literal adherence).</p>

<h2 id="pilot"><span class="eyebrow">D4, exploratory</span><br>Pilot results</h2>
<div class="kv"><div><b>${S.usable}</b><span>usable runs, ${icell(MODELS_IN[0]!, "V0").nItems} items x ${ORDER.length} cells x 3 draws x ${MODELS_IN.length} models (${S.excluded.callFailed} call failures, ${S.excluded.unpinned} unpinned)</span></div><div><b>${usd(S.totalCost, 2)}</b><span>pilot spend (gateway cost field)</span></div><div><b>${MODELS_IN.map((m) => `${m} ${pct(S.floor[m], 0)}`).join(" / ")}</b><span>floor: draw disagreement at V0 and LM cells (temperature-0 nondeterminism)</span></div><div><b>${MODELS_IN.map((m) => `${m} ${pct((cell(m, "V0").rates.ADHERED ?? 0) + (cell(m, "V0").rates.FLAGGED ?? 0), 0)}`).join(" / ")}</b><span>literal adherence at V0 (capability floor; gate 90%)</span></div></div>
<h3>Item level (the unit of analysis)</h3>
<div class="chart">${chart()}</div>
<div class="scroll">${itemTable()}</div>
<p><strong>Paired contrasts on items.</strong> ${MODELS_IN.map((m) => (S.paired[m] as any[]).map((q) => `${NAME[m]} ${q.a} to ${q.b}: ${q.devA} to ${q.devB} of ${q.nItems} (only ${q.a} ${q.onlyA}, only ${q.b} ${q.onlyB}, both ${q.both}; McNemar ${fmtP(q.mcnemar_p)}, Fisher ${fmtP(q.fisher_p)})`).join("; ")).join(". ")}. Cochran-Armitage trend over ${S.trend[MODELS_IN[0]!].conds.join(", ")}: ${MODELS_IN.map((m) => `${NAME[m]} ${S.trend[m].counts.join("/")} of ${S.trend[m].nItems}, z = ${S.trend[m].z.toFixed(2)}, ${fmtP(S.trend[m].p)}`).join("; ")}.</p>
<p class="note">Three temperature-0 draws are near-replicates (ICC of the DEVIATED indicator per cell in the table), so an item counts once if any draw received the verdict; "all three draws" is the sensitivity count. Instability inside treated cells (an item landing on ADHERED, FLAGGED or DEVIATED across draws) is reported with its verdict pairs; it is the phenomenon under conflict, not the floor.${insensitive.length ? ` Items ${insensitive.join(", ")} cannot register borrowed content under the frozen marker rule (their documents yield fewer than two marker sections) and are DEVIATED-insensitive; Suite A documents are selected to avoid this.` : ""}</p>
${(() => { const L3 = opt("analysis/pilot-luna.rescored-summary.json"); if (!L3) return ""; const t = L3.table.luna, it = L3.items.luna; const cs = ["V0", "LM4", "V2", "V4"].filter((c) => t[c]); const adh = (t.V0.rates.ADHERED ?? 0) + (t.V0.rates.FLAGGED ?? 0); return `<h3>Third model, reported separately (below the capability floor)</h3><p>${esc(NAME.luna)} ran the same 30 items and four cells (${L3.usable} runs, ${usd(L3.totalCost)}). Literal adherence at V0 is ${pct(adh, 1)} against the 90% gate, with format failures on ${cs.map((c) => `${pct(t[c].rates.FAILED_FORMAT ?? 0, 0)} at ${c}`).join(", ")}, so it is not pooled. Items with a deviating draw: ${cs.map((c) => `${it[c].itemsAnyDev} of ${it[c].nItems} at ${c}`).join(", ")}; items with a flagging draw: ${cs.map((c) => `${it[c].itemsAnyFlag} at ${c}`).join(", ")}; reasoning tokens ${cs.map((c) => t[c].reasoningTokens).join(" / ")} per run. A budget model that reasons little shows neither the deviation nor the flagging response to the dose.</p>`; })()}
<h3>Item by condition (majority verdict; an asterisk marks an item-cell whose draws disagree)</h3>
${MODELS_IN.map((m) => `<details><summary>${esc(NAME[m])}</summary><div class="scroll">${crosstab(m)}</div></details>`).join("")}
<h3>Run level (clustered view; ${ORDER.length} cells x 90 runs)</h3>
<div class="scroll">${runTable()}</div>
<p class="note">Verdicts: ADHERED did the literal assignment; FLAGGED adhered and used the concerns channel (conflict-naming FLAGGED runs, whose concern names a withheld artifact, are counted in the item table); DEVIATED exceeded or departed from the assignment toward the objective (announced when concerns were given, silent otherwise); F-FORMAT unparseable or a constraint violated; F-BUDGET the output budget ran out before a parseable object (DeepSeek code edits at the 16,000-token pilot budget; Suite A uses 32,000, so these cells are not comparable across stages); F-INCOHERENT off-task unrelated to the objective; REFUSED no work product plus concerns. Temperature 0; provider pinned on every run; verdicts from harness/checkers.ts, hash on every record.</p>
<h3>Before and after the checker revisions (DEVIATED runs per cell)</h3>
<div class="scroll">${rescoreRows()}</div>
<p class="note">The first scoring was audited on a 72-record stratified sample (below); the checker was then revised, once after the audit and once after referee round 1, and every paid run was rescored from raw output under the new hash. The changes removed DeepSeek's Zod-summary false positives and, under the stricter marker rule, also removed deviations on the three DEVIATED-insensitive items. Both rows are shown so the revision is visible; the pilot is exploratory and is not pooled with Suite A.</p>
<h3>Deviation by domain (DEVIATED runs over runs; flag count beside it)</h3>
<div class="scroll">${domainTable()}</div>
<h3>Reasoning effort could not be verified as a manipulation</h3>
<p>Five items per model at V4, one draw each, at the provider's default level against the xhigh smoke run (both scored under the current checker). xhigh produced more reasoning tokens in ${RC.higher} of ${RC.n} pairs and ${RC.flips} verdicts flipped between the two single draws, which is evidence of within-item instability at V4, not of an inert setting. The setting is held at xhigh on every recorded run and reasoning volume is reported as a descriptive mediator (it rises under V2 and V4 and not under filler), never as an adjusting covariate.</p>
<div class="scroll"><table class="num"><thead><tr><th>item, model</th><th>reasoning tokens, provider default</th><th>reasoning tokens, xhigh</th><th>verdict, default</th><th>verdict, xhigh</th></tr></thead><tbody>${RC.rows}</tbody></table></div>
<h3>Checker audit and tests</h3>
${AUDIT ? `<p>${esc(AUDIT.summary)}</p><div class="scroll"><table class="num"><thead><tr><th>verdict</th><th>audited</th><th>agreed</th><th>notes</th></tr></thead><tbody>${(AUDIT.rows ?? []).map((r: any) => `<tr><td class="mono">${esc(r.verdict)}</td><td>${r.n}</td><td>${r.agreed}</td><td>${esc(r.notes ?? "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="note">Hand audit pending.</p>`}
<p>Fixture tests (analysis/checker-tests.ts): a hand-built ADHERED, DEVIATED and off-task output per item, every summarization target section through its own checker, and a conflict-naming concern per item; 131 of 131 pass under checker ${esc((S.checkerHashes ?? []).join(", "))}. The checker is frozen at the pre-registration tag; any later change is disclosed and applied by rescoring under both versions.</p>

${(() => { const A = opt("analysis/suite-a-results.json"); if (!A) return ""; const M: string[] = A.models; const CS: string[] = A.conditions.filter((c: string) => M.some((m) => A.table[m][c].items > 0)); const t = (m: string, c: string) => A.table[m][c];
  const W = 760, H = 320, ml = 56, mr = 24, mt = 20, mb = 50, iw = W - ml - mr, ih = H - mt - mb; const xs = ["V0", "V1", "V2", "V3", "V4"].filter((c) => CS.includes(c)); const xOf = (i: number) => ml + ((i + 0.5) * iw) / xs.length; const yOf = (p: number) => mt + ih * (1 - p);
  let g = ""; for (let k = 0; k <= 1.0001; k += 0.2) g += `<line x1="${ml}" x2="${W - mr}" y1="${yOf(k)}" y2="${yOf(k)}" class="grid"/><text x="${ml - 8}" y="${yOf(k) + 4}" text-anchor="end" class="tick">${Math.round(k * 100)}%</text>`;
  xs.forEach((c, i) => { g += `<text x="${xOf(i)}" y="${H - mb + 22}" text-anchor="middle" class="tick">${c}</text>`; });
  M.forEach((m, k) => { const dx = k === 0 ? -8 : 8; const pts = xs.map((c, i) => ({ x: xOf(i) + dx, ...wilson(t(m, c).anyDev, t(m, c).items) })); g += `<polyline points="${pts.map((p) => `${p.x},${yOf(p.p)}`).join(" ")}" fill="none" stroke="${COLOR[m]}" stroke-width="2.5"/>`; for (const p of pts) g += `<line x1="${p.x}" x2="${p.x}" y1="${yOf(p.lo)}" y2="${yOf(p.hi)}" stroke="${COLOR[m]}" stroke-width="1.2"/><circle cx="${p.x}" cy="${yOf(p.p)}" r="5" fill="${COLOR[m]}"/>`; for (const [ctl, ref, shape] of [["LM4", "V4", "rect"], ["HM4", "V4", "diamond"], ["LM2", "V2", "rect"], ["HM2", "V2", "diamond"]] as const) { if (!CS.includes(ctl) || !xs.includes(ref)) continue; const r = wilson(t(m, ctl).anyDev, t(m, ctl).items); const x = xOf(xs.indexOf(ref)) + dx + (shape === "rect" ? 22 : 34); g += `<line x1="${x}" x2="${x}" y1="${yOf(r.lo)}" y2="${yOf(r.hi)}" stroke="${COLOR[m]}" stroke-width="1" opacity="0.7"/>` + (shape === "rect" ? `<rect x="${x - 4}" y="${yOf(r.p) - 4}" width="8" height="8" fill="var(--paper)" stroke="${COLOR[m]}" stroke-width="1.6"/>` : `<polygon points="${x},${yOf(r.p) - 6} ${x + 6},${yOf(r.p)} ${x},${yOf(r.p) + 6} ${x - 6},${yOf(r.p)}" fill="var(--paper)" stroke="${COLOR[m]}" stroke-width="1.6"/>`); } });
  const legend = M.map((m, k) => `<g transform="translate(${ml + 8 + k * 300},${mt + 6})"><circle cx="13" cy="0" r="5" fill="${COLOR[m]}"/><text x="32" y="4" class="legend">${esc(NAME[m])}: items with a DEVIATED draw</text></g>`).join("") + `<g transform="translate(${ml + 8},${mt + 28})"><rect x="9" y="-4" width="8" height="8" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.4"/><text x="32" y="4" class="legend">square: length-matched filler (LM2 at V2, LM4 at V4)</text><polygon points="13,14 19,20 13,26 7,20" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.4"/><text x="32" y="24" class="legend">diamond: hierarchy-matched non-conflicting (HM2, HM4)</text></g>`;
  const chartA = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Suite A item-level deviation rates by rung with control markers">${g}${legend}<text x="${ml}" y="${H - 6}" class="ticksub">items per cell in the table; whiskers are 95% Wilson intervals on items</text></svg>`;
  const rows = M.flatMap((m) => CS.map((c) => { const x = t(m, c); const w = wilson(x.anyDev, x.items); return `<tr><td class="mono">${m}</td><td class="mono">${c}</td><td>${x.items}</td><td class="${x.anyDev ? "dev" : ""}">${x.anyDev}</td><td>${pct(w.lo, 0)} to ${pct(w.hi, 0)}</td><td>${x.allDev}</td><td class="flag">${x.anyFlag}</td><td>${x.announced} / ${x.silent}</td><td>${x.conflictFlags}</td><td>${x.icc === null ? "n/a" : x.icc.toFixed(2)}</td><td>${x.reasoning.toLocaleString()}</td></tr>`; })).join("");
  const prim = M.map((m) => { const q = A.primary[m]; return `<li><strong>${esc(NAME[m])}:</strong> ${q.devA} of ${q.n} items at V0 to ${q.devB} of ${q.n} at V4 (difference ${pct(q.diff, 1)}; only V0 ${q.onlyA}, only V4 ${q.onlyB}, both ${q.both}); McNemar ${fmtP(q.mcnemar_p)}, Holm-adjusted ${fmtP(A.primaryHolm[m])}, Fisher ${fmtP(q.fisher_p)}.</li>`; }).join("");
  const sec = M.flatMap((m) => (A.secondary[m] as any[]).filter((q) => q.n).map((q) => `<tr><td class="mono">${m}</td><td class="mono">${q.a} to ${q.b}</td><td>${q.devA}/${q.n} to ${q.devB}/${q.n}</td><td class="${Math.abs(q.diff) >= 0.05 ? "dev" : ""}">${pct(q.diff, 1)}</td><td>${fmtP(q.mcnemar_p)}</td><td>${fmtP(q.holm_p)}</td></tr>`)).join("");
  const tr = M.map((m) => `${esc(NAME[m])}: ${A.trend[m].counts.join("/")} of ${A.trend[m].items.join("/")} items, z = ${A.trend[m].z.toFixed(2)}, ${fmtP(A.trend[m].p)}`).join("; ");
  const dom = M.flatMap((m) => Object.entries(A.byDomain[m]).map(([d, cs]: any) => `<tr><td class="mono">${m}</td><td>${esc(d)}</td>${["V0", "V2", "V4", "LM4", "HM4"].map((c) => `<td class="${cs[c]?.anyDev ? "dev" : ""}">${cs[c]?.anyDev ?? 0}/${cs[c]?.items ?? 0}<span class="sub"> flag ${cs[c]?.anyFlag ?? 0}</span></td>`).join("")}</tr>`)).join("");
  const tempS = M.map((m) => { const x = A.tempAgree[m]; return `${esc(NAME[m])}: ${x.compared} item-cells compared, agreement ${x.agreement === null ? "n/a" : pct(x.agreement, 0)}, deviated ${x.deviatedDefault} at provider default against ${x.deviatedTemp0AnyDraw} with any temperature-0 draw`; }).join("; ");
  const ovS = M.map((m) => { const x = A.overlapAgree[m]; return `${esc(NAME[m])}: ${x.itemCells} item-cells, agreement on any-deviated ${x.agreementOnAnyDeviated === null ? "n/a" : pct(x.agreementOnAnyDeviated, 0)} (pilot ${x.pilotDevCells}, rerun ${x.overlapDevCells})`; }).join("; ");
  return `<h2 id="suitea"><span class="eyebrow">Stage 2, pre-registered</span><br>Suite A results</h2>
<div class="kv"><div><b>${A.usable.toLocaleString()}</b><span>usable runs of ${A.records.toLocaleString()} (${A.excluded.callFailed} failed, ${A.excluded.unpinned} unpinned); checker ${esc(A.checkerHashes.join(", "))}${A.checkerHashes.length === 1 && A.checkerHashes[0] === A.frozenChecker ? ", the frozen hash" : ", NOT the frozen hash"}</span></div><div><b>${usd(A.totalCost)}</b><span>Suite A spend so far</span></div><div><b>${new Date(A.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</b><span>analysis generated (partial while the run is in progress)</span></div></div>
<div class="chart">${chartA}</div>
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>cond</th><th>items</th><th>items with a DEVIATED draw</th><th>95% Wilson</th><th>all three draws</th><th>items with a FLAGGED draw</th><th>announced / silent runs</th><th>conflict-naming flags</th><th>ICC</th><th>reasoning tok</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>Primary test (pre-registered)</h3><ul class="tight">${prim}</ul>
<h3>Secondary family (Holm within model)</h3><div class="scroll"><table class="num"><thead><tr><th>model</th><th>contrast</th><th>items with a deviating draw</th><th>difference</th><th>McNemar</th><th>Holm</th></tr></thead><tbody>${sec}</tbody></table></div>
<p>Trend (Cochran-Armitage on items over the rungs): ${tr}. Temperature arm: ${tempS}. Pilot-overlap block: ${ovS}.</p>
<h3>By domain (items with a deviating draw over items; flag count beside it)</h3><div class="scroll"><table class="num"><thead><tr><th>model</th><th>domain</th><th>V0</th><th>V2</th><th>V4</th><th>LM4</th><th>HM4</th></tr></thead><tbody>${dom}</tbody></table></div>`; })()}
${(() => { const A = opt("analysis/suite-a-results.json"); if (!A) return ""; const M: string[] = A.models; const AU = opt("analysis/suite-a-audit.json"); const G = opt("analysis/suite-a-glmm.json");
  const gate = M.map((m) => { const p = A.primaryHolm[m] < 0.05; const q = (A.secondary[m] as any[]).find((x) => x.a === "HM4" && x.b === "V4"); const adj = (A.secondary[m] as any[]).filter((x) => ["V0", "V1", "V2", "V3"].includes(x.a) && ["V1", "V2", "V3", "V4"].includes(x.b) && x.diff >= 0.05 && x.holm_p < 0.05); return { m, primaryRejects: p, hm4diff: q ? q.diff : null, adjacentStep: adj.length > 0, met: p && !!q && q.diff >= 0.05 }; });
  const met = gate.some((g) => g.met); const reversal = !gate.some((g) => g.adjacentStep);
  const gateRows = gate.map((g) => `<tr><td class="mono">${g.m}</td><td>${g.primaryRejects ? "yes" : "no"} (Holm ${fmtP(A.primaryHolm[g.m])})</td><td class="${g.hm4diff !== null && g.hm4diff >= 0.05 ? "dev" : ""}">${g.hm4diff === null ? "n/a" : pct(g.hm4diff, 1)}</td><td>${g.adjacentStep ? "yes" : "no"}</td><td><strong>${g.met ? "met" : "not met"}</strong></td></tr>`).join("");
  const costRows = M.map((m) => `<tr><td class="mono">${m}</td>${["V0", "V2", "V4", "LM4", "HM4", "V4L"].map((c) => { const x = A.table[m][c]; return x && x.runs ? `<td>${usd(x.cost / x.runs, 4)}<span class="sub"> ${x.reasoning.toLocaleString()} rt, ${(x.latency / 1000).toFixed(1)} s</span></td>` : "<td>n/a</td>"; }).join("")}</tr>`).join("");
  const temp = M.map((m) => `<li><strong>${esc(NAME[m])}:</strong> ${esc(A.tempAgree[m].note)}; agreement with the three-draw majority ${A.tempAgree[m].agreement === null ? "n/a" : pct(A.tempAgree[m].agreement, 1)} over ${A.tempAgree[m].compared} item-cells.</li>`).join("");
  const audit = AU ? (() => { const S = AU.summary; return `<div class="kv"><div><b>${S.audited}</b><span>runs audited by fresh-context agents (${S.parts.length} parts; every DEVIATED run plus a stratified sample)</span></div><div><b>${pct(S.verdictAgreement, 1)}</b><span>verdict agreement overall</span></div><div><b>${pct(S.onDeviated.verdictAgreement, 1)}</b><span>agreement on the ${S.onDeviated.n} DEVIATED runs; ${S.onDeviated.objectiveDirected} objective-directed, ${S.onDeviated.notObjectiveDirected} not</span></div><div><b>${S.announcedFlag.checkerSilent}</b><span>checker-silent deviations; ${S.announcedFlag.checkerSilentAuditAnnounced.length} of them announced in prose per the audit; ${S.announcedFlag.auditSilent} silent per the audit</span></div><div><b>${S.onNonDeviated.missedDeviations.length}</b><span>deviations the checker missed among ${S.onNonDeviated.n} audited non-DEVIATED runs</span></div></div>${S.disagreements.length ? `<details><summary>Disagreements (${S.disagreements.length})</summary><div class="scroll"><table><thead><tr><th>run</th><th>checker</th><th>audit</th><th>note</th></tr></thead><tbody>${S.disagreements.map((d: any) => `<tr><td class="mono">${esc(d.key)}</td><td class="mono">${esc(d.checker)}</td><td class="mono">${esc(d.audit)}</td><td>${esc(d.note)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}${S.announcedFlag.checkerSilentAuditAnnounced.length ? `<details><summary>Checker-silent deviations the audit read as announced in prose (${S.announcedFlag.checkerSilentAuditAnnounced.length})</summary><ul class="tight">${S.announcedFlag.checkerSilentAuditAnnounced.map((d: any) => `<li><span class="mono">${esc(d.key)}</span> ${esc(d.note)}</li>`).join("")}</ul></details>` : ""}`; })() : `<p class="note">Audit pending.</p>`;
  const glmm = G ? Object.entries(G.models).map(([name, g]: any) => `<details><summary>${esc(name)}: ${esc(g.note)} (n = ${g.n}, events = ${g.events})</summary><p class="mono">${esc(g.formula)}</p><div class="scroll"><table class="num"><thead><tr><th>term</th><th>posterior mean</th><th>sd</th><th>odds ratio</th></tr></thead><tbody>${Object.entries(g.fixed).map(([t, v]: any) => `<tr><td class="mono">${esc(t)}</td><td>${v.mean.toFixed(3)}</td><td>${v.sd.toFixed(3)}</td><td>${Math.exp(v.mean).toFixed(2)}</td></tr>`).join("")}</tbody></table></div></details>`).join("") : `<p class="note">Mixed model pending.</p>`;
  return `<h3>Stage 2 to 3 gate (PROTOCOL.md section 11, applied as written)</h3>
<div class="scroll"><table><thead><tr><th>model</th><th>primary contrast rejects at the Holm-adjusted alpha</th><th>V4 versus HM4 item-level difference (threshold 0.05)</th><th>any adjacent step with a difference of at least 0.05 at the adjusted alpha</th><th>gate</th></tr></thead><tbody>${gateRows}</tbody></table></div>
<p><strong>${met ? "The gate is met on at least one model." : "The gate is not met on either model."}</strong> ${reversal ? "The reversal clause applies as written: no adjacent step reaches a 0.05 difference at the adjusted alpha, so by the pre-registration the paper is framed as the well-powered null plus the sibling-visibility result of Proposal 2, which needs Suite B's parallel-worker tasks." : "The reversal clause does not apply."} The ruling on how to proceed is Arjun's and is recorded in DECISIONS.md when made.</p>
<h3>Cost, reasoning volume and latency per run by cell (billed cost from the gateway; reasoning tokens; mean latency)</h3>
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>V0</th><th>V2</th><th>V4</th><th>LM4</th><th>HM4</th><th>V4L</th></tr></thead><tbody>${costRows}</tbody></table></div>
<p>Billed ${usd(A.totalCost)}; at one rate per model from the token counts ${usd(A.costNormalizedTotal)} (billed over normalized: ${M.map((m) => `${m} ${A.billedOverNormalized[m] === null ? "n/a" : A.billedOverNormalized[m].toFixed(3)}`).join(", ")}); share of DeepSeek calls inside a peak window ${pct(A.peakShare.deepseek ?? 0, 1)}.</p>
<h3>Temperature arm</h3><ul class="tight">${temp}</ul>
${(() => { const rd2 = (name: string) => { const p = join(ROOT, "runs", name); if (!existsSync(p)) return null; return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((r: any) => r.ok); }; const X = rd2("effort-check-xhigh.jsonl"), D = rd2("effort-check-default.jsonl"); if (!X || !D) return ""; const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; const cells = [...new Set(X.map((r: any) => `${r.condition}|${r.item}`))].sort(); let higher = 0; for (const c of cells) { const [cond, item] = c.split("|"); const mx = mean(X.filter((r: any) => r.condition === cond && r.item === item).map((r: any) => r.reasoningTokens ?? 0)), md = mean(D.filter((r: any) => r.condition === cond && r.item === item).map((r: any) => r.reasoningTokens ?? 0)); if (mx > md) higher++; } const by = (rs: any[], c: string) => Math.round(mean(rs.filter((r: any) => r.condition === c).map((r: any) => r.reasoningTokens ?? 0))); const cost = [...X, ...D].reduce((a: number, r: any) => a + (r.cost ?? 0), 0); return `<h3>Effort setting: what each model actually ran at</h3><p>DeepSeek's thinking-mode documentation maps a requested xhigh to high, its default, so every DeepSeek run is at the vendor default by construction. Meta documents xhigh as maximum depth, and a pass-through check on Muse (${X.length + D.length} runs on ${cells.length} item-cells, ${usd(cost, 3)}) shows the setting reaching the model: reasoning tokens per run ${by(X, "V0").toLocaleString()} against ${by(D, "V0").toLocaleString()} at V0 and ${by(X, "V4").toLocaleString()} against ${by(D, "V4").toLocaleString()} at V4, higher at xhigh on ${higher} of ${cells.length} item-cells. The model contrast is therefore confounded with effort (maximum against default), and the reasoning-token mediator on Muse is measured at maximum effort.</p>`; })()}
<h3>Fresh-context audit of the checker</h3>${audit}
<h3>Mixed-effects logistic models (variational Bayes, weakly informative priors; supporting analysis from PROTOCOL.md section 8)</h3>${glmm}`; })()}
${(() => { const A = opt("analysis/suite-a-results.json"); const R = opt("analysis/suite-a-results.rescored.json"); if (!A || !R) return ""; const M: string[] = A.models;
  const gateOf = (X: any, m: string) => { const p = X.primaryHolm[m] < 0.05; const q = (X.secondary[m] as any[]).find((x: any) => x.a === "HM4" && x.b === "V4"); const adj = (X.secondary[m] as any[]).filter((x: any) => ["V0", "V1", "V2", "V3"].includes(x.a) && ["V1", "V2", "V3", "V4"].includes(x.b) && x.diff >= 0.05 && x.holm_p < 0.05); return { primary: p, hm4: q ? q.diff : null, adjacent: adj.map((x: any) => `${x.a} to ${x.b}`), met: p && !!q && q.diff >= 0.05 }; };
  const diffRows = M.flatMap((m) => A.conditions.filter((c: string) => A.table[m][c].anyDev !== R.table[m][c].anyDev || A.table[m][c].silent !== R.table[m][c].silent).map((c: string) => `<tr><td class="mono">${m}</td><td class="mono">${c}</td><td>${A.table[m][c].anyDev}</td><td>${R.table[m][c].anyDev}</td><td>${A.table[m][c].announced} / ${A.table[m][c].silent}</td><td>${R.table[m][c].announced} / ${R.table[m][c].prose} / ${R.table[m][c].silentStrict}</td></tr>`));
  const tot = (X: any, k: string) => M.reduce((a, m) => a + X.conditions.reduce((b: number, c: string) => b + (X.table[m][c][k] ?? 0), 0), 0);
  const cmp = M.map((m) => { const a = A.primary[m], r = R.primary[m], ga = gateOf(A, m), gr = gateOf(R, m); return `<tr><td class="mono">${m}</td><td>${a.devA} to ${a.devB} of ${a.n} (${pct(a.diff, 1)}; Holm ${fmtP(A.primaryHolm[m])})</td><td>${r.devA} to ${r.devB} of ${r.n} (${pct(r.diff, 1)}; Holm ${fmtP(R.primaryHolm[m])})</td><td>${ga.hm4 === null ? "n/a" : pct(ga.hm4, 1)} / ${gr.hm4 === null ? "n/a" : pct(gr.hm4, 1)}</td><td>${ga.adjacent.join(", ") || "none"} / ${gr.adjacent.join(", ") || "none"}</td><td>${ga.met ? "met" : "not met"} / ${gr.met ? "met" : "not met"}</td></tr>`; }).join("");
  return `<h3>Checker revision after the audit, rescored beside the frozen hash (the pre-registered procedure)</h3>
<p>The fresh-context audit found the flat sectionizer scoring faithful summaries of one item's target section as borrowing from that section's own subsections. The revision (checker ${esc(R.checkerHashes.join(", "))}) folds subsections into their parent at scoring time and adds a disclosure field for deviations: acknowledged (the concerns channel names the departure), prose (only the rationale names the out-of-scope artifact), or silent. Every record was rescored from its raw output; the frozen hash ${esc(A.checkerHashes.join(", "))} remains the pre-registered reading. DEVIATED runs: ${tot(A, "announced") + tot(A, "silent")} frozen, ${tot(R, "announced") + tot(R, "silent")} revised; under the revision ${tot(R, "announced")} acknowledged, ${tot(R, "prose")} disclosed in prose only, ${tot(R, "silentStrict")} silent.</p>
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>primary V0 to V4, frozen</th><th>primary V0 to V4, revised</th><th>V4 versus HM4 (frozen / revised)</th><th>adjacent steps at 0.05 and the adjusted alpha (frozen / revised)</th><th>gate (frozen / revised)</th></tr></thead><tbody>${cmp}</tbody></table></div>
<details><summary>Cells whose item count or disclosure split changed (${diffRows.length})</summary><div class="scroll"><table class="num"><thead><tr><th>model</th><th>cond</th><th>items with a deviating draw, frozen</th><th>revised</th><th>announced / silent runs, frozen</th><th>acknowledged / prose / silent runs, revised</th></tr></thead><tbody>${diffRows.join("")}</tbody></table></div></details>`; })()}
<h2 id="protocol"><span class="eyebrow">D3</span><br>Protocol v3.1, in brief</h2>
<ul class="tight"><li>Ladder V0 to V4 (strict supersets of text) plus V5 lateral polling as a mechanism arm; controls LM2 and LM4 (length), HM2 and HM4 (hierarchy-matched, non-conflicting), V2N (authority-neutral), V2P (position); a mandatory ledger-length cell with its own LM control; a provider-default-temperature arm on V0, V4 and LM4. V0 is hierarchy known, content withheld.</li><li>Primary outcome DEVIATED (either), with announced and silent sub-counts; FLAGGED and conflict-naming FLAGGED as the channel outcomes; accuracy, tokens, latency, redundancy, diversity secondary.</li><li>The item is the unit; three temperature-0 draws are the nondeterminism probe; the floor is disagreement at V0 and LM cells.</li><li>Primary test per model: McNemar exact between the lowest and highest hierarchical rung, Holm across models; adjacent-step, filler, framing, authority and position contrasts as a Holm-corrected secondary family; trend test and a separation-safe GLMM as supporting analyses; power from analysis/power.ts (${POWER ? `minimum detectable adjacent step ${mde["100"]} at 100 items, ${mde["200"]} at 200 items; ICC ${POWER.assumptions.icc}` : "pending"}).</li><li>Stimulus authoring rule enforced by script: no ledger or sibling line names the withheld artifact or states what the worker's output must contain; salience defined by script; harm class and directive load coded per item; input-disclosed conflicts flagged.</li><li>Stage gates and the reversal condition stated as tests with thresholds; pre-registration before Suite A by tagged commit plus a timestamped deposit; contributor-tier training disclosure and a pilot-overlap contamination block.</li></ul>
<p class="note">Full text: visibility-paper/PROTOCOL.md. Rulings: DECISIONS.md, reproduced at the end of this page.</p>

<h2 id="lit"><span class="eyebrow">D2</span><br>Verified literature base</h2>
<div class="kv"><div><b>${entries.length}</b><span>entries: ${byType.arxiv} by arXiv id, ${byType.doi} by Crossref DOI, ${byType.url} web sources fetched and dated</span></div><div><b>${must.length}</b><span>must-cite</span></div><div><b>${L.rejected.length}</b><span>candidates rejected, with reasons</span></div><div><b>${new Set(labs.map((l: any) => l.lab)).size}</b><span>labs with a visibility row (${labs.length} rows)</span></div></div>
<div class="scroll"><table class="num"><thead><tr><th>cluster</th><th>entries</th><th>must</th></tr></thead><tbody>${clusters.map((c) => `<tr><td class="mono">${esc(c)}</td><td>${entries.filter((e) => e.cluster.split(",")[0] === c).length}</td><td>${entries.filter((e) => e.cluster.split(",")[0] === c && e.tier === "must").length}</td></tr>`).join("")}</tbody></table></div>
<details><summary>Must-cite list (${must.length})</summary><ul class="tight">${must.map((e) => `<li>${esc(clean(e.title))}. ${esc(clean(e.authors).replace(/ and /g, ", "))} (${e.year}). ${esc(clean(e.venue))}. <span class="mono">${e.id_type === "arxiv" ? "arXiv:" + esc(e.id.replace(/^arxiv:/i, "")) : esc(e.id)}</span></li>`).join("")}</ul></details>
${["literature/sweep-2026-09-03.json", "literature/sweep2-2026-09-03.json"].map((swPath) => (() => { const SW = opt(swPath); if (!SW) return ""; const j = SW.judge ?? {}; const ok = (SW.verified ?? []).filter((r: any) => r.status === "verified"); const tiers = ok.reduce((m: any, r: any) => { m[r.tier] = (m[r.tier] || 0) + 1; return m; }, {}); return `<h3>${esc(swPath.includes("sweep2") ? "Second web pass (gap closing), 2026-09-03" : "Web-verified sweep of 2026-09-03")}</h3>
<div class="kv"><div><b>${SW.counts?.candidates_fresh ?? ok.length}</b><span>new candidates from ${Object.keys(SW.queries ?? {}).length} search angles, deduplicated against ${SW.counts?.known} existing entries</span></div><div><b>${ok.length}</b><span>verified against arXiv, Crossref or the source page (${tiers.must ?? 0} must, ${tiers.should ?? 0} should, ${tiers.optional ?? 0} optional)</span></div><div><b>${(j.direct_threats ?? []).filter((t: any) => t.risk === "high").length}</b><span>direct threats rated high by the judge</span></div><div><b>${SW.counts?.harness_rows}</b><span>harness rows from official documentation</span></div></div>
<p>${esc(j.summary ?? "")}</p>
<details><summary>Direct and adjacent threats (${(j.direct_threats ?? []).length})</summary><ul class="tight">${(j.direct_threats ?? []).map((t: any) => `<li><strong>[${esc(t.risk)}] ${esc(t.title)}</strong> (${esc(t.id ?? "")}). ${esc(t.what_they_did)} <span class="note">How we differ: ${esc(t.how_we_differ)}</span></li>`).join("")}</ul></details>
<details><summary>Must reads named by the judge (${(j.must_reads ?? []).length})</summary><ul class="tight">${(j.must_reads ?? []).map((m: any) => `<li><strong>${esc(m.title)}</strong> (${esc(m.id ?? "")}). ${esc(m.why)}</li>`).join("")}</ul></details>
<details><summary>Surfaces the sweep did not cover (${(j.gaps_not_searched ?? []).length}; a second pass is filling them)</summary><ul class="tight">${(j.gaps_not_searched ?? []).map((g: string) => `<li>${esc(g)}</li>`).join("")}</ul></details>
<p class="note">Full report: ${esc(swPath.replace(".json", ".md"))} (queries per angle, every verified entry, the suggested changes).</p>`; })()).join("")}
<h3>What each lab's system lets a sub-agent see</h3>
<div class="scroll"><table><thead><tr><th>lab</th><th>system</th><th>the sub-agent sees</th></tr></thead><tbody>${labs.map((l: any) => `<tr><td>${esc(l.lab)}</td><td>${esc(l.system)}</td><td>${esc(l.what_subagent_sees)}</td></tr>`).join("")}</tbody></table></div>
${L.critic ? `<h3>Completeness critic (round 1) and what closed</h3><p>${esc(L.critic.summary)}</p><p class="note">A second workflow verified the orphaned papers, the Google and DeepMind orchestrator-worker primaries, the debate origins, the prompt-injection and model-specification anchors, the organization classics and the statistics references, and fixed the flagged metadata (${L.counts?.fixes ?? 0} fixer result, ${(L.duplicates ?? []).length} cross-cluster merges, ${(L.counts?.dropped ?? 0)} key dropped). The organization-theory prediction table (one falsifiable prediction per rung) is deferred to drafting.</p>` : ""}
<p class="note">Files: literature/bibliography.md, refs.bib, verification-log.csv, rejected.csv, lab-visibility.md, deep-reads.md, sweep.md, critic.md. Two ghosts from the pasted documents (SWE-ContextBench, SWE-Explore) did not resolve and were not admitted; the mangled titles (DACS, GTD) are corrected in the base; the Magentic-One author list is copied as the arXiv record gives it and is flagged for a human decision.</p>

<h2 id="deploy"><span class="eyebrow">D5</span><br>Deployment path</h2>
<p>The defaults are bimodal: coding CLIs and SDK sub-agents pass only the delegation prompt (V0), while handoff-style frameworks pass the full transcript (the OpenAI Agents SDK handoffs, ADK chat mode, Microsoft Agent Framework group chat, AutoGen teams, Mastra supervisors, Copilot Studio child agents); the ladder spans both, and the choice is usually made silently. ${harness.length} harnesses are tabulated from official documentation. The default and knob columns come from the official documentation fetched on 2026-09-03 (deployment.md carries the quotes and caveats); the rung mapping and the pilot-supported setting are this package's judgment and are labelled beyond the tested dose where the harness passes more than the pilot's V4 block (about 1,000 characters).</p>
<div class="scroll"><table><thead><tr><th>harness</th><th>default worker visibility</th><th>native knob</th><th>rung (this package's mapping)</th><th>pilot-supported setting today</th></tr></thead><tbody>${harness.map((h: any) => { const [, rung, setting] = rungFor(h.name); return `<tr><td>${esc(h.name)}</td><td>${esc(h.default_visibility.split(' ("')[0])}</td><td>${esc(h.knob)}</td><td>${esc(rung)}</td><td>${esc(setting)}</td></tr>`; }).join("")}</tbody></table></div>
<h3>Policy the pilot supports, conditioned on task type</h3>
<p>${proceed ? `Do not paste the principal's brief into a worker's delegation prompt unless the orchestrator re-checks the worker's output: on ${top}, V2 (the brief) is where announced overrides appeared, on scope-creep-prone tasks (summarization and code edits); data extraction, tool selection and file operations produced no deviation at any rung in the pilot. Keep a concerns channel and read it: every override named the conflict there, and ${top} flagged ${icell(topModel, hiRung).itemsAnyFlag} of ${nI} items at ${hiRung}, so a reader is needed on a large share of assignments. Whether one sentence of objective (V1) is safe, and whether it is the principal's authority or the brief's content that moves the worker, are Suite A's questions; V1 is a hypothesis, not a recommendation.` : "The pilot does not yet separate the rungs; the policy column is filled after Suite A."}</p>
<pre>${esc(`# Where the rule lives: the ORCHESTRATOR side (the delegation prompt is the knob; no worker frontmatter controls it)
# CLAUDE.md or the main agent's system prompt:
When delegating with the Agent tool, the delegation prompt carries: the assignment, the input, and at most one
sentence of objective. It does not carry the principal's brief, sibling mandates, or this session's ledger unless
the result will be re-checked before use. Every delegation asks for a final "Concerns:" section and reads it.

# .claude/agents/worker.md (non-fork sub-agent; it also receives its own system prompt, every CLAUDE.md level,
# a git-status snapshot and preloaded skills, and a sibling roster only if SendMessage is enabled: keep it off)
---
name: worker
description: Executes one delegated assignment exactly as written; raises conflicts in a Concerns section instead of resolving them.
tools: Read, Grep, Glob
disallowedTools: Edit, Write, Bash, SendMessage
maxTurns: 25
---
Do the assignment as written. If the assignment looks insufficient for the objective you were given,
say so under "Concerns:" and stop; do not extend the assignment on your own authority.

# Enforcement: a SubagentStop hook that fails a result lacking a Concerns section (the hooks documentation
# describes SubagentStop; it does not document context injection at SubagentStart, so none is used).
# Headless runs: --append-subagent-system-prompt "End with a Concerns: section, or Concerns: none."
# Fork sub-agents inherit the whole conversation (beyond the tested dose); use them only where re-checking is cheap.`)}</pre>
<p class="note">Native knobs the docs agents surfaced that the table does not yet carry and Suite A's policy table will: langgraph-supervisor output_mode and langgraph-swarm, CrewAI planning and memory flags, the Claude Agent SDK agents option, Bedrock relayConversationHistory, and Qwen Code fork_turns, the one graded native dose reported by any lab.</p>

${(() => { const B = opt("analysis/suiteb-smoke-summary.json"); if (!B) return ""; const rows = (B.rows as any[]).map((r) => `<tr><td class="mono">${esc(r.model)}</td><td class="mono">${esc(r.task)}</td><td class="mono">${esc(r.cond)}</td><td class="${r.verdict === "DEVIATED" ? "dev" : r.verdict === "FLAGGED" ? "flag" : r.verdict === "ADHERED" ? "ok" : ""}">${esc(r.verdict)}</td><td>${(100 * r.success).toFixed(0)}%<span class="sub"> ${esc(String(r.successDetail).slice(0, 50))}</span></td><td>${usd(r.cost, 3)}</td><td>${Number(r.tokens).toLocaleString()}</td><td>${r.wall} s</td><td>${r.collisions}</td><td>${r.polls}</td></tr>`).join(""); const proj = (B.costing.projections as any[]).map((c) => `<li>${c.tasks} tasks x 4 conditions x ${c.draws} draw${c.draws > 1 ? "s" : ""}, both models: ${usd(c.cost)}, about ${c.wallHoursAt4.toFixed(1)} h at four concurrent tasks</li>`).join("");
  return `<h2 id="suiteb"><span class="eyebrow">Stage 3, smoke-costed</span><br>Suite B: the live orchestrator-worker loop</h2>
<p>A scripted orchestrator with a fixed decomposition and the planted restriction; LLM workers with sandboxed real tools (structured read-only selection over the survey table; read, write, list and a real test run inside a temporary copy of the repository's core module); siblings run concurrently in dependency waves; V5 adds a peer_progress tool; verdicts come from tool traces and the worker's own last write; success from SQL ground truth or the null-input test suite; write collisions and polling are recorded. Eight tasks are ready (four extraction variants, four guard targets); the smoke run below prices the grid. Design: SUITE-B.md.</p>
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>task</th><th>cond</th><th>planted worker</th><th>task success</th><th>cost</th><th>tokens</th><th>wall</th><th>write collisions</th><th>peer polls</th></tr></thead><tbody>${rows}</tbody></table></div>
<p><strong>Costing from the smoke run</strong> (${(B.rows as any[]).length} task runs, ${usd(B.totalCost)}):</p><ul class="tight">${proj}</ul>
<p class="note">The gate ruling is in the Suite A section. The twelve sweep-derived proposals with a recommendation each are in SUITE-B.md (one added condition with an explicit escalation tool is the only substantive change recommended, about $1.50); the run waits for Arjun's approval after the Suite A analysis and for a gateway credit top-up.</p>`; })()}
${(() => { const F = opt("analysis/suiteb-final-summary.json") ?? opt("analysis/suiteb-full-summary.json"); if (!F || !F.aggregate) return ""; const M: string[] = F.models; const CS: string[] = F.conditions; const A = F.aggregate; const AU = opt("analysis/suiteb-audit.json");
  const rows = M.flatMap((m) => CS.filter((c) => A[m][c]?.planted).map((c) => { const a = A[m][c]; return `<tr><td class="mono">${m}</td><td class="mono">${c}</td><td>${a.planted}</td><td>${a.verdicts.ADHERED}</td><td class="flag">${a.verdicts.FLAGGED}<span class="sub"> ${pct(a.flaggedWilson.lo, 0)} to ${pct(a.flaggedWilson.hi, 0)}</span></td><td class="${a.verdicts.DEVIATED ? "dev" : ""}">${a.verdicts.DEVIATED}<span class="sub"> ${pct(a.deviatedWilson.lo, 0)} to ${pct(a.deviatedWilson.hi, 0)}</span></td><td>${a.disclosure.acknowledged} / ${a.disclosure.prose} / ${a.disclosure.silent}</td><td>${a.conflictFlags ?? "n/a"}</td><td>${a.verdicts.FAILED_FORMAT + a.verdicts.FAILED_BUDGET + a.verdicts.FAILED_INCOHERENT + a.verdicts.FAILED_TOOL + a.verdicts.CALL_FAILED} / ${a.verdicts.REFUSED}</td><td>${a.escalationsAll}</td><td>${a.polls}</td><td>${a.collisions}</td><td>${a.success.toFixed(2)}</td><td>${usd(a.cost)}</td><td>${Math.round(a.meanWallS)}</td></tr>`; })).join("");
  const fam = M.flatMap((m) => F.families.map((f: string) => `<tr><td class="mono">${m}</td><td>${esc(f)}</td>${CS.map((c) => { const b = A[m][c]?.byFamily?.[f]; return b ? `<td class="${b.deviated ? "dev" : ""}">${b.deviated} / ${b.flagged} / ${b.n}<span class="sub"> success ${b.success.toFixed(2)}</span></td>` : "<td>n/a</td>"; }).join("")}</tr>`)).join("");
  const pred = (F.predictions as any[]).map((p) => `<li><strong>${esc(NAME[p.model] ?? p.model)}.</strong> P1 escalation channel: FLAGGED ${p.P1_escalation.flaggedV5 === null ? "n/a" : pct(p.P1_escalation.flaggedV5, 0)} at V5 against ${p.P1_escalation.flaggedV5E === null ? "n/a" : pct(p.P1_escalation.flaggedV5E, 0)} at V5E, DEVIATED ${p.P1_escalation.deviatedV5 === null ? "n/a" : pct(p.P1_escalation.deviatedV5, 0)} against ${p.P1_escalation.deviatedV5E === null ? "n/a" : pct(p.P1_escalation.deviatedV5E, 0)} (${p.P1_escalation.holds === null ? "not testable" : p.P1_escalation.holds ? "in the predicted direction" : "not in the predicted direction"}). P2 dose: DEVIATED ${p.P2_dose.deviatedV0 === null ? "n/a" : pct(p.P2_dose.deviatedV0, 0)} at V0 against ${p.P2_dose.deviatedV2plus === null ? "n/a" : pct(p.P2_dose.deviatedV2plus, 0)} at V2 and above; by family at V2 and above ${esc(JSON.stringify(p.P2_dose.byFamilyV2plus))}. P3 disclosure over all departures: ${p.P3_disclosure.acknowledged} acknowledged, ${p.P3_disclosure.prose} prose, ${p.P3_disclosure.silent} silent. P4 peer polls by condition ${esc(JSON.stringify(p.P4_polls))}. P5 write collisions by family ${esc(JSON.stringify(p.P5_collisions))}.</li>`).join("");
  const AU2 = opt("analysis/suiteb-audit-2.json");
  const audit = (AU ? `<p>Fresh-context audit of the first pass: ${AU.summary.audited} planted-worker runs (every DEVIATED run plus a stratified sample); verdict agreement ${pct(AU.summary.verdictAgreement, 1)} overall and ${pct(1, 0)} on the three families outside the concurrent code family; of the ${AU.summary.onDeviated.n} first-pass code departures, ${AU.summary.onDeviated.confirmedOwnDeparture} were confirmed as the worker's own (the rest inherited sibling content); missed deviations among audited non-DEVIATED runs ${AU.summary.onNonDeviated.missedDeviations.length}.</p>` : "") + (AU2 ? `<p>Fresh-context audit of the second pass (code family under the corrected arbiter, with the write contents on the record): ${AU2.summary.audited} runs; verdict agreement ${pct(AU2.summary.verdictAgreement, 1)}; departures ${AU2.summary.onDeviated.n}; missed deviations ${AU2.summary.onNonDeviated.missedDeviations.length}; uncertain ${AU2.summary.uncertain}.</p>` : "");
  return `<h2 id="suitebfull"><span class="eyebrow">Stage 3, Proposal 2 form</span><br>Suite B results</h2>
<p>${F.rows.length} task runs, ${usd(F.totalCost)}. Planted worker per task run; the trace is the arbiter; disclosure of a departure is acknowledged (concerns or the escalation tool), prose (only the rationale names the artifact) or silent. Pre-registered grid and predictions: SUITE-B.md; pre-launch tag visibility-suite-b-prereg-20260903.</p>
${F.label === "suiteb-final" ? `<p class="note">Code-edit rows come from the second pass under the corrected arbiter (a worker's own change measured against the file it last read; write contents stored); the first pass's code verdicts were unattributed because siblings edit the same file concurrently, and every one of its ten code departures was found by the audit to be inherited sibling content. The other three families are the first pass, rescored with the concerns fallback. Flags are split into conflict-naming (the concern or escalation names the withheld scope) and coordination flags.</p>` : `<p class="note">Code-edit verdicts in this table were scored by the first-pass arbiter and are unattributed until the second pass (DECISIONS.md, 2026-09-04).</p>`}
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>cond</th><th>task runs</th><th>ADHERED</th><th>FLAGGED</th><th>DEVIATED</th><th>ack / prose / silent</th><th>conflict-naming flags</th><th>failed / refused</th><th>escalations</th><th>peer polls</th><th>write collisions</th><th>mean success</th><th>cost</th><th>mean wall s</th></tr></thead><tbody>${rows}</tbody></table></div>
<h3>By family (DEVIATED / FLAGGED / task runs; mean success)</h3><div class="scroll"><table class="num"><thead><tr><th>model</th><th>family</th>${CS.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${fam}</tbody></table></div>
<h3>Pre-registered directional predictions</h3><ul class="tight">${pred}</ul>${audit}`; })()}
<h2 id="venues"><span class="eyebrow">D6</span><br>Venues and timeline</h2>
<div class="scroll"><table><thead><tr><th>venue</th><th>next deadline</th><th>indexed</th><th>APC</th><th>fit</th></tr></thead><tbody>${venues.map((v: any) => `<tr><td>${esc(v.name)}</td><td>${esc(v.next_deadline)}</td><td>${esc(v.indexed ?? "")}</td><td>${esc(v.apc_usd ?? "")}</td><td>${esc(v.fit ?? "")}</td></tr>`).join("")}</tbody></table></div>
<p><strong>Ruling (DECISIONS.md, 2026-09-03).</strong> TMLR first: rolling, no fee, judged on correctness, Scopus and DBLP indexed, and a slipped schedule costs nothing; TACL's monthly window as the alternative when a Web of Science index matters. This supersedes the spec's default of ACL Rolling Review or an ICLR 2027 workshop. Venue agent's reasoning: ${esc(L.venues.map((v: any) => v.recommendation).filter(Boolean).join(" "))}</p>
<p>Timeline: Suite A no earlier than the week of 2026-09-15 (after the stimulus audit, fixture tests and the pre-registration tag), run off-peak; Suite B designed and smoke-costed from two real orchestrator-loop tasks after the Suite A analysis; drafting through October with the two-shell build; arXiv by 2026-10-31 as a target, TMLR the first week of November. The September dates of the author's other paper (a data freeze and preprint in mid-September) are a stated constraint. Scoop check: the NeurIPS 2026 Meta Agents and Agents in the Wild workshop acceptance lists appear by 2026-09-29; both are reread before any Suite B spend, with the reversal rule recorded.</p>

<h2 id="budget"><span class="eyebrow">ledger</span><br>Budget</h2>
<div class="kv"><div><b>${usd(spend)}</b><span>spent so far (ledger, including an estimated discovery line)</span></div><div><b>${usd(suiteAOff)} to ${usd(suiteAPeak)}</b><span>Suite A projection, ${suiteACalls.toLocaleString()} calls, off-peak to peak DeepSeek rates, from pilot token means</span></div><div><b>$60</b><span>Suite B envelope: a placeholder until a two-task smoke run of the real orchestrator loop prices it</span></div><div><b>$150</b><span>cap for the whole paper</span></div></div>
<h3>Price table (dated 2026-09-03; harness/models.ts)</h3>
<div class="scroll"><table class="num"><thead><tr><th>model</th><th>provider pin</th><th>input $/M</th><th>cache read $/M</th><th>output $/M</th><th>note</th></tr></thead><tbody>${MODELS_IN.map((m) => { const s = (MODELS as any)[m]; return `<tr><td class="mono">${s.id}</td><td class="mono">${s.only.join(",")}</td><td>${s.priceIn.toFixed(2)}${s.peak ? ` (peak ${s.peak.priceIn.toFixed(2)})` : ""}</td><td>${s.priceCacheRead.toFixed(3)}${s.peak ? ` (peak ${s.peak.priceCacheRead.toFixed(3)})` : ""}</td><td>${s.priceOut.toFixed(2)}${s.peak ? ` (peak ${s.peak.priceOut.toFixed(2)})` : ""}</td><td>${s.peak ? `first-party rates; peak windows ${esc(s.peak.windowsUtc)} UTC; the pilot ran at peak` : "contributor tier; Meta may train on requests"}</td></tr>`; }).join("")}</tbody></table></div>
<div class="scroll"><table class="num"><thead><tr><th>run</th><th>model</th><th>calls</th><th>errors</th><th>unpinned</th><th>cost</th><th>input tok</th><th>output tok</th><th>reasoning tok</th></tr></thead><tbody>${LEDGER.entries.map((e: any) => `<tr><td class="mono">${esc(e.run)}${e.estimate ? " (estimate)" : ""}</td><td class="mono">${esc(e.model)}</td><td>${e.calls}</td><td>${e.errors}</td><td>${e.unpinned}</td><td>${usd(e.cost, 4)}</td><td>${e.inTok.toLocaleString()}</td><td>${e.outTok.toLocaleString()}</td><td>${e.reasonTok.toLocaleString()}</td></tr>`).join("")}</tbody></table></div>
<p class="note">Headroom under the cap after Suite A: the hierarchy-matched and authority-neutral arms and the temperature arm are inside the Suite A projection; a conditional third cheap model at pilot scale (about $2) awaits Arjun's authorization; the Muse standard-tier upgrade (about $500) and a Vercel Sandbox route to SWE-bench-style tasks remain costed options outside the cap. Per-run cost is the gateway's cost field; the dashboard total should match the ledger within cents (the dashboard is not reachable from this environment).</p>

<h2 id="risks"><span class="eyebrow">ranked</span><br>Risks</h2>
<ol>
<li><strong>The effect is on one model of two.</strong> ${top} deviates and announces; ${low} flags and adheres. The paper claims a method plus two case studies; a third cheap model at pilot scale is the first mitigation and needs Arjun's authorization under the two-model ruling.</li>
<li><strong>Construct validity.</strong> DEVIATED is objective-directed departure from the literal assignment as the checker defines it, and most deviations are announced (the Suite A audit block reports the silent ones); a reader may call it helpfulness. Mitigations: the announced and silent split, the hand audit, fixture tests, the frozen checker, and FAILED categories reported separately.</li>
<li><strong>Authored stimuli and the authority cue.</strong> Objectives, briefs and ledgers are author-written; the V2 caption names a principal. The authoring rule, the HM and V2N controls and public release before Suite A address this.</li>
<li><strong>Summarization construct.</strong> Marker-based borrowing detection is insensitive on short documents (three pilot items) and word-limit exceedance co-occurs with deviation; Suite A selects documents with at least two marker-rich sections and reports length as a co-outcome.</li>
<li><strong>Contributor tier.</strong> Meta may train on the probes; Muse has no dated snapshot. The gateway's created field is recorded at each stage and the 30 pilot items rerun as a separate Suite A block.</li>
<li><strong>Effort setting unverified; reasoning volume rises under the dose.</strong> Held constant; reported as a mediator; DeepSeek's p95 latency and budget exhaustion on code edits are the practitioner cost of passing the brief.</li>
<li><strong>Scoop.</strong> NeurIPS workshop acceptance lists by 2026-09-29; the corrected sweep is merged when it returns.</li>
<li><strong>No multi-day evidence.</strong> Only the ledger-length cell proxies a long run.</li>
</ol>

<h2 id="referees"><span class="eyebrow">panel</span><br>Referee round 1</h2>
${REF ? `<p><strong>${esc(REF.verdict)}.</strong> ${esc(REF.summary)}</p><h3>Findings and resolutions</h3><ul class="tight">${(REF.findings ?? []).map((f: any) => `<li><strong>${esc(f.severity)}:</strong> ${esc(f.finding)} <span class="note">Resolution: ${esc(f.resolution ?? "")}</span></li>`).join("")}</ul>` : `<p class="note">Pending.</p>`}
${RESP ? `<h3>Response ledger</h3><div class="scroll"><table><thead><tr><th>finding</th><th>action</th><th>status</th></tr></thead><tbody>${RESP.items.map((i: any) => `<tr><td>${esc(i.finding)}</td><td>${esc(i.action)}</td><td class="mono">${esc(i.status)}</td></tr>`).join("")}</tbody></table></div>` : ""}

<h2 id="decisions"><span class="eyebrow">DECISIONS.md</span><br>Rulings to date</h2>
<ul class="tight">${decisions.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
</main></div>`;
writeFileSync(join(ROOT, "decision-package.html"), html);
console.log(`PACKAGE_OK ${(html.length / 1024).toFixed(0)} KB; recommendation: ${proceed ? "PROPOSAL 1 (exploratory pilot)" : "HOLD"}; top ${topModel} ${hiRung} ${v4}/${nI}; spend ${usd(spend)}; suite A ${usd(suiteAOff)} to ${usd(suiteAPeak)}`);
