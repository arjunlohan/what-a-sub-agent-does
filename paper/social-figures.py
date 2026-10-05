"""Social images for the X thread, drawn from the artifacts (analysis/*.json, paper/gen/numbers.json).
1600x900 PNGs with large type. Run: <statsenv>/bin/python paper/social-figures.py  (writes paper/social/*.png)"""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle
from matplotlib import font_manager

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "paper", "social"); os.makedirs(OUT, exist_ok=True)
A = json.load(open(os.path.join(ROOT, "analysis", "suite-a-results.json")))
B = json.load(open(os.path.join(ROOT, "analysis", "suiteb-final-summary.json")))
N = json.load(open(os.path.join(ROOT, "paper", "gen", "numbers.json")))

SURFACE, INK, INK2, MUTED, GRID, BASE = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
COL = {"deepseek": "#2a78d6", "muse": "#eb6834"}  # validated categorical slots 1 and 2
NAME = {"deepseek": "DeepSeek V4 Flash", "muse": "Muse Spark 1.3"}
FOOT = "Lohan (2026), The Scope Creep Myth. doi:10.5281/zenodo.22433898"
plt.rcParams.update({"font.family": "sans-serif", "font.sans-serif": ["Helvetica Neue", "Helvetica", "Arial", "DejaVu Sans"], "axes.edgecolor": BASE, "axes.linewidth": 1, "xtick.color": INK2, "ytick.color": INK2, "text.color": INK, "axes.labelcolor": INK2})

def fig(w=8, h=4.5):
    f = plt.figure(figsize=(w, h), dpi=200, facecolor=SURFACE); return f
def title(f, text, sub=None):
    fs = 17 if len(text) <= 66 else 15 if len(text) <= 78 else 13.5
    f.text(0.04, 0.93, text, fontsize=fs, fontweight="semibold", color=INK, ha="left", va="center")
    if sub: f.text(0.04, 0.865, sub, fontsize=11.5, color=INK2, ha="left", va="center")
def footer(f):
    f.text(0.04, 0.035, FOOT, fontsize=8.5, color=MUTED, ha="left", va="center")
def style(ax):
    for s in ("top", "right"): ax.spines[s].set_visible(False)
    ax.spines["left"].set_visible(False); ax.spines["bottom"].set_color(BASE)
    ax.set_facecolor(SURFACE); ax.tick_params(length=0, labelsize=11); ax.yaxis.grid(True, color=GRID, linewidth=1); ax.set_axisbelow(True)
def legend(ax, loc="upper left"):
    h = [plt.Line2D([], [], marker="s", linestyle="", markersize=9, color=COL[m], label=NAME[m]) for m in ("deepseek", "muse")]
    ax.legend(handles=h, loc=loc, frameon=False, fontsize=11, handletextpad=0.4)
def grouped(ax, conds, key, labels=None, ymax=None, value_fmt=lambda v: f"{v}", label_fs=10.5):
    xs = range(len(conds)); w = 0.36
    for i, m in enumerate(("deepseek", "muse")):
        vals = [key(m, c) for c in conds]
        bars = ax.bar([x + (i - 0.5) * (w + 0.02) for x in xs], vals, width=w, color=COL[m], linewidth=0)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + (ymax or max(vals)) * 0.015, value_fmt(v), ha="center", va="bottom", fontsize=label_fs, color=INK2)
    ax.set_xticks(list(xs)); ax.set_xticklabels(labels or conds, fontsize=11.5, color=INK)
    if ymax: ax.set_ylim(0, ymax)

RUNGS = ["V0", "V1", "V2", "V3", "V4"]
RUNG_LABELS = ["V0\nassignment\nonly", "V1\n+ one line of\nobjective", "V2\n+ the full\nbrief", "V3\n+ sibling\nassignments", "V4\n+ orchestrator\nledger"]

# ---- post 1: title card
f = fig(); f.text(0.04, 0.80, "The Scope Creep Myth", fontsize=30, fontweight="bold", color=INK, va="center")
f.text(0.04, 0.685, "How hierarchical visibility drives escalation rather than departure\nin multi-agent systems", fontsize=14, color=INK2, va="center", linespacing=1.4)
tiles = [(N["saUsable"], "task delegations"), ("2", "frontier reasoning models"), ("6", "rungs of visibility"), ("0", "attributed departures in\n600 live multi-agent runs")]
for i, (v, l) in enumerate(tiles):
    x = 0.04 + i * 0.235
    f.text(x, 0.40, v, fontsize=34, fontweight="semibold", color=INK, va="center")
    f.text(x, 0.255, l, fontsize=10.5, color=INK2, va="center", linespacing=1.3)
f.text(0.04, 0.10, "Arjun Lohan, University of Southern California. Preprint on Zenodo.", fontsize=10, color=MUTED, va="center")
f.savefig(os.path.join(OUT, "thread-01-title.png"), facecolor=SURFACE); plt.close(f)

# ---- post 2: the ladder
f = fig(); title(f, "What the worker can see at each rung", "Each rung adds text to the one below it; the assignment and its planted conflict never change")
ax = f.add_axes([0.04, 0.12, 0.56, 0.70]); ax.set_xlim(0, 10); ax.set_ylim(0, 6.6); ax.axis("off")
steps = [("V0", "the assignment and its input"), ("V1", "one sentence of the principal's objective"), ("V2", "the principal's brief, verbatim"), ("V3", "the sibling workers' assignments"), ("V4", "the orchestrator's dated event ledger"), ("V5", "a live tool that reports sibling progress")]
for i, (r, t) in enumerate(steps):
    y = i * 1.05
    ax.add_patch(FancyBboxPatch((0.2, y + 0.1), 9.4, 0.85, boxstyle="round,pad=0.02,rounding_size=0.12", facecolor="#e8eef7" if i else "#f0efec", edgecolor="none"))
    ax.text(0.55, y + 0.52, r, fontsize=13, fontweight="semibold", color=INK, va="center")
    ax.text(1.75, y + 0.52, ("+ " if i else "") + t, fontsize=11.5, color=INK, va="center")
ax.annotate("", xy=(9.85, 6.4), xytext=(9.85, 0.2), arrowprops=dict(arrowstyle="-|>", color=MUTED, lw=1.2))
ax.text(9.6, 3.3, "more of the hierarchy", rotation=90, fontsize=9.5, color=MUTED, ha="center", va="center")
f.text(0.64, 0.74, "Two matched controls", fontsize=12, fontweight="semibold", color=INK, va="center")
f.text(0.64, 0.62, "Run beside rungs 2 and 4.\nLength-matched: the same number\nof characters, filled with inert text.", fontsize=11, color=INK2, va="center", linespacing=1.35)
f.text(0.64, 0.43, "Hierarchy-matched: a real brief, siblings\nand ledger borrowed from an unrelated\ntask, so the worker sees a hierarchy its\nassignment cannot serve.", fontsize=11, color=INK2, va="center", linespacing=1.35)
f.text(0.64, 0.24, "200 items, five domains, three draws\neach, two models: 15,600 calls.", fontsize=11, color=INK2, va="center", linespacing=1.35)
footer(f); f.savefig(os.path.join(OUT, "thread-02-ladder.png"), facecolor=SURFACE); plt.close(f)

# ---- post 3: departures by rung
f = fig(); title(f, "Items with at least one departing run, out of 200", "Departures toward the objective stay rare at every rung")
ax = f.add_axes([0.06, 0.20, 0.90, 0.58]); style(ax)
grouped(ax, RUNGS, lambda m, c: A["table"][m][c]["anyDev"], RUNG_LABELS, ymax=16.5); ax.set_yticks([0, 5, 10, 15]); legend(ax)
ax.text(4.5, 16.2, f"Muse Spark at rung 4: {A['table']['muse']['V4']['anyDev']} items (p = 0.008, Holm)\nlength-matched control: {A['table']['muse']['LM4']['anyDev']}, hierarchy-matched control: {A['table']['muse']['HM4']['anyDev']}", ha="right", va="top", fontsize=10.5, color=INK2, linespacing=1.35)
footer(f); f.savefig(os.path.join(OUT, "thread-03-departures.png"), facecolor=SURFACE); plt.close(f)

# ---- post 4: flags by rung
f = fig(); title(f, "Items with at least one flagged run, out of 200", "A flag is a worker that keeps the assignment and reports the conflict in its concerns list")
ax = f.add_axes([0.06, 0.20, 0.90, 0.58]); style(ax)
grouped(ax, RUNGS, lambda m, c: A["table"][m][c]["anyFlag"], RUNG_LABELS, ymax=110); ax.set_yticks([0, 50, 100]); legend(ax)
footer(f); f.savefig(os.path.join(OUT, "thread-04-flags.png"), facecolor=SURFACE); plt.close(f)

# ---- post 5: coherence, rung 4 and its controls
f = fig(); title(f, "Cost follows the shape of the context, departures follow its coherence", "Same 200 items at rung 4, four versions of the context")
cells = ["V0", "LM4", "HM4", "V4"]; cl = ["V0\nassignment\nonly", "filler of\nthe same\nlength", "unrelated\nhierarchy", "V4\nreal\nhierarchy"]
ax = f.add_axes([0.06, 0.20, 0.42, 0.55]); style(ax); ax.set_title("Reasoning tokens per run", fontsize=12, color=INK, loc="left", pad=8)
grouped(ax, cells, lambda m, c: A["table"][m][c]["reasoning"], cl, ymax=4200, value_fmt=lambda v: f"{int(round(v)):,}", label_fs=9); ax.set_yticks([0, 2000, 4000]); ax.set_yticklabels(["0", "2,000", "4,000"]); legend(ax)
ax2 = f.add_axes([0.56, 0.20, 0.40, 0.55]); style(ax2); ax2.set_title("Items with a departing run", fontsize=12, color=INK, loc="left", pad=8)
grouped(ax2, cells, lambda m, c: A["table"][m][c]["anyDev"], cl, ymax=14); ax2.set_yticks([0, 5, 10])
ax2.text(1.5, 13.5, f"Muse Spark refused {N['saMuseHMfourRefused']} of {N['saMuseHMfourRuns']}\nruns with the unrelated hierarchy", ha="center", va="top", fontsize=10, color=INK2, linespacing=1.3)
footer(f); f.savefig(os.path.join(OUT, "thread-05-coherence.png"), facecolor=SURFACE); plt.close(f)

# ---- post 6: live loop
f = fig(); title(f, "Live loop, 600 task runs: flags rise, departures stay at zero", "Planted worker, 60 task runs per cell, real files and tools, concurrent siblings")
conds = ["V0", "V2", "V4", "V5", "V5E"]; clab = ["V0\nassignment\nonly", "V2\n+ brief", "V4\n+ siblings\nand ledger", "V5\n+ peer\nstatus tool", "V5E\n+ escalation\ntool"]
ax = f.add_axes([0.06, 0.20, 0.90, 0.56]); style(ax)
grouped(ax, conds, lambda m, c: B["aggregate"][m][c]["verdicts"]["FLAGGED"], clab, ymax=36); ax.set_yticks([0, 10, 20, 30]); ax.set_ylabel("flagged runs of 60", fontsize=10.5); legend(ax)
dev = sum(B["aggregate"][m][c]["verdicts"]["DEVIATED"] for m in ("deepseek", "muse") for c in conds)
ax.text(4.5, 34, f"attributed departures in every cell: {dev}\none-sided 95% upper bound, pooled: 1.24%", ha="right", va="top", fontsize=10.5, color=INK2, linespacing=1.35)
footer(f); f.savefig(os.path.join(OUT, "thread-06-live.png"), facecolor=SURFACE); plt.close(f)

# ---- post 7: attribution diagram
f = fig(); title(f, "Why a naive diff reports scope creep that never happened", "Two workers edit one shared file; the planted worker owns function A only")
ax = f.add_axes([0.03, 0.12, 0.94, 0.70]); ax.set_xlim(0, 16); ax.set_ylim(0, 6); ax.axis("off")
def filebox(x, y, guards, label, accent=None):
    ax.add_patch(FancyBboxPatch((x, y), 3.0, 3.2, boxstyle="round,pad=0.02,rounding_size=0.15", facecolor="#f0efec", edgecolor="none"))
    ax.text(x + 1.5, y + 3.45, label, ha="center", va="bottom", fontsize=10.5, fontweight="semibold", color=INK)
    for i, fn in enumerate("ABC"):
        yy = y + 2.45 - i * 0.95
        ax.add_patch(Rectangle((x + 0.25, yy - 0.3), 2.5, 0.65, facecolor=(COL["muse"] if (fn in guards and fn == "A") else COL["deepseek"] if fn in guards else "#ffffff"), edgecolor="none", alpha=0.9 if fn in guards else 1))
        ax.text(x + 0.45, yy, f"fn {fn}" + ("  + guard" if fn in guards else ""), va="center", fontsize=10, color="#ffffff" if fn in guards else INK)
filebox(0.3, 1.2, "", "1. original file")
filebox(4.3, 1.2, "BC", "2. sibling guards B and C")
filebox(8.3, 1.2, "BC", "3. worker reads the file")
filebox(12.3, 1.2, "ABC", "4. worker guards A")
for x in (3.45, 7.45, 11.45): ax.annotate("", xy=(x + 0.75, 2.8), xytext=(x, 2.8), arrowprops=dict(arrowstyle="-|>", color=MUTED, lw=1.5))
ax.text(8.15, 0.75, "diff 4 against 1: A, B and C changed. Verdict: scope creep.", ha="center", va="center", fontsize=11.5, color=INK, fontweight="semibold")
ax.text(8.15, 0.25, "diff 4 against 3, what the worker last read: only A changed. Verdict: adhered. All 10 first-pass departures were this.", ha="center", va="center", fontsize=10, color=INK2)
h = [plt.Line2D([], [], marker="s", linestyle="", markersize=9, color=COL["deepseek"], label="sibling's edit"), plt.Line2D([], [], marker="s", linestyle="", markersize=9, color=COL["muse"], label="planted worker's own edit")]
ax.legend(handles=h, loc="upper right", frameon=False, fontsize=10, bbox_to_anchor=(1.0, 1.02))
footer(f); f.savefig(os.path.join(OUT, "thread-07-attribution.png"), facecolor=SURFACE); plt.close(f)

# ---- post 8: cost
f = fig(); title(f, "Showing the hierarchy roughly doubles reasoning and latency", "Rung 0 against rung 4, per run, main block")
ax = f.add_axes([0.06, 0.20, 0.42, 0.55]); style(ax); ax.set_title("Reasoning tokens per run", fontsize=12, color=INK, loc="left", pad=8)
grouped(ax, ["V0", "V4"], lambda m, c: A["table"][m][c]["reasoning"], ["V0", "V4"], ymax=4200, value_fmt=lambda v: f"{int(round(v)):,}"); ax.set_yticks([0, 2000, 4000]); ax.set_yticklabels(["0", "2,000", "4,000"]); legend(ax)
ax2 = f.add_axes([0.56, 0.20, 0.40, 0.55]); style(ax2); ax2.set_title("Mean latency per run, seconds", fontsize=12, color=INK, loc="left", pad=8)
grouped(ax2, ["V0", "V4"], lambda m, c: A["table"][m][c]["latency"] / 1000, ["V0", "V4"], ymax=38, value_fmt=lambda v: f"{v:.1f}"); ax2.set_yticks([0, 10, 20, 30])
f.text(0.06, 0.095, "Billed cost scales with the tokens. Sibling assignments and the ledger add cost without changing adherence.", fontsize=10.5, color=INK2)
footer(f); f.savefig(os.path.join(OUT, "thread-08-cost.png"), facecolor=SURFACE); plt.close(f)

# ---- post 9: where the default lives
f = fig(); title(f, "Where the default lives in 62 orchestration frameworks", "Three regimes, from the official documentation; examples in each")
cols = [("Isolated context", "the worker gets the delegation\nprompt and nothing else", ["Claude Code subagents", "Cursor subagents", "Gemini CLI subagents", "Devin CLI subagents", "smolagents", "Goose, OpenCode"], "Write the objective and the brief into\nthe prompt; ask for a concerns list."),
        ("Configurable context", "a parameter or state schema\nsets what passes down", ["OpenAI Agents SDK (input_filter)", "OpenAI multi-agent API (fork_turns)", "LangGraph state schemas", "Dify Agent node", "AWS Bedrock Agents"], "Pass the brief, not the transcript;\nthe transcript doubles reasoning."),
        ("Shared transcript", "every participant sees the\nwhole conversation", ["AutoGen AgentChat teams", "Microsoft Agent Framework", "LlamaIndex handoffs"], "Expect the reasoning cost. Guard\nconcurrent writes with state.")]
for i, (h, sub, ex, todo) in enumerate(cols):
    x = 0.04 + i * 0.32
    f.text(x, 0.76, h, fontsize=13, fontweight="semibold", color=INK, va="center")
    f.text(x, 0.685, sub, fontsize=9.5, color=INK2, va="center", linespacing=1.3)
    for j, e in enumerate(ex): f.text(x, 0.585 - j * 0.058, e, fontsize=10.5, color=INK, va="center")
    f.text(x, 0.20, todo, fontsize=10, color=INK2, va="center", linespacing=1.35)
footer(f); f.savefig(os.path.join(OUT, "thread-09-harnesses.png"), facecolor=SURFACE); plt.close(f)
print("SOCIAL_OK", sorted(os.listdir(OUT)))
