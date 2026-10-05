"""Figures for the paper, drawn from the artifacts. Run: <statsenv>/bin/python visibility-paper/paper/figures.py"""
import json, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from math import sqrt
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = json.load(open(os.path.join(ROOT, "analysis", "suite-a-results.json")))
B = json.load(open(os.path.join(ROOT, "analysis", "suiteb-final-summary.json")))
# FIG_STYLE=springer writes the journal versions (paper/springer/Fig2.pdf to Fig4.pdf): sans lettering at 8 to 9 pt at the
# 372 pt text width, panel letters instead of titles, and a marker, line or hatch pattern beside every colour.
SN = os.environ.get("FIG_STYLE") == "springer"
OUT = os.path.join(ROOT, "paper", "springer" if SN else "figures")
plt.rcParams.update({"font.family": "serif", "font.size": 9, "axes.spines.top": False, "axes.spines.right": False, "axes.titlesize": 9, "legend.fontsize": 8, "figure.dpi": 150})
if SN: plt.rcParams.update({"font.family": "sans-serif", "font.sans-serif": ["Arial", "Helvetica"], "font.size": 8.5, "axes.titlesize": 8.5, "axes.labelsize": 8.5, "xtick.labelsize": 8, "ytick.labelsize": 8, "legend.fontsize": 8, "pdf.fonttype": 42})
W = 5.15 if SN else 7.0
COL = {"muse": "#8a3b12", "deepseek": "#1f4e79", "sol": "#2e6b3a"}; NAME = {"muse": "Muse Spark 1.3", "deepseek": "DeepSeek V4 Flash", "sol": "GPT-6.1 Sol"}
if SN:  # the journal version adds the third model (frozen-checker table, as for the other two; Suite B summary)
    SF = json.load(open(os.path.join(ROOT, "analysis", "suite-a-results-sol.frozen.json"))); SBS = json.load(open(os.path.join(ROOT, "analysis", "suiteb-sol.rescored-summary.json")))
    A["models"] = list(A["models"]) + ["sol"]; A["table"]["sol"] = SF["table"]["sol"]
    B["models"] = list(B["models"]) + ["sol"]; B["aggregate"]["sol"] = SBS["aggregate"]["sol"]
MK = {"muse": "o", "deepseek": "^", "sol": "P"} if SN else {"muse": "o", "deepseek": "o"}; LS = {"muse": "-", "deepseek": "--", "sol": ":"} if SN else {"muse": "-", "deepseek": "-"}; HT = {"muse": None, "deepseek": "////", "sol": "...."} if SN else {"muse": None, "deepseek": None}
def head(ax, letter, title, ylabel=None):
    if SN:
        ax.text(-0.16, 1.04, letter, transform=ax.transAxes, fontweight="bold", fontsize=9, va="bottom")
        if ylabel is not None: ax.set_ylabel(ylabel)
    else:
        ax.set_title(title)
        if ylabel is not None: ax.set_ylabel(ylabel)
NAMES = {"fig-suite-a-rates.pdf": "Fig2.pdf", "fig-suite-a-cost.pdf": "Fig3.pdf", "fig-suite-b.pdf": "Fig4.pdf"}
def save(fig, name): fig.tight_layout(); fig.savefig(os.path.join(OUT, NAMES[name] if SN else name)); plt.close(fig)
def wilson(k, n, z=1.96):
    if n == 0: return (0, 0, 0)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (p, max(0, c - h), min(1, c + h))
# Figure 1: Suite A items with a deviating draw and items with a flagging draw by rung, with control markers
rungs = ["V0", "V1", "V2", "V3", "V4"]; ctrl = [("LM2", "V2", "s", "length-matched filler"), ("HM2", "V2", "D", "hierarchy-matched, non-conflicting"), ("LM4", "V4", "s", None), ("HM4", "V4", "D", None)]
fig, axes = plt.subplots(1, 2, figsize=(W, 3.1 if SN else 2.7))
for ax, metric, title in [(axes[0], "anyDev", "Items with a deviating draw"), (axes[1], "anyFlag", "Items with a flagging draw")]:
    for i, m in enumerate(A["models"]):
        dx = (i - (len(A["models"]) - 1) / 2) * (0.24 if len(A["models"]) == 2 else 0.14)
        xs = [j + dx for j in range(len(rungs))]; ps = [wilson(A["table"][m][c][metric], A["table"][m][c]["items"]) for c in rungs]
        ax.errorbar(xs, [p[0] for p in ps], yerr=[[p[0] - p[1] for p in ps], [p[2] - p[0] for p in ps]], fmt=MK[m], ls=LS[m], color=COL[m], ms=4, lw=1.4, capsize=2, label=NAME[m])
        for c, ref, mk, lab in ctrl:
            w = wilson(A["table"][m][c][metric], A["table"][m][c]["items"]); x = rungs.index(ref) + dx + (0.3 if mk == "s" else 0.42)
            ax.errorbar([x], [w[0]], yerr=[[w[0] - w[1]], [w[2] - w[0]]], fmt=mk, color=COL[m], ms=4.5, mfc="white", lw=1, capsize=1.5, label=(lab if (i == 0 and lab) else None))
    ax.set_xticks(range(len(rungs))); ax.set_xticklabels(rungs); ax.set_ylim(0, 0.55 if metric == "anyFlag" else 0.12); head(ax, "ab"[metric == "anyFlag"], title, ("items departing" if metric == "anyDev" else "items flagging") + " (share of 200)" if SN else "share of 200 items"); ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0)); ax.grid(axis="y", lw=0.3, alpha=0.5)
if SN:
    h, l = axes[0].get_legend_handles_labels(); fig.legend(h, l, loc="lower center", ncol=2, frameon=False, fontsize=8); fig.tight_layout(rect=(0, 0.16, 1, 1)); fig.savefig(os.path.join(OUT, "Fig2.pdf")); plt.close(fig)
else:
    axes[0].legend(loc="upper left", frameon=False); save(fig, "fig-suite-a-rates.pdf")
# Figure 2: reasoning tokens and latency per run by cell
cells = ["V0", "LM2", "HM2", "V2", "LM4", "HM4", "V4", "LML", "V4L"]
fig, axes = plt.subplots(2, 1, figsize=(W, 4.2)) if SN else plt.subplots(1, 2, figsize=(7.0, 2.5))
for ax, metric, title, scale in [(axes[0], "reasoning", "Reasoning tokens per run", 1), (axes[1], "latency", "Mean latency per run (s)", 1 / 1000)]:
    for i, m in enumerate(A["models"]):
        nm = len(A["models"]); bw = 0.8 / nm; ax.bar([j + (i - (nm - 1) / 2) * bw for j in range(len(cells))], [A["table"][m][c][metric] * scale for c in cells], width=bw * 0.95, color=COL[m], hatch=HT[m], edgecolor="white" if HT[m] else None, lw=0, label=NAME[m])
    ax.set_xticks(range(len(cells))); ax.set_xticklabels(cells, rotation=0); head(ax, "ab"[metric == "latency"], title, ("reasoning tokens per run" if metric == "reasoning" else "mean latency per run (s)") if SN else None); ax.grid(axis="y", lw=0.3, alpha=0.5)
axes[0].legend(frameon=False, loc="upper left")
save(fig, "fig-suite-a-cost.pdf")
# Figure 3: Suite B planted-worker outcomes by condition (flags split by conflict-naming; departures)
conds = B["conditions"]
fig, axes = plt.subplots(1, len(B["models"]), figsize=(W, 2.7 if SN else 2.6), sharey=True)
for ax, m in zip(axes, B["models"]):
    agg = B["aggregate"][m]; n = [agg[c]["planted"] for c in conds]
    conf = [agg[c].get("conflictFlags", 0) / max(1, agg[c]["planted"]) for c in conds]; coord = [(agg[c]["verdicts"]["FLAGGED"] - agg[c].get("conflictFlags", 0)) / max(1, agg[c]["planted"]) for c in conds]; dev = [agg[c]["verdicts"]["DEVIATED"] / max(1, agg[c]["planted"]) for c in conds]
    xs = range(len(conds)); ax.bar(xs, conf, width=0.6, color=COL[m], label="flag naming the withheld scope"); ax.bar(xs, coord, width=0.6, bottom=conf, color=COL[m], alpha=0.4, hatch="...." if SN else None, edgecolor=COL[m] if SN else None, lw=0, label="flag about coordination"); ax.plot(xs, dev, "k_", ms=14, mew=2, label="departures")
    for j, c in enumerate(conds):
        w = wilson(agg[c]["verdicts"]["FLAGGED"], agg[c]["planted"]); ax.plot([j, j], [w[1], w[2]], color="black", lw=0.8)
    ax.set_xticks(list(xs)); ax.set_xticklabels(conds); head(ax, "abc"[B["models"].index(m)], NAME[m], ("planted-worker runs, share of 60" if m == B["models"][0] else None) if SN else None); ax.yaxis.set_major_formatter(matplotlib.ticker.PercentFormatter(1.0, decimals=0)); ax.set_ylim(0, 0.8 if SN else 0.65); ax.grid(axis="y", lw=0.3, alpha=0.5)
    if SN: ax.tick_params(axis="x", labelsize=7, rotation=45)
axes[0].legend(frameon=False, loc="upper left", fontsize=7 if SN else 8)
save(fig, "fig-suite-b.pdf")
print("FIGURES_OK")
