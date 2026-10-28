#!/usr/bin/env python3
"""Suite A re-analysis for the journal major revision (work package WP1 in tasks/todo.md).

Inputs, read only: runs/suite-a.jsonl and runs/suite-a.rescored.jsonl (DeepSeek and Muse under the frozen checker
9179f04a and the revised checker), runs/suite-a-sol.frozen.jsonl and runs/suite-a-sol.rescored.jsonl (GPT-6.1 Sol), the
provider-default-temperature arm (runs/suite-a-temp.jsonl, runs/suite-a-temp.rescored.jsonl,
runs/suite-a-sol-temp.frozen.jsonl, runs/suite-a-sol-temp.rescored.jsonl), the items (probes/items-suite-a/*.json), the
registered variational-Bayes GLMM output (analysis/suite-a-glmm.json) and, for validation only, analysis/suite-a-results*.json
and paper/gen/numbers.json. No model or API is called.

Outputs: analysis/revision-suite-a.json, analysis/revision-suite-a-cells.csv, analysis/revision-suite-a-report.md.
Deterministic: every random step uses seed 20261023 (meta.seeds); the JSON carries no timestamps or timings.

Run (paths resolve from this file, so the working directory does not matter):
  /Users/lohan/Downloads/GitHub/visibility-statsenv/bin/python analysis/revision-suite-a.py
  add --skip-glmm to reuse the glmm block of an existing analysis/revision-suite-a.json (everything else is recomputed)
"""
import argparse
import csv
import hashlib
import itertools
import json
import logging
import math
import os
import platform
import re
import time
import warnings
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

import numpy as np
from scipy import optimize, stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_JSON = os.path.join(ROOT, "analysis", "revision-suite-a.json")
OUT_CSV = os.path.join(ROOT, "analysis", "revision-suite-a-cells.csv")
OUT_MD = os.path.join(ROOT, "analysis", "revision-suite-a-report.md")
PYTHON = "/Users/lohan/Downloads/GitHub/visibility-statsenv/bin/python"
SEED = 20261023
N_PERM = 100_000
N_BOOT = 10_000
MCMC = {"chains": 4, "tune": 2000, "draws": 2000, "target_accept": 0.95}
PRIOR_FE_SD = 2.0        # glmm.py fe_p: N(0, 2^2) on every fixed effect, intercept included
PRIOR_LOGSD_SD = 0.5     # glmm.py vcp_p: N(0, 0.5^2) on the log of every random-effect standard deviation
PRIOR_LOGSD_SD_WIDE = 1.5  # prior-sensitivity refit of the dose model only (not registered)
Z95 = 1.959963984540054  # normal 0.975 quantile (Tango, GEE); Wilson uses 1.96 as analysis/stats.ts does
SUITE_B_RUNS = 240       # planted Suite B worker runs per model outside V0 (macros sbDeepPooledN, sbMusePooledN, sbSolPooledN)
SUITE_B_TASKS = 30

MODELS = ("deepseek", "muse", "sol")
PRESPEC = ("deepseek", "muse")  # the two pre-registered models; Sol was added on 2026-10-05
CHECKERS = ("frozen", "revised")
CONDS = ("V0", "V1", "V2", "V3", "V4", "LM2", "LM4", "HM2", "HM4", "V2N", "V2P", "V4L", "LML")
RUNGS = ("V0", "V1", "V2", "V3", "V4")
DOSE = {c: i for i, c in enumerate(RUNGS)}
SCORES = (0, 1, 2, 3, 4)
TEMP_CELLS = ("V0", "V4", "LM4")
VALID = frozenset({"ADHERED", "FLAGGED", "DEVIATED"})
FROZEN_HASH = "9179f04a49c2cba4"
MAIN_FILES = {("deepseek", "frozen"): "runs/suite-a.jsonl", ("muse", "frozen"): "runs/suite-a.jsonl",
              ("deepseek", "revised"): "runs/suite-a.rescored.jsonl", ("muse", "revised"): "runs/suite-a.rescored.jsonl",
              ("sol", "frozen"): "runs/suite-a-sol.frozen.jsonl", ("sol", "revised"): "runs/suite-a-sol.rescored.jsonl"}
TEMP_FILES = {("deepseek", "frozen"): "runs/suite-a-temp.jsonl", ("muse", "frozen"): "runs/suite-a-temp.jsonl",
              ("deepseek", "revised"): "runs/suite-a-temp.rescored.jsonl", ("muse", "revised"): "runs/suite-a-temp.rescored.jsonl",
              ("sol", "frozen"): "runs/suite-a-sol-temp.frozen.jsonl", ("sol", "revised"): "runs/suite-a-sol-temp.rescored.jsonl"}
RESULT_FILES = {("main", "frozen"): "analysis/suite-a-results.json", ("main", "revised"): "analysis/suite-a-results.rescored.json",
                ("sol", "frozen"): "analysis/suite-a-results-sol.frozen.json", ("sol", "revised"): "analysis/suite-a-results-sol.rescored.json"}
VB_FILE = "analysis/suite-a-glmm.json"
NUMBERS_FILE = "paper/gen/numbers.json"
SECONDARY_REGISTERED = (("V0", "V1"), ("V1", "V2"), ("V2", "V3"), ("V3", "V4"), ("LM2", "V2"), ("LM4", "V4"), ("HM4", "V4"),
                        ("LM4", "HM4"), ("V2N", "V2"), ("V2P", "V2"))
SECONDARY_ADDED = (("LML", "V4L"), ("V4", "V4L"))
ESCALATION = (("V0", "V4"), ("HM4", "V4"), ("LM4", "V4"), ("HM2", "V2"), ("LM2", "V2"))
VALID_ONLY = (("V0", "V4"), ("HM4", "V4"), ("LM4", "V4"), ("HM2", "V2"))
TS_TEMPLATES = {("read_file", ("run_tests",)): "TS0-exports-list", ("grep", ("run_tests", "deploy", "notify_slack")): "TS1-usage-count",
                ("list_dir", ("delete_file", "run_command")): "TS2-size-survey", ("search_docs", ("run_command", "write_file")): "TS3-rationale-note",
                ("read_file", ("open_pr", "run_command")): "TS4-variable-inventory", ("read_file", ("write_file", "run_tests")): "TS5-null-assessment",
                ("grep", ("send_email", "write_file")): "TS6-doc-inventory", ("read_file", ("git_commit", "write_file")): "TS7-module-summary"}
DE_FAMILIES, SU_FAMILIES = 18, 4  # len(DE_FAMILIES), len(SU_FAMILIES) in probes/author-suite-a.ts (pick(arr, i) = arr[i % len])
DEFECTIVE_ITEM = "ACE-16"
MT = {"deepseek": "Deep", "muse": "Muse", "sol": "Sol"}  # macro prefixes in paper/build-numbers.ts
CT = {"V0": "Vz", "V1": "Vone", "V2": "Vtwo", "V3": "Vthree", "V4": "Vfour", "LM2": "LMtwo", "LM4": "LMfour", "HM2": "HMtwo",
      "HM4": "HMfour", "V2N": "VtwoN", "V2P": "VtwoP", "V4L": "VfourL", "LML": "LML"}
NON_ESTIMABLE = []  # filled while computing: every non-estimable or fragile result, with the reason


def note_issue(kind, where, reason):
    NON_ESTIMABLE.append({"kind": kind, "where": where, "reason": reason})


# ------------------------------------------------------------------ serialization and formatting

def sig(x, d=6):
    return x if x == 0 else float(f"{x:.{d}g}")


def clean(o):
    """JSON-ready copy: floats to 6 significant digits, Infinity as "inf", NaN as null, numpy scalars to Python."""
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        x = float(o)
        if math.isnan(x):
            return None
        if math.isinf(x):
            return "inf" if x > 0 else "-inf"
        return sig(x)
    return o


def js_round(x):
    return math.floor(x + 0.5)  # Math.round


def js_fixed(x, d):
    """Number.prototype.toFixed: exact decimal value of the double, ties to the larger magnitude."""
    if x == 0:
        x = 0.0
    return format(Decimal(x).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP), "f")


def js_int(x):
    return f"{js_round(x):,}"  # Math.round(x).toLocaleString("en-US")


def js_pct(x, d=1):
    return js_fixed(100 * x, d) + "\\%"


def js_p(x):  # mirrors p() in paper/macro-format.ts
    return "p$<$0.001" if x < 0.001 else "p=" + js_fixed(x, 3)


def mean(xs):
    xs = list(xs)
    return sum(xs) / len(xs) if xs else float("nan")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ------------------------------------------------------------------ exact tests and intervals

def binom_two_sided(k, n):
    """Exact two-sided binomial test at 0.5 (exact McNemar on the discordant pairs): the sum of P(i) over every i with
    P(i) <= P(k), the rule of analysis/stats.ts binomTwoSided, in exact integer arithmetic."""
    if n == 0:
        return 1.0
    ck = math.comb(n, k)
    return min(1.0, sum(math.comb(n, i) for i in range(n + 1) if math.comb(n, i) <= ck) / 2 ** n)


LNF = [0.0, 0.0]
for _i in range(2, 1001):
    LNF.append(LNF[-1] + math.log(_i))  # running sums of logs, the same order of additions as stats.ts lnFact


def binom_two_sided_statsts(k, n):
    """Port of analysis/stats.ts binomTwoSided (log-factorial sums, absolute tolerance 1e-12)."""
    if n == 0:
        return 1.0
    pk = [math.exp(LNF[n] - LNF[i] - LNF[n - i] - n * math.log(2)) for i in range(n + 1)]
    return min(1.0, sum(p for p in pk if p <= pk[k] + 1e-12))


def fisher_two_sided_statsts(a, b, c, d):
    """Port of analysis/stats.ts fisherTwoSided on [[a,b],[c,d]]."""
    lnc = lambda n, k: LNF[n] - LNF[k] - LNF[n - k]
    r1, r2, c1 = a + b, c + d, a + c
    n = r1 + r2
    lnp = lambda x: lnc(r1, x) + lnc(r2, c1 - x) - lnc(n, c1)
    pobs = math.exp(lnp(a))
    return min(1.0, sum(math.exp(lnp(x)) for x in range(max(0, c1 - r2), min(r1, c1) + 1) if math.exp(lnp(x)) <= pobs * (1 + 1e-9)))


def wilson(k, n, z=1.96):
    """Wilson score interval as analysis/stats.ts wilson (z = 1.96; n = 0 gives 0, 0, 0)."""
    if not n:
        return 0.0, 0.0, 0.0
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, c - h), min(1.0, c + h)


def clopper_pearson(k, n, alpha=0.05):
    lo = 0.0 if k == 0 else float(stats.beta.ppf(alpha / 2, k, n - k + 1))
    hi = 1.0 if k == n else float(stats.beta.ppf(1 - alpha / 2, k + 1, n - k))
    return lo, hi


def tango_ci(b, c, n, z=Z95):
    """Tango (1998) asymptotic score interval for the paired difference pB - pA. b = pairs A+ B-, c = pairs A- B+, n = pairs.
    Score statistic for Delta = pA - pB: Z = (b - c - n Delta) / sqrt(n (2 q + Delta (1 - Delta))), q the constrained MLE of
    P(A- B+), q = (-W + sqrt(W^2 + 8 n c Delta (1 - Delta))) / (4 n), W = -(b + c) + Delta (2 n - b + c)."""
    if n == 0:
        return None

    def score(D):
        W = -(b + c) + D * (2 * n - b + c)
        q = (-W + math.sqrt(max(0.0, W * W + 8 * n * c * D * (1 - D)))) / (4 * n)
        v = n * (2 * q + D * (1 - D))
        num = b - c - n * D
        if v <= 0:
            return 0.0 if num == 0 else math.copysign(1e12, num)
        return num / math.sqrt(v)

    dhat, eps = (b - c) / n, 1e-12
    try:
        up = optimize.brentq(lambda D: score(D) + z, dhat, 1 - eps, xtol=1e-14)
    except ValueError:
        up = 1.0
    try:
        lo = optimize.brentq(lambda D: score(D) - z, -1 + eps, dhat, xtol=1e-14)
    except ValueError:
        lo = -1.0
    return [-up, -lo]


def cond_or(b, c):
    """Conditional (matched-pairs) odds ratio of B versus A, c / b, with the exact conditional interval from the
    Clopper-Pearson interval for c / (b + c). Undefined without discordant pairs."""
    if b + c == 0:
        return None, None
    lo, hi = clopper_pearson(c, b + c)
    tr = lambda p: p / (1 - p) if p < 1 else float("inf")
    return (c / b if b else float("inf")), [tr(lo), tr(hi)]


def holm(ps):
    """Holm step-down adjusted p-values in the original order (analysis/stats.ts holm; stable order for ties)."""
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj, run, m = [0.0] * len(ps), 0.0, len(ps)
    for r, i in enumerate(order):
        run = max(run, min(1.0, (m - r) * ps[i]))
        adj[i] = run
    return adj


def norm_cdf_statsts(x):
    """analysis/stats.ts normCdf (Zelen and Severo polynomial approximation)."""
    t = 1 / (1 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
    return 1 - p if x > 0 else p


def cochran_armitage_statsts(groups):
    """analysis/stats.ts cochranArmitage on [(k, n, score)]: independent-groups variance, normCdf approximation."""
    N = sum(g[1] for g in groups)
    K = sum(g[0] for g in groups)
    if not N or not K or K == N:
        return 0.0, 1.0, 1.0
    pbar = K / N
    sbar = sum(g[1] * g[2] for g in groups) / N
    T = sum(g[2] * (g[0] - g[1] * pbar) for g in groups)
    V = pbar * (1 - pbar) * sum(g[1] * (g[2] - sbar) ** 2 for g in groups)
    z = T / math.sqrt(V) if V > 0 else 0.0
    return z, 2 * (1 - norm_cdf_statsts(abs(z))), float(2 * stats.norm.sf(abs(z)))


def icc1(groups):
    """analysis/stats.ts icc1: one-way ANOVA intraclass correlation of a binary indicator, groups of equal size."""
    k = len(groups)
    if k < 2:
        return None
    m = len(groups[0])
    N = k * m
    gm = sum(sum(g) for g in groups) / N
    if gm == 0 or gm == 1:
        return None
    means = [sum(g) / len(g) for g in groups]
    msb = sum(len(g) * (means[i] - gm) ** 2 for i, g in enumerate(groups)) / (k - 1)
    msw = sum(sum((y - means[i]) ** 2 for y in g) for i, g in enumerate(groups)) / (N - k)
    return (msb - msw) / (msb + (m - 1) * msw)


SUBSET_SUMS = {k: Counter(sum(s) for s in itertools.combinations(SCORES, k)) for k in range(6)}
PERMS = np.array(list(itertools.permutations(range(5))))  # the 120 relabelings of the five rungs


def exact_trend(Y):
    """Y: list of 0/1 tuples over V0..V4, one per item. Exact null distribution of T = sum(score x indicator) under
    independent uniform within-item permutation of the rung labels, by convolution with exact integer counts. Given each
    item's total, this is also the conditional distribution of the dose sufficient statistic in a logistic model with item
    strata, so the same distribution yields the exact conditional MLE and exact interval of the per-rung log odds ratio."""
    dist = {0: 1}
    T = K = informative = 0
    for y in Y:
        k = sum(y)
        K += k
        T += sum(s * v for s, v in zip(SCORES, y))
        informative += 0 < k < 5
        new = {}
        for t1, c1 in dist.items():
            for t2, c2 in SUBSET_SUMS[k].items():
                new[t1 + t2] = new.get(t1 + t2, 0) + c1 * c2
        dist = new
    sup = sorted(dist)
    cnt = [dist[t] for t in sup]
    tot = sum(cnt)
    E = 2 * K  # the mean score is 2
    var = Fraction(sum(c * (t - E) ** 2 for t, c in zip(sup, cnt)), tot)
    frac = lambda keep: float(Fraction(sum(c for t, c in zip(sup, cnt) if keep(t)), tot))
    p_up, p_lo = frac(lambda t: t >= T), frac(lambda t: t <= T)
    res = {"T": T, "E0": E, "SD0": math.sqrt(var), "z": (T - E) / math.sqrt(var) if var > 0 else 0.0,
           "pTwoSided": frac(lambda t: abs(t - E) >= abs(T - E)), "pTwoSidedDoubled": min(1.0, 2 * min(p_up, p_lo)),
           "pUpper": p_up, "pLower": p_lo, "informativeItems": informative, "supportMin": sup[0], "supportMax": sup[-1]}
    cond = {"betaCmle": None, "orCmle": None, "ciBeta": None, "ciOr": None, "medianUnbiasedOr": None}
    if informative:
        s = np.array(sup, float)
        lc = np.array([math.log(c) for c in cnt])

        def w(beta):
            x = lc + beta * s
            e = np.exp(x - x.max())
            return e / e.sum()

        mean_t = lambda b_: float((w(b_) * s).sum())
        ge = lambda b_: float(w(b_)[s >= T].sum())
        le = lambda b_: float(w(b_)[s <= T].sum())
        root = lambda f: optimize.brentq(f, -60, 60, xtol=1e-12)
        bhat = math.inf if T >= sup[-1] else (-math.inf if T <= sup[0] else root(lambda b_: mean_t(b_) - T))
        lo = -math.inf if T <= sup[0] else root(lambda b_: ge(b_) - 0.025)
        hi = math.inf if T >= sup[-1] else root(lambda b_: le(b_) - 0.025)
        cond = {"betaCmle": bhat, "orCmle": math.exp(bhat) if math.isfinite(bhat) else (math.inf if bhat > 0 else 0.0),
                "ciBeta": [lo, hi], "ciOr": [math.exp(lo) if math.isfinite(lo) else 0.0, math.exp(hi) if math.isfinite(hi) else math.inf],
                "medianUnbiasedOr": None}
        if not math.isfinite(bhat):  # median-unbiased estimate when the conditional MLE is at the boundary
            f = (lambda b_: ge(b_) - 0.5) if bhat > 0 else (lambda b_: le(b_) - 0.5)
            cond["medianUnbiasedOr"] = math.exp(root(f))
    return res, cond


def mc_permutation(Y, nperm, seed):
    """Monte Carlo check of exact_trend: nperm replicates, each drawing an independent uniform permutation of the five rung
    labels per item (fresh numpy default_rng(seed) per test; replicates drawn in blocks of 10,000)."""
    rng = np.random.default_rng(seed)
    Ya = np.array(Y, dtype=np.int64)
    sc = np.array(SCORES)
    contrib = (Ya[:, PERMS] * sc).sum(2)  # items x 120: T contribution of every relabeling
    T = int((Ya * sc).sum())
    E = 2 * int(Ya.sum())
    ge = le = ab = 0
    rows = np.arange(Ya.shape[0])[None, :]
    for start in range(0, nperm, 10_000):
        m = min(10_000, nperm - start)
        tm = contrib[rows, rng.integers(0, 120, size=(m, Ya.shape[0]))].sum(1)
        ge += int((tm >= T).sum())
        le += int((tm <= T).sum())
        ab += int((np.abs(tm - E) >= abs(T - E)).sum())
    f = lambda k: (1 + k) / (nperm + 1)
    return {"n": nperm, "seed": seed, "pTwoSided": f(ab), "pTwoSidedDoubled": min(1.0, 2 * min(f(ge), f(le))), "pUpper": f(ge),
            "countAbsAtLeastObserved": ab, "rule": "(1 + count) / (n + 1)"}


# ------------------------------------------------------------------ data

KEEP = ("key", "model", "condition", "item", "draw", "ok", "pinned", "verdict", "verdictDetail", "flaggedConflict", "disclosure",
        "checkerHash", "rescoredFrom", "temperature", "inputTokens", "outputTokens", "reasoningTokens", "latencyMs")


def set_verdict_flags(x, v, fc):
    """The per-record indicators the builders read, from a verdict and its conflict-naming flag (also used by
    analysis/revision-suite-a-adjudicated.py on the adjudicated verdicts)."""
    x["dev"], x["flag"], x["fc"] = v == "DEVIATED", v == "FLAGGED", fc
    x["conf"], x["recog"] = x["flag"] and fc, (x["flag"] or x["dev"]) and fc
    x["valid"], x["refused"] = v in VALID, v == "REFUSED"


def load_jsonl(rel):
    """Records keyed by `key`, the last record of a key winning in the position of its first appearance (the Map semantics
    of analysis/suite-a-analysis.ts load). Raw outputs are not kept."""
    path = os.path.join(ROOT, rel)
    recs, lines, dups, h = {}, 0, 0, hashlib.sha256()
    with open(path, "rb") as fh:
        for raw in fh:
            h.update(raw)
            if not raw.strip():
                continue
            lines += 1
            r = json.loads(raw)
            dups += r["key"] in recs
            x = {k: r.get(k) for k in KEEP}
            x["nConcerns"] = len(r.get("concerns") or [])
            x["usable"] = bool(x["ok"]) and bool(x["pinned"])
            set_verdict_flags(x, x["verdict"], bool(x["flaggedConflict"]))
            recs[r["key"]] = x
    rows = list(recs.values())
    info = {"path": rel, "sha256": h.hexdigest(), "lines": lines, "uniqueKeys": len(rows), "duplicateKeys": dups,
            "models": sorted({r["model"] for r in rows}), "usable": sum(r["usable"] for r in rows),
            "callFailed": sum(r["verdict"] == "CALL_FAILED" for r in rows), "unpinned": sum(bool(r["ok"]) and not r["pinned"] for r in rows),
            "checkerHashesUsable": dict(sorted(Counter(r["checkerHash"] for r in rows if r["usable"]).items())),
            "rescoredFrom": dict(sorted(Counter(str(r["rescoredFrom"]) for r in rows).items())),
            "temperature": dict(sorted(Counter(str(r["temperature"]) for r in rows).items()))}
    return rows, info


class Arm:
    """One model under one checker: all records, usable records, and usable runs per cell and item in record order."""

    def __init__(self, model, checker, rows):
        self.model, self.checker = model, checker
        self.all = [r for r in rows if r["model"] == model]
        self.usable = [r for r in self.all if r["usable"]]
        self.cell = {c: {} for c in CONDS}
        for r in self.usable:
            self.cell[r["condition"]].setdefault(r["item"], []).append(r)
        self.recs = {c: [r for r in self.all if r["condition"] == c] for c in CONDS}


def load_items():
    items, d = {}, os.path.join(ROOT, "probes", "items-suite-a")
    for f in sorted(os.listdir(d)):
        if f.endswith(".json"):
            with open(os.path.join(d, f)) as fh:
                for it in json.load(fh):
                    items[it["id"]] = it
    return items


def template_of(it):
    """Stimulus template (scenario family) reconstructed from probes/author-suite-a.ts: data extraction and summarization
    use pick(FAMILIES, i), so family = (n - 1) mod 18 and (n - 1) mod 4; tool selection is identified by its allowed and
    objective tools and must equal (n - 1) mod 8; code edits are the rename family or one of two range-edit families
    (null-input guard, trace); file operations share one declaration-cleanup family. 34 templates."""
    n, d = int(it["id"].split("-")[1]) - 1, it["domain"]
    if d == "data-extraction":
        return f"DE{n % DE_FAMILIES:02d}"
    if d == "summarization":
        return f"SU{n % SU_FAMILIES}"
    if d == "tool-selection":
        t = TS_TEMPLATES[(it["check"]["allowed_tools"][0], tuple(it["check"]["objective_tools"]))]
        assert int(t[2]) == n % 8, it["id"]
        return t
    if d == "code-edit":
        if it["check"]["mode"] == "rename":
            return "CE-rename"
        return "CE-range-nullguard" if it["check"]["objective_markers"] == ["// null-input guard"] else "CE-range-trace"
    return "FO-declaration-cleanup"


def check_templates(items, tmpl):
    """Each data-extraction and summarization template must carry exactly one parent brief, distinct across templates."""
    out = {"templates": len(set(tmpl.values()))}
    for dom, prefix in (("data-extraction", "DE"), ("summarization", "SU")):
        briefs = {}
        for i, it in items.items():
            if it["domain"] == dom:
                briefs.setdefault(tmpl[i], set()).add(it["parent_task"])
        ok = all(len(v) == 1 for v in briefs.values()) and len({next(iter(v)) for v in briefs.values()}) == len(briefs)
        out[f"{prefix}OneBriefPerTemplate"] = ok
        assert ok, prefix
    assert out["templates"] == 34, out
    return out


# ------------------------------------------------------------------ item-level indicators and contrasts

IND = {
    "dev": lambda rs: any(r["dev"] for r in rs),
    "allDev": lambda rs: all(r["dev"] for r in rs),
    "majDev": lambda rs: sum(r["dev"] for r in rs) >= 2,
    "flag": lambda rs: any(r["flag"] for r in rs),
    "conf": lambda rs: any(r["conf"] for r in rs),
    "recog": lambda rs: any(r["recog"] for r in rs),
    "refused": lambda rs: any(r["refused"] for r in rs),
    "allFailed": lambda rs: not any(r["valid"] for r in rs),
    "anyValid": lambda rs: any(r["valid"] for r in rs),
}


def indicators(arm, cond, measure, valid_only=False, keep=None):
    """item -> 0/1 for every item with at least one usable run in the cell (valid_only: at least one valid run, and the
    indicator computed over valid runs only); keep restricts the item set."""
    out = {}
    for item, rs in arm.cell[cond].items():
        if keep is not None and item not in keep:
            continue
        if valid_only:
            rs = [r for r in rs if r["valid"]]
        if rs:
            out[item] = int(IND[measure](rs))
    return out


def contrast(arm, family, measure, a, b, keep=None, valid_only=False):
    ia = indicators(arm, a, measure, valid_only, keep)
    ib = indicators(arm, b, measure, valid_only, keep)
    both = sorted(set(ia) & set(ib))
    n = len(both)
    ka, kb = sum(ia[i] for i in both), sum(ib[i] for i in both)
    da = sum(1 for i in both if ia[i] and not ib[i])
    db = sum(1 for i in both if ib[i] and not ia[i])
    wa, wb = wilson(ka, n), wilson(kb, n)
    orr, orci = cond_or(da, db)
    out = {"family": family, "measure": measure, "a": a, "b": b, "nPaired": n, "countA": ka, "countB": kb,
           "discordantAonly": da, "discordantBonly": db, "pExact": binom_two_sided(min(da, db), da + db),
           "wilsonA": [wa[1], wa[2]], "wilsonB": [wb[1], wb[2]], "diff": (kb - ka) / n if n else None,
           "diffCI": tango_ci(da, db, n), "condOR": orr, "condORCI": orci, "pHolm": None}
    if valid_only:
        for side, cond in (("A", a), ("B", b)):
            rs = [r for i in both for r in arm.cell[cond][i] if r["valid"]]
            k = sum(r[measure] for r in rs)
            w = wilson(k, len(rs))
            out[f"runRate{side}"] = {"k": k, "n": len(rs), "rate": w[0], "wilson": [w[1], w[2]]}
        present = set(arm.cell[a]) & set(arm.cell[b])
        if keep is not None:
            present &= set(keep)
        out["itemsExcluded"] = len(present) - n
    return out


def build_contrasts(arms, checkers=CHECKERS):
    C = {m: {ck: [] for ck in checkers} for m in MODELS}
    for ck in checkers:
        prim = {m: contrast(arms[(m, ck)], "primary", "dev", "V0", "V4") for m in MODELS}
        for m, adj in zip(PRESPEC, holm([prim[m]["pExact"] for m in PRESPEC])):
            prim[m]["pHolm"] = adj
        prim["sol"]["note"] = "added after registration: unadjusted"
        for m in MODELS:
            arm = arms[(m, ck)]
            out = C[m][ck]
            out.append(prim[m])
            reg = [contrast(arm, "secondaryRegistered", "dev", a, b) for a, b in SECONDARY_REGISTERED]
            add = [contrast(arm, "secondaryAdded", "dev", a, b) for a, b in SECONDARY_ADDED]
            for q, adj in zip(reg, holm([q["pExact"] for q in reg])):
                q["pHolm"] = adj
            for q, adj in zip(reg + add, holm([q["pExact"] for q in reg + add])):
                q["holm12"] = adj
            if m == "sol":
                for q in reg:
                    q["note"] = "Sol was added after registration: Holm within Sol's own family of 10, descriptive"
            out += reg + add
            for meas in ("conf", "recog", "flag"):
                esc = [contrast(arm, "escalation", meas, a, b) for a, b in ESCALATION]
                for q, adj in zip(esc, holm([q["pExact"] for q in esc])):
                    q["pHolm"] = adj
                out += esc
            for meas in ("dev", "conf"):
                out += [contrast(arm, "validOnly", meas, a, b, valid_only=True) for a, b in VALID_ONLY]
    return C


def find(C, m, ck, family, measure, a, b):
    return next(q for q in C[m][ck] if q["family"] == family and q["measure"] == measure and q["a"] == a and q["b"] == b)


# ------------------------------------------------------------------ cells

def cell_stats(arm, cond):
    allr, us = arm.recs[cond], [r for r in arm.recs[cond] if r["usable"]]
    V = Counter(r["verdict"] for r in us)
    ff = [r for r in us if r["verdict"] == "FAILED_FORMAT"]
    unparse = sum(1 for r in ff if (r["verdictDetail"] or "").startswith("no JSON"))
    words = sum(1 for r in ff if re.search(r"\d+ words, limit \d+", r["verdictDetail"] or ""))
    dev = [r for r in us if r["dev"]]
    groups = arm.cell[cond]
    items = {name: sum(int(IND[name](rs)) for rs in groups.values()) for name in IND}
    items = {"present": len(groups), "threeUsable": sum(len(rs) == 3 for rs in groups.values()), **items}
    full = [[int(r["dev"]) for r in rs] for rs in groups.values() if len(rs) == 3]
    valid = [r for r in us if r["valid"]]
    vr = {}
    for ev in ("dev", "conf"):
        k = sum(r[ev] for r in valid)
        w = wilson(k, len(valid))
        vr[ev] = {"k": k, "n": len(valid), "rate": w[0], "wilson": [w[1], w[2]]}
    reas = [r["reasoningTokens"] or 0 for r in us]
    out = {
        "records": len(allr), "usable": len(us), "callFailed": sum(r["verdict"] == "CALL_FAILED" for r in allr),
        "unpinned": sum(bool(r["ok"]) and not r["pinned"] for r in allr),
        "runs": {"adhered": V["ADHERED"], "flagged": V["FLAGGED"], "flaggedConflict": sum(r["conf"] for r in us),
                 "deviated": V["DEVIATED"], "deviatedAnnounced": sum(r["nConcerns"] > 0 for r in dev),
                 "deviatedSilent": sum(r["nConcerns"] == 0 for r in dev), "deviatedNamed": sum(r["fc"] for r in dev),
                 "refused": V["REFUSED"], "failedUnparseable": unparse, "failedWordLimit": words,
                 "failedFormatOther": len(ff) - unparse - words, "failedBudget": V["FAILED_BUDGET"],
                 "failedIncoherent": V["FAILED_INCOHERENT"], "valid": len(valid), "failed": len(us) - len(valid)},
        "disclosure": None,
        "items": items,
        "validRunRates": vr,
        "tokens": {"inputTokens": mean(r["inputTokens"] for r in us), "outputTokens": mean(r["outputTokens"] for r in us),
                   "reasoningTokens": mean(reas), "visibleOutputTokens": mean(r["outputTokens"] - (r["reasoningTokens"] or 0) for r in us),
                   "latencySeconds": mean(r["latencyMs"] / 1000 for r in us), "reasoningZeroShare": mean(x == 0 for x in reas)},
        "iccDev": icc1(full) if len(full) >= 2 else None,
        "devItems": sorted(i for i, rs in groups.items() if IND["dev"](rs)),
        "verdicts": dict(sorted(V.items())),
        "_reasoningMeanRounded": js_round(mean(reas)), "_latencyMeanMsRounded": js_round(mean(r["latencyMs"] for r in us)),
    }
    if arm.checker == "revised":
        D = Counter(r["disclosure"] for r in dev)
        out["disclosure"] = {"acknowledged": D["acknowledged"], "prose": D["prose"], "silent": D["silent"], "missing": D[None]}
    return out


def build_cells(arms):
    return {m: {ck: {c: cell_stats(arms[(m, ck)], c) for c in CONDS} for ck in CHECKERS} for m in MODELS}


def public_cells(cells):
    return {m: {ck: {c: {k: v for k, v in x.items() if not k.startswith("_")} for c, x in v2.items()} for ck, v2 in v1.items()}
            for m, v1 in cells.items()}


def write_cells_csv(cells):
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            for c in CONDS:
                x = cells[m][ck][c]
                row = {"model": m, "checker": ck, "cond": c, "records": x["records"], "usable": x["usable"], "callFailed": x["callFailed"]}
                for grp in ("runs", "items", "tokens"):
                    for k, v in x[grp].items():
                        row[f"{grp}_{k}"] = v
                for k in ("acknowledged", "prose", "silent"):
                    row[f"disclosure_{k}"] = "" if x["disclosure"] is None else x["disclosure"][k]
                for ev in ("dev", "conf"):
                    row[f"validRunRate_{ev}"] = x["validRunRates"][ev]["rate"]
                row["iccDev"] = "" if x["iccDev"] is None else x["iccDev"]
                row["devItems"] = " ".join(x["devItems"])
                rows.append({k: (f"{v:.6g}" if isinstance(v, float) else v) for k, v in rows_fix(row).items()})
    with open(OUT_CSV, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


def rows_fix(row):
    return {k: ("" if (isinstance(v, float) and math.isnan(v)) else v) for k, v in row.items()}


# ------------------------------------------------------------------ trend

def item_matrix(arm, measure, keep=None):
    ind = {c: indicators(arm, c, measure, keep=keep) for c in RUNGS}
    items = sorted(set.intersection(*[set(ind[c]) for c in RUNGS]))
    return items, [tuple(ind[c][i] for c in RUNGS) for i in items]


def run_frame(arm, event, tmpl, conds=RUNGS):
    import pandas as pd
    return pd.DataFrame([{"item": r["item"], "template": tmpl[r["item"]], "cond": r["condition"], "dose": DOSE[r["condition"]],
                          "y": int(r[event])} for r in arm.usable if r["condition"] in conds])


def gee_fit(df, formula, group, terms, cov="exchangeable"):
    """GEE logistic regression with a robust sandwich SE (statsmodels); exchangeable working correlation unless cov says
    independence. Raises ValueError when a coefficient is not a finite, non-degenerate estimate."""
    import statsmodels.api as sm
    cs = sm.cov_struct.Exchangeable() if cov == "exchangeable" else sm.cov_struct.Independence()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        mod = sm.GEE.from_formula(formula, groups=group, data=df, family=sm.families.Binomial(), cov_struct=cs)
        res = mod.fit(maxiter=200)
    out = {}
    for t in terms:
        b, se = float(res.params[t]), float(res.bse[t])
        if not (math.isfinite(b) and math.isfinite(se) and abs(b) < 15 and se > 1e-8):
            raise ValueError(f"{t}: estimate {b:.4g}, SE {se:.4g}")
        out[t] = {"beta": b, "se": se, "or": math.exp(b), "ci": [math.exp(b - Z95 * se), math.exp(b + Z95 * se)],
                  "p": float(2 * stats.norm.sf(abs(b / se)))}
    rho = float(np.atleast_1d(mod.cov_struct.dep_params)[0]) if cov == "exchangeable" else 0.0
    msgs = sorted({f"{w.category.__name__}: {str(w.message)[:120]}" for w in caught})
    return out, res, rho, msgs


def gee_dose(df, group, where):
    ev = int(df["y"].sum())
    with_ev = df.groupby(group)["y"].sum()
    k_ev = int((with_ev > 0).sum())
    base = {"level": "run", "cluster": group, "n": int(len(df)), "events": ev, "clusters": int(df[group].nunique()), "clustersWithEvents": k_ev,
            "eventsByRung": [int(df.loc[df["cond"] == c, "y"].sum()) for c in RUNGS]}
    if ev == 0:
        note_issue("nonEstimable", where, "no events: the dose slope is not estimable")
        return {**base, "estimable": False, "reason": "no events"}
    if k_ev < 2:
        only = with_ev[with_ev > 0].index.tolist()
        reason = f"all {ev} event runs are in one {group} cluster ({', '.join(only)}); the robust sandwich variance is degenerate"
        note_issue("nonEstimable", where, reason)
        return {**base, "estimable": False, "reason": reason}
    try:
        out, _, rho, msgs = gee_fit(df, "y ~ dose", group, ["dose"])
        used = "exchangeable"
    except ValueError as e:
        out, _, rho, msgs = gee_fit(df, "y ~ dose", group, ["dose"], cov="independence")
        used = "independence"
        fail = f"the exchangeable fit did not reach a finite estimate ({e}); reported: independence working correlation with the same {group}-clustered robust SE"
        note_issue("fragile", where, fail)
    g = out["dose"]
    res = {**base, "estimable": True, "workingCorrelationStructure": used, "beta": g["beta"], "se": g["se"], "or": g["or"], "ci": g["ci"], "p": g["p"],
           "workingCorrelation": rho, "warnings": msgs}
    if used != "exchangeable":
        res["note"] = fail
    if k_ev < 10:
        res["fragile"] = f"only {k_ev} {group} clusters carry events; the sandwich variance rests on few clusters"
        note_issue("fragile", where, res["fragile"])
    return res


def build_trend(arms, tmpl, nperm, checkers=CHECKERS, measures=("dev", "flag", "conf")):
    out = {}
    for m in MODELS:
        out[m] = {}
        for ck in checkers:
            arm = arms[(m, ck)]
            out[m][ck] = {}
            for meas in measures:
                where = f"trend {m} {ck} {meas}"
                items, Y = item_matrix(arm, meas)
                counts = [sum(y[j] for y in Y) for j in range(5)]
                z, p, pn = cochran_armitage_statsts([(counts[j], len(Y), SCORES[j]) for j in range(5)])
                runc = [sum(r[meas] for rs in arm.cell[c].values() for r in rs) for c in RUNGS]
                runs = [sum(len(rs) for rs in arm.cell[c].values()) for c in RUNGS]
                rec = {"itemsAllRungs": len(Y), "itemCounts": counts, "runCounts": runc, "runsPerRung": runs,
                       "cochranArmitage": {"z": z, "p": p, "pNormalExact": pn, "method": "analysis/stats.ts cochranArmitage on item-level any-draw indicators (independent groups)"}}
                if sum(counts) == 0:
                    note_issue("nonEstimable", where, "no events: permutation, GEE and exact conditional estimates not estimable")
                    rec["permutation"] = {"estimable": False, "reason": "no events"}
                    rec["exactConditional"] = {"estimable": False, "reason": "no events"}
                else:
                    ex, cond = exact_trend(Y)
                    rec["permutation"] = {"statistic": "T = sum over items and rungs of score x item-level indicator", **ex,
                                          "monteCarlo": mc_permutation(Y, nperm, SEED)}
                    rec["exactConditional"] = {"level": "item-level any-draw indicator per rung, item strata", "estimable": True, **cond,
                                               "pTwoSided": ex["pTwoSided"], "informativeItems": ex["informativeItems"]}
                    if not math.isfinite(cond["betaCmle"]):
                        rec["exactConditional"]["note"] = "observed statistic at the boundary of its conditional support: the conditional MLE is infinite; the median-unbiased estimate is given"
                        note_issue("fragile", where + " exact conditional", "conditional MLE infinite (statistic at the support boundary); median-unbiased estimate reported")
                    if ex["informativeItems"] < 5:
                        note_issue("fragile", where, f"only {ex['informativeItems']} informative item(s) in the permutation and exact conditional analyses")
                rec["gee"] = gee_dose(run_frame(arm, meas, tmpl), "item", where + " GEE")
                out[m][ck][meas] = rec
    return out


def build_h2(arms, tmpl, checkers=CHECKERS):
    import pandas as pd
    out = {}
    for ck in checkers:
        df = pd.concat([run_frame(arms[(m, ck)], "dev", tmpl).assign(muse=int(m == "muse")) for m in PRESPEC], ignore_index=True)
        res, fit, rho, msgs = gee_fit(df, "y ~ dose * muse", "item", ["dose", "muse", "dose:muse"])
        cv = fit.cov_params()
        bm = float(fit.params["dose"] + fit.params["dose:muse"])
        sem = math.sqrt(cv.loc["dose", "dose"] + cv.loc["dose:muse", "dose:muse"] + 2 * cv.loc["dose", "dose:muse"])
        it = res["dose:muse"]
        out[ck] = {"model": "GEE logistic, run level, y ~ dose * muse (DeepSeek reference), item clusters shared by the two models, exchangeable, robust SE",
                   "n": int(len(df)), "events": int(df["y"].sum()), "clusters": int(df["item"].nunique()),
                   "interaction": {"estimate": it["beta"], "se": it["se"], "ci": [it["beta"] - Z95 * it["se"], it["beta"] + Z95 * it["se"]],
                                   "p": it["p"], "orRatio": it["or"], "orRatioCI": it["ci"]},
                   "deepseekDoseOR": {"or": res["dose"]["or"], "ci": res["dose"]["ci"], "p": res["dose"]["p"]},
                   "museDoseOR": {"or": math.exp(bm), "ci": [math.exp(bm - Z95 * sem), math.exp(bm + Z95 * sem)], "p": float(2 * stats.norm.sf(abs(bm / sem)))},
                   "workingCorrelation": rho, "warnings": msgs}
    return out


# ------------------------------------------------------------------ GLMM by MCMC

def glmm_cells(arms, checker, outcome, conds):
    agg = {}
    for m in PRESPEC:
        for r in arms[(m, checker)].usable:
            if r["condition"] in conds:
                a = agg.setdefault((r["item"], m, r["condition"]), [0, 0])
                a[0] += int(r[outcome])
                a[1] += 1
    keys = sorted(agg, key=lambda k: (k[0], PRESPEC.index(k[1]), CONDS.index(k[2])))
    return keys, np.array([agg[k][0] for k in keys]), np.array([agg[k][1] for k in keys])


def glmm_design(name, keys):
    """Fixed-effect columns named as statsmodels named them in analysis/suite-a-glmm.json, and the random intercepts."""
    item = [k[0] for k in keys]
    cond = np.array([k[2] for k in keys])
    muse = np.array([k[1] == "muse" for k in keys], float)
    uitem = sorted(set(item))
    uim = sorted({(k[0], k[1]) for k in keys})
    ipos = {v: j for j, v in enumerate(uitem)}
    impos = {v: j for j, v in enumerate(uim)}
    iidx = np.array([ipos[i] for i in item])
    imidx = np.array([impos[(k[0], k[1])] for k in keys])
    cols = {"Intercept": np.ones(len(keys))}
    res = [("item", iidx, len(uitem), None), ("item_model", imidx, len(uim), None)]
    if name in ("dose_numeric", "flag_dose_numeric"):
        dose = np.array([DOSE[c] for c in cond], float)
        cols.update({"dose": dose, "muse": muse, "dose:muse": dose * muse})
        if name == "dose_numeric":
            res.append(("item_dose", iidx, len(uitem), dose))
    elif name == "dose_factor":
        for k in ("V1", "V2", "V3", "V4"):
            cols[f"C(cond, Treatment('V0'))[T.{k}]"] = (cond == k).astype(float)
        cols["muse"] = muse
        for k in ("V1", "V2", "V3", "V4"):
            cols[f"C(cond, Treatment('V0'))[T.{k}]:muse"] = (cond == k).astype(float) * muse
    elif name == "content_by_length":
        content = np.array([{"V": "conflict", "HM": "hierarchy", "LM": "filler"}[re.sub(r"\d", "", c)] for c in cond])
        long = np.array([c.endswith("4") for c in cond], float)
        cc, hh = (content == "conflict").astype(float), (content == "hierarchy").astype(float)
        cols.update({"C(content, Treatment('filler'))[T.conflict]": cc, "C(content, Treatment('filler'))[T.hierarchy]": hh, "long": long,
                     "C(content, Treatment('filler'))[T.conflict]:long": cc * long, "C(content, Treatment('filler'))[T.hierarchy]:long": hh * long,
                     "muse": muse})
    res.append(("item_cell", np.arange(len(keys)), len(keys), None))
    return np.column_stack(list(cols.values())), list(cols), res


GLMM_SPECS = {
    "dose_numeric": ("dev", RUNGS, "dev ~ dose * muse", "item, item x model and item x cell intercepts; item slope for dose"),
    "dose_factor": ("dev", RUNGS, "dev ~ C(cond, Treatment('V0')) * muse", "item, item x model and item x cell intercepts"),
    "content_by_length": ("dev", ("V2", "V4", "LM2", "LM4", "HM2", "HM4"), "dev ~ C(content, Treatment('filler')) * long + muse",
                          "item, item x model and item x cell intercepts"),
    "flag_dose_numeric": ("flag", RUNGS, "flag ~ dose * muse", "item, item x model and item x cell intercepts"),
}
DERIVED = {
    "dose_numeric": {"museDose (dose + dose:muse)": ("dose", "dose:muse")},
    "flag_dose_numeric": {"museDose (dose + dose:muse)": ("dose", "dose:muse")},
    "dose_factor": {f"muse{k} ({k} + {k}:muse)": (f"C(cond, Treatment('V0'))[T.{k}]", f"C(cond, Treatment('V0'))[T.{k}]:muse") for k in ("V1", "V2", "V3", "V4")},
    "content_by_length": {"conflictLong (conflict + conflict:long)": ("C(content, Treatment('filler'))[T.conflict]", "C(content, Treatment('filler'))[T.conflict]:long"),
                          "hierarchyLong (hierarchy + hierarchy:long)": ("C(content, Treatment('filler'))[T.hierarchy]", "C(content, Treatment('filler'))[T.hierarchy]:long")},
}


def post_summary(da, extra=None):
    """Posterior summary of a (chain, draw) DataArray on the log-odds scale, with odds ratios and diagnostics."""
    import arviz as az
    x = np.asarray(da.values, float).reshape(-1)
    lo, med, hi = np.percentile(x, [2.5, 50, 97.5])
    out = {"mean": float(x.mean()), "sd": float(x.std(ddof=1)), "median": float(med), "eti95": [float(lo), float(hi)],
           "or": math.exp(x.mean()), "orMedian": math.exp(med), "orEti95": [math.exp(lo), math.exp(hi)], "pPositive": float((x > 0).mean()),
           "rhat": float(az.rhat(da)), "essBulk": float(az.ess(da, method="bulk")), "essTail": float(az.ess(da, method="tail"))}
    if extra:
        out.update(extra)
    return out


def fit_glmm(arms, name, checker, vb, log_sd_sd, draws, tune, target_accept=None):
    import arviz as az
    import pymc as pm
    import pytensor.tensor as pt
    import xarray as xr
    target_accept = target_accept or MCMC["target_accept"]
    outcome, conds, formula, re_desc = GLMM_SPECS[name]
    keys, K, N = glmm_cells(arms, checker, outcome, conds)
    X, names, res = glmm_design(name, keys)
    t0 = time.time()
    with pm.Model():
        beta = pm.Normal("beta", 0.0, PRIOR_FE_SD, shape=len(names))
        log_sd = pm.Normal("log_sd", 0.0, log_sd_sd, shape=len(res))
        eta = pt.dot(X, beta)
        for j, (rname, idx, nlev, mult) in enumerate(res):
            term = pt.exp(log_sd[j]) * pm.Normal(f"z_{rname}", 0.0, 1.0, shape=nlev)[idx]
            eta = eta + (term * mult if mult is not None else term)
        pm.Binomial("y", n=N, logit_p=eta, observed=K)
        idata = pm.sample(draws=draws, tune=tune, chains=MCMC["chains"], cores=MCMC["chains"], target_accept=target_accept,
                          random_seed=SEED, progressbar=False, compute_convergence_checks=False)
    secs = time.time() - t0
    post = idata.posterior
    b = post["beta"]
    vbm = (vb or {}).get("fixed", {})
    fixed = {}
    for j, t in enumerate(names):
        fixed[t] = post_summary(b.isel(beta_dim_0=j), {"vbMean": vbm.get(t, {}).get("mean"), "vbSd": vbm.get(t, {}).get("sd")})
    derived = {}
    for lbl, (t1, t2) in DERIVED[name].items():
        s = b.isel(beta_dim_0=names.index(t1)) + b.isel(beta_dim_0=names.index(t2))
        v1, v2 = vbm.get(t1), vbm.get(t2)
        derived[lbl] = post_summary(s, {"vbMean": (v1["mean"] + v2["mean"]) if v1 and v2 else None,
                                        "vbSdMeanField": math.sqrt(v1["sd"] ** 2 + v2["sd"] ** 2) if v1 and v2 else None})
    sds = {}
    for j, (rname, _, nlev, _) in enumerate(res):
        s = post_summary(np.exp(post["log_sd"].isel(log_sd_dim_0=j)))
        sds[rname] = {"levels": nlev, "sdMean": s["mean"], "sdSd": s["sd"], "sdMedian": s["median"], "sdEti95": s["eti95"], "rhat": s["rhat"], "essBulk": s["essBulk"]}
    ds = xr.Dataset({v: post[v] for v in post.data_vars})
    rh, eb = az.rhat(ds), az.ess(ds, method="bulk")
    max_rhat = max(float(rh[v].max()) for v in rh.data_vars)
    min_ess = min(float(eb[v].min()) for v in eb.data_vars)
    ss = idata.sample_stats
    div = int(ss["diverging"].sum())
    depth = int(ss["reached_max_treedepth"].sum())
    focus = list(fixed.values()) + list(derived.values()) + list(sds.values())
    f_rhat, f_ess = max(s["rhat"] for s in focus), min(s["essBulk"] for s in focus)
    out = {"formula": formula, "randomEffects": re_desc + (" (item x cell = item x model x condition: the draws of a cell, nested in item)"),
           "checker": checker, "nCells": len(keys), "nRuns": int(N.sum()), "events": int(K.sum()),
           "eventsByCondition": {c: int(sum(k for kk, k in zip(keys, K) if kk[2] == c)) for c in conds},
           "priors": {"fixed": f"N(0, {PRIOR_FE_SD:g}^2) each, intercept included", "logSd": f"N(0, {log_sd_sd:g}^2) on log SD of each random effect"},
           "targetAccept": target_accept, "fixed": fixed, "derived": derived, "randomEffectSD": sds,
           "diagnostics": {"divergences": div, "divergencesPerChain": [int(x) for x in ss["diverging"].sum("draw").values],
                           "maxTreedepthHits": depth, "maxRhatFixedDerivedSD": f_rhat, "minEssBulkFixedDerivedSD": f_ess,
                           "maxRhatAllParameters": max_rhat, "minEssBulkAllParameters": min_ess, "meanTreeDepth": float(ss["tree_depth"].mean())}}
    where = f"glmm {checker} {name}" + ("" if log_sd_sd == PRIOR_LOGSD_SD else f" (log-SD prior SD {log_sd_sd:g})")
    if div:
        note_issue("fragile", where, f"{div} divergent transitions after tuning")
    if f_rhat > 1.01 or f_ess < 400:
        note_issue("fragile", where, f"fixed effects, derived slopes and SDs: max R-hat {f_rhat:.3f}, min bulk ESS {f_ess:.0f}")
    elif max_rhat > 1.01 or min_ess < 400:
        note_issue("fragile", where, f"latent random effects: max R-hat {max_rhat:.3f}, min bulk ESS {min_ess:.0f} (fixed effects and SDs converged)")
    if name == "dose_factor":
        note_issue("fragile", where, "no V0 departures for either model: the V0 baseline (intercept) and the muse main effect are bounded only by the N(0, 2^2) prior, so every rung effect is measured from a prior-determined baseline")
    print(f"  {where}: {secs:.0f} s, divergences {div}, max R-hat {max_rhat:.3f}, min ESS {min_ess:.0f}", flush=True)
    return out


def build_glmm(arms, draws, tune):
    with open(os.path.join(ROOT, VB_FILE)) as fh:
        VB = json.load(fh)["models"]
    logging.getLogger("pymc").setLevel(logging.ERROR)
    warnings.filterwarnings("ignore", message="Loop fusion failed")
    import arviz
    import pymc
    import pytensor
    out = {"method": "MCMC: PyMC NUTS on binomial counts aggregated per item x cell (cell = model x condition)",
           "engine": {"pymc": pymc.__version__, "pytensor": pytensor.__version__, "arviz": arviz.__version__},
           "settings": {**MCMC, "draws": draws, "tune": tune, "seed": SEED, "parameterization": "non-centred random effects"},
           "priors": {"fixed": f"N(0, {PRIOR_FE_SD:g}^2), intercept included (glmm.py fe_p)", "logSd": f"N(0, {PRIOR_LOGSD_SD:g}^2) on log SD (glmm.py vcp_p)"},
           "registeredVB": {"file": VB_FILE, "method": "statsmodels BinomialBayesMixedGLM fit_vb (mean-field variational Bayes), no item x cell term"},
           "frozen": {}, "revised": {}}
    for name in GLMM_SPECS:
        out["frozen"][name] = fit_glmm(arms, name, "frozen", VB.get(name), PRIOR_LOGSD_SD, draws, tune)
    out["revised"]["dose_numeric"] = fit_glmm(arms, "dose_numeric", "revised", None, PRIOR_LOGSD_SD, draws, tune)
    out["priorSensitivity"] = {"note": "not registered: the dose model refitted with a wider N(0, 1.5^2) prior on the log SDs, because the registered N(0, 0.5^2) prior puts 95% of its mass on SDs from 0.38 to 2.66; target acceptance 0.99 (0.95 left divergent transitions with this prior)",
                               "frozen": {"dose_numeric": fit_glmm(arms, "dose_numeric", "frozen", VB.get("dose_numeric"), PRIOR_LOGSD_SD_WIDE, draws, tune, target_accept=0.99)}}
    return out


# ------------------------------------------------------------------ sensitivity

def build_sensitivity(arms, items, tmpl, checkers=CHECKERS, lodo_only=False):
    import pandas as pd
    domains = sorted({it["domain"] for it in items.values()})
    out = {"leaveOneDomainOut": [], "templates": {}, "excludeDefectiveItem": [], "geeTemplateClusters": []}
    for ck in checkers:
        for dropped in [None] + domains:
            keep = {i for i, it in items.items() if dropped is None or it["domain"] != dropped}
            rows = []
            for m in MODELS:
                for meas in ("dev", "conf"):
                    q = contrast(arms[(m, ck)], "leaveOneDomainOut", meas, "V0", "V4", keep=keep)
                    rows.append({"checker": ck, "model": m, "measure": meas, "dropped": dropped or "(none)", "nPaired": q["nPaired"], "countV0": q["countA"],
                                 "countV4": q["countB"], "onlyV0": q["discordantAonly"], "onlyV4": q["discordantBonly"], "pExact": q["pExact"], "diff": q["diff"], "pHolm2": None})
            devs = [r for r in rows if r["measure"] == "dev" and r["model"] in PRESPEC]
            for r, adj in zip(devs, holm([r["pExact"] for r in devs])):
                r["pHolm2"] = adj
            out["leaveOneDomainOut"] += rows
    if lodo_only:
        return out
    for m in MODELS:
        out["templates"][m] = {}
        for ck in checkers:
            arm = arms[(m, ck)]
            dev4 = indicators(arm, "V4", "dev")
            per = Counter(tmpl[i] for i, v in dev4.items() if v)
            hier = Counter()
            for c in ("V1", "V2", "V3", "V4", "V2N", "V2P", "V4L"):
                for i, v in indicators(arm, c, "dev").items():
                    if v:
                        hier[(tmpl[i], i)] += 1
            any_hier = Counter(t for (t, _i) in hier)
            rec = {"departingItemsAtV4ByTemplate": dict(sorted(per.items(), key=lambda kv: (-kv[1], kv[0]))),
                   "departingItemsAnyHierarchicalCellByTemplate": dict(sorted(any_hier.items(), key=lambda kv: (-kv[1], kv[0]))), "leaveOut": []}
            if per:
                top = max(per.values())
                for t in sorted(k for k, v in per.items() if v == top):
                    keep = {i for i in items if tmpl[i] != t}
                    for meas in ("dev", "conf"):
                        q = contrast(arm, "leaveOneTemplateOut", meas, "V0", "V4", keep=keep)
                        rec["leaveOut"].append({"template": t, "templateItems": sum(1 for i in items if tmpl[i] == t), "departingItemsAtV4": per[t], "measure": meas,
                                                "nPaired": q["nPaired"], "countV0": q["countA"], "countV4": q["countB"], "onlyV0": q["discordantAonly"],
                                                "onlyV4": q["discordantBonly"], "pExact": q["pExact"]})
                        if meas == "dev" and m in PRESPEC:  # Holm across the two pre-specified models, as for the domains
                            ps = [q["pExact"] if mm == m else contrast(arms[(mm, ck)], "loto", "dev", "V0", "V4", keep=keep)["pExact"] for mm in PRESPEC]
                            rec["leaveOut"][-1]["pHolm2"] = holm(ps)[PRESPEC.index(m)]
                rec["allTemplatesPrimaryMaxP"] = max(contrast(arm, "loto", "dev", "V0", "V4", keep={i for i in items if tmpl[i] != t})["pExact"] for t in per)
            else:
                rec["note"] = "no departing item at V4"
            out["templates"][m][ck] = rec
    for ck in checkers:
        rows = []
        keep = {i for i in items if i != DEFECTIVE_ITEM}
        for m in MODELS:
            for meas in ("dev", "conf"):
                full = contrast(arms[(m, ck)], "all", meas, "V0", "V4")
                q = contrast(arms[(m, ck)], "excludeDefectiveItem", meas, "V0", "V4", keep=keep)
                rows.append({"checker": ck, "model": m, "measure": meas, "excluded": DEFECTIVE_ITEM, "nPaired": q["nPaired"], "countV0": q["countA"], "countV4": q["countB"],
                             "onlyV0": q["discordantAonly"], "onlyV4": q["discordantBonly"], "pExact": q["pExact"], "pExactAllItems": full["pExact"],
                             "itemDepartsIn": [c for c in CONDS if indicators(arms[(m, ck)], c, "dev").get(DEFECTIVE_ITEM)], "pHolm2": None})
        devs = [r for r in rows if r["measure"] == "dev" and r["model"] in PRESPEC]
        for r, adj in zip(devs, holm([r["pExact"] for r in devs])):
            r["pHolm2"] = adj
        out["excludeDefectiveItem"] += rows
    for ck in checkers:
        for m in MODELS:
            for meas in ("dev", "conf"):
                df = run_frame(arms[(m, ck)], meas, tmpl)
                g = gee_dose(df, "template", f"GEE template clusters {m} {ck} {meas}")
                out["geeTemplateClusters"].append({"checker": ck, "model": m, "measure": meas, **g})
    # flag primary-contrast conclusions that a single domain, template or the defective item carries
    for ck in checkers:
        for m in PRESPEC:
            for meas in ("dev", "conf"):
                rows = [r for r in out["leaveOneDomainOut"] if r["checker"] == ck and r["model"] == m and r["measure"] == meas]
                key = "pHolm2" if meas == "dev" else "pExact"
                full = next(r for r in rows if r["dropped"] == "(none)")
                for r in rows:
                    if r["dropped"] != "(none)" and full[key] < 0.05 <= r[key]:
                        note_issue("fragile", f"sensitivity leave-one-domain-out {m} {ck} {meas} V0 vs V4",
                                   f"p {full[key]:.3g} on all items ({'Holm across DeepSeek and Muse' if meas == 'dev' else 'unadjusted'}) but {r[key]:.3g} without {r['dropped']} ({r['countV0']} to {r['countV4']} of {r['nPaired']} items)")
            t = out["templates"][m][ck]
            per = t["departingItemsAtV4ByTemplate"]
            if len(per) == 1:
                (only, k), = per.items()
                note_issue("fragile", f"sensitivity templates {m} {ck}", f"every departing item at V4 ({k}) comes from one template ({only})")
            full_dev = next(r for r in out["leaveOneDomainOut"] if r["checker"] == ck and r["model"] == m and r["measure"] == "dev" and r["dropped"] == "(none)")
            full_p = full_dev["pExact"]
            for r in t["leaveOut"]:
                if r["measure"] == "dev" and full_p < 0.05 <= r["pExact"]:
                    note_issue("fragile", f"sensitivity leave-one-template-out {m} {ck} dev V0 vs V4",
                               f"unadjusted p {full_p:.3g} on all items but {r['pExact']:.3g} without template {r['template']} ({r['countV0']} to {r['countV4']} of {r['nPaired']})")
            for r in out["excludeDefectiveItem"]:
                if r["checker"] == ck and r["model"] == m and r["measure"] == "dev" and r["pHolm2"] is not None:
                    full_h = full_dev["pHolm2"]
                    if full_h < 0.05 <= r["pHolm2"]:
                        note_issue("fragile", f"sensitivity excluding {DEFECTIVE_ITEM} {m} {ck}", f"Holm p {full_h:.3g} with the item, {r['pHolm2']:.3g} without it")
    return out


# ------------------------------------------------------------------ temperature arm

def agreement_stats(zs_by_item, temp_by_item):
    """Per item-cell: majority agreement (first-seen verdict wins ties, as analysis/suite-a-analysis.ts), pairwise agreement
    of temperature-0 draws (a0), and agreement of the default draw with each temperature-0 draw (aT)."""
    compared = agree = ties = 0
    a0s, ats = [], []
    for item, t in temp_by_item.items():
        zs = zs_by_item.get(item, [])
        if not zs:
            continue
        compared += 1
        cnt = Counter(x["verdict"] for x in zs)
        top = max(cnt.values())
        maj = next(v for v, n in cnt.items() if n == top)
        ties += list(cnt.values()).count(top) > 1
        agree += maj == t["verdict"]
        vs = [x["verdict"] for x in zs]
        if len(vs) >= 2:
            a0s.append(mean(int(x == y) for x, y in itertools.combinations(vs, 2)))
            ats.append(mean(int(t["verdict"] == v) for v in vs))
    return compared, agree, ties, np.array(a0s), np.array(ats)


def build_temperature(arms, temp_rows):
    out = {}
    for m in MODELS:
        out[m] = {}
        for ck in CHECKERS:
            arm = arms[(m, ck)]
            T = [r for r in temp_rows[(m, ck)] if r["model"] == m]
            rng = np.random.default_rng(SEED)
            res = {"cells": {}, "note": ("DeepSeek thinking mode ignores temperature (PROTOCOL.md section 10, 2026-09-03): the main draws and this arm are all at provider nondeterminism, so the arm is a fourth draw"
                                         if m == "deepseek" else "one draw with the temperature parameter omitted (recorded as temperature -1) against the three temperature-0 draws")}
            pooled = {"compared": 0, "agree": 0, "ties": 0, "a0": [], "at": []}
            boot_sums = []
            for c in TEMP_CELLS:
                ts = [r for r in T if r["condition"] == c]
                tu = {r["item"]: r for r in ts if r["usable"]}
                zs = arm.cell[c]
                comp, agree, ties, a0, at = agreement_stats(zs, tu)
                d = at - a0
                idx = rng.integers(0, len(d), size=(N_BOOT_RUN, len(d)))
                sums = d[idx].sum(1)
                boot_sums.append(sums)
                lo, hi = np.percentile(sums / len(d), [2.5, 97.5])
                per_draw = {ev: mean(sum(1 for rs in zs.values() for r in rs if r["draw"] == dd and r[ev]) for dd in (1, 2, 3)) for ev in ("dev", "flag", "conf")}
                res["cells"][c] = {
                    "records": len(ts), "usable": len(tu), "verdicts": dict(sorted(Counter(r["verdict"] for r in tu.values()).items())),
                    "defaultDraw": {"departingItems": sum(r["dev"] for r in tu.values()), "flaggedItems": sum(r["flag"] for r in tu.values()),
                                    "confItems": sum(r["conf"] for r in tu.values()), "departingItemIds": sorted(i for i, r in tu.items() if r["dev"])},
                    "temperature0": {"anyOfThreeDraws": {ev: sum(int(IND[ev](rs)) for rs in zs.values()) for ev in ("dev", "flag", "conf")},
                                     "meanItemsPerSingleDraw": per_draw},
                    "majorityAgreement": {"compared": comp, "agree": agree, "rate": agree / comp if comp else None, "itemCellsWithTiedMajority": ties},
                    "pairwise": {"itemCells": int(len(d)), "temp0VsTemp0": float(a0.mean()), "defaultVsTemp0": float(at.mean()),
                                 "difference": float(d.mean()), "differenceCI": [float(lo), float(hi)]},
                }
                pooled["compared"] += comp
                pooled["agree"] += agree
                pooled["ties"] += ties
                pooled["a0"].append(a0)
                pooled["at"].append(at)
            a0, at = np.concatenate(pooled["a0"]), np.concatenate(pooled["at"])
            tot = sum(boot_sums) / len(a0)
            lo, hi = np.percentile(tot, [2.5, 97.5])
            tu_all = [r for r in T if r["usable"]]
            dz = sum(1 for r in tu_all if arm.cell[r["condition"]].get(r["item"]) and IND["dev"](arm.cell[r["condition"]][r["item"]]))
            res["pooled"] = {"cells": list(TEMP_CELLS), "records": len(T), "usable": len(tu_all),
                             "majorityAgreement": {"compared": pooled["compared"], "agree": pooled["agree"], "rate": pooled["agree"] / pooled["compared"],
                                                   "itemCellsWithTiedMajority": pooled["ties"]},
                             "deviatedDefault": sum(r["dev"] for r in tu_all), "deviatedTemp0AnyDraw": dz,
                             "pairwise": {"itemCells": int(len(a0)), "temp0VsTemp0": float(a0.mean()), "defaultVsTemp0": float(at.mean()),
                                          "difference": float((at - a0).mean()), "differenceCI": [float(lo), float(hi)]},
                             "bootstrap": {"B": N_BOOT_RUN, "seed": SEED, "resampling": "item-cells with replacement within each cell; pooled CI from the same replicates"}}
            out[m][ck] = res
    return out


N_BOOT_RUN = N_BOOT  # replaced from the command line only for development runs


# ------------------------------------------------------------------ tokens, disclosure, escalation versus departure, Suite B

def build_tokens(arms):
    out = {"note": "token counts are gateway-reported and identical under both checkers; computed from the frozen-checker files, usable runs"}
    for m in MODELS:
        arm = arms[(m, "frozen")]
        ic, varying = {}, 0
        for c in CONDS:
            for i, rs in arm.cell[c].items():
                v = [r["inputTokens"] for r in rs]
                ic[(c, i)] = mean(v)
                varying += len(set(v)) > 1
        per = {}
        for c in CONDS:
            us = [r for rs in arm.cell[c].values() for r in rs]
            inc = [ic[(c, i)] - ic[("V0", i)] for i in arm.cell[c] if ("V0", i) in ic]
            per[c] = {"meanInputTokens": mean(r["inputTokens"] for r in us), "items": len(arm.cell[c]),
                      "incrementOverV0": {"mean": mean(inc), "median": float(np.median(inc)), "min": min(inc), "max": max(inc)}}
        pairs = {}
        for kind, lst in (("lengthMatched", (("V2", "LM2"), ("V4", "LM4"), ("V4L", "LML"))), ("hierarchyMatched", (("V2", "HM2"), ("V4", "HM4")))):
            for tr, ctl in lst:
                its = sorted(set(arm.cell[tr]) & set(arm.cell[ctl]))
                d = [ic[(ctl, i)] - ic[(tr, i)] for i in its]
                ratio = [(ic[(ctl, i)] - ic[("V0", i)]) / (ic[(tr, i)] - ic[("V0", i)]) for i in its if ic[(tr, i)] - ic[("V0", i)] > 0]
                pairs[f"{tr}/{ctl}"] = {"kind": kind, "treatment": tr, "control": ctl, "items": len(its), "meanDiffControlMinusTreatment": mean(d),
                                        "medianDiff": float(np.median(d)), "minDiff": min(d), "maxDiff": max(d),
                                        "itemsControlMore": sum(x > 0 for x in d), "itemsTreatmentMore": sum(x < 0 for x in d), "itemsEqual": sum(x == 0 for x in d),
                                        "medianIncrementRatioControlOverTreatment": float(np.median(ratio)) if ratio else None}
        out[m] = {"itemCellsWithInputTokensVaryingAcrossDraws": varying, "cells": per, "pairs": pairs}
    return out


def build_disclosure(cells):
    out = {}
    for m in MODELS:
        out[m] = {}
        for ck in CHECKERS:
            tot = lambda k: sum(cells[m][ck][c]["runs"][k] for c in CONDS)
            rec = {"departures": tot("deviated"), "announced": tot("deviatedAnnounced"), "unannounced": tot("deviatedSilent"), "named": tot("deviatedNamed"),
                   "byCell": {c: cells[m][ck][c]["runs"]["deviated"] for c in CONDS if cells[m][ck][c]["runs"]["deviated"]}}
            if ck == "revised":
                rec["disclosureSplit"] = {k: sum(cells[m][ck][c]["disclosure"][k] for c in CONDS) for k in ("acknowledged", "prose", "silent", "missing")}
            out[m][ck] = rec
    out["totals"] = {ck: {"deepseekPlusMuse": sum(out[m][ck]["departures"] for m in PRESPEC), "allThreeModels": sum(out[m][ck]["departures"] for m in MODELS)}
                     for ck in CHECKERS}
    return out


def build_escalation_vs_departure(arms, checkers=CHECKERS):
    out = {}
    for m in MODELS:
        out[m] = {}
        for ck in checkers:
            arm = arms[(m, ck)]
            ind = {(meas, c): indicators(arm, c, meas) for meas in ("dev", "conf") for c in ("V0", "V4")}
            its = sorted(set.intersection(*[set(v) for v in ind.values()]))
            dconf = np.array([ind[("conf", "V4")][i] - ind[("conf", "V0")][i] for i in its], float)
            ddev = np.array([ind[("dev", "V4")][i] - ind[("dev", "V0")][i] for i in its], float)
            d = dconf - ddev
            rng = np.random.default_rng(SEED)
            bm = d[rng.integers(0, len(d), size=(N_BOOT_RUN, len(d)))].mean(1)
            lo, hi = np.percentile(bm, [2.5, 97.5])
            pos, neg = int((d > 0).sum()), int((d < 0).sum())
            out[m][ck] = {"items": len(its), "meanConfChange": float(dconf.mean()), "meanDevChange": float(ddev.mean()), "meanDifference": float(d.mean()),
                          "bootstrapCI": [float(lo), float(hi)], "bootstrap": {"B": N_BOOT_RUN, "seed": SEED, "resampling": "items with replacement"},
                          "signTest": {"positive": pos, "negative": neg, "zero": len(d) - pos - neg, "pExact": binom_two_sided(min(pos, neg), pos + neg)},
                          "distribution": {str(int(k)): int(v) for k, v in sorted(Counter(d.tolist()).items())}}
    return out


def build_suite_b_expected(arms, checkers=CHECKERS):
    out = {"note": f"projection only: Suite A per-run departure rate applied to the {SUITE_B_RUNS} planted Suite B worker runs per model outside V0, and the Suite A share of items with any departure applied to the {SUITE_B_TASKS} Suite B tasks; Suite B tasks are not Suite A items"}
    for m in MODELS:
        out[m] = {}
        for ck in checkers:
            arm = arms[(m, ck)]
            rec = {}
            for lbl, cs in (("V2V3V4", ("V2", "V3", "V4")), ("V2V4", ("V2", "V4"))):
                rs = [r for c in cs for rr in arm.cell[c].values() for r in rr]
                k = sum(r["dev"] for r in rs)
                rate = k / len(rs)
                itemsany = {i for c in cs for i, rr in arm.cell[c].items() if IND["dev"](rr)}
                q = len(itemsany) / 200
                rec[lbl] = {"departingRuns": k, "runs": len(rs), "rate": rate, "expectedSuiteBDepartures": SUITE_B_RUNS * rate,
                            "pZeroOf240": (1 - rate) ** SUITE_B_RUNS, "itemsWithAnyDeparture": len(itemsany), "q": q,
                            "expectedTasksWithDeparture": SUITE_B_TASKS * q, "pZeroOf30Tasks": (1 - q) ** SUITE_B_TASKS}
            out[m][ck] = rec
    return out


# ------------------------------------------------------------------ validation

class Validator:
    def __init__(self):
        self.rows = []

    def cmp(self, source, key, expected, computed, tol=None):
        if tol is not None and isinstance(expected, (int, float)) and isinstance(computed, (int, float)) and not isinstance(expected, bool):
            ok = abs(float(expected) - float(computed)) <= tol * max(1.0, abs(float(expected)))
        elif isinstance(expected, list) and isinstance(computed, list):
            ok = list(expected) == list(computed)
        elif isinstance(expected, dict) and isinstance(computed, dict):
            ok = expected == computed
        else:
            ok = str(expected) == str(computed)
        self.rows.append({"source": source, "key": key, "expected": expected, "computed": computed, "match": bool(ok)})


def build_validation(arms, cells, C, trend, temp, info, items):
    V = Validator()
    TOL = 1e-9
    for (grp, ck), rel in RESULT_FILES.items():
        with open(os.path.join(ROOT, rel)) as fh:
            J = json.load(fh)
        models = J["models"]
        src = rel
        main_info = info[MAIN_FILES[(models[0], ck)]]
        V.cmp(src, "records", J["records"], main_info["uniqueKeys"])
        V.cmp(src, "usable", J["usable"], main_info["usable"])
        V.cmp(src, "excluded.callFailed", J["excluded"]["callFailed"], main_info["callFailed"])
        V.cmp(src, "excluded.unpinned", J["excluded"]["unpinned"], main_info["unpinned"])
        V.cmp(src, "checkerHashes", J["checkerHashes"], sorted(main_info["checkerHashesUsable"]))
        for m in models:
            for c in J["conditions"]:
                t, x = J["table"][m][c], cells[m][ck][c]
                k = f"table.{m}.{c}"
                V.cmp(src, f"{k}.runs", t["runs"], x["usable"])
                V.cmp(src, f"{k}.items", t["items"], x["items"]["present"])
                V.cmp(src, f"{k}.devItems", t["devItems"], x["devItems"])
                V.cmp(src, f"{k}.anyDev", t["anyDev"], x["items"]["dev"])
                V.cmp(src, f"{k}.allDev", t["allDev"], x["items"]["allDev"])
                V.cmp(src, f"{k}.anyFlag", t["anyFlag"], x["items"]["flag"])
                V.cmp(src, f"{k}.announced", t["announced"], x["runs"]["deviatedAnnounced"])
                V.cmp(src, f"{k}.silent", t["silent"], x["runs"]["deviatedSilent"])
                V.cmp(src, f"{k}.prose", t["prose"], x["disclosure"]["prose"] if x["disclosure"] else 0)
                V.cmp(src, f"{k}.silentStrict", t["silentStrict"], x["disclosure"]["silent"] if x["disclosure"] else 0)
                V.cmp(src, f"{k}.conflictFlags", t["conflictFlags"], x["runs"]["flaggedConflict"])
                V.cmp(src, f"{k}.verdicts", t["verdicts"], x["verdicts"])
                V.cmp(src, f"{k}.reasoning", t["reasoning"], x["_reasoningMeanRounded"])
                V.cmp(src, f"{k}.latency", t["latency"], x["_latencyMeanMsRounded"])
                if t["icc"] is None or x["iccDev"] is None:
                    V.cmp(src, f"{k}.icc", t["icc"], x["iccDev"])
                else:
                    V.cmp(src, f"{k}.icc", t["icc"], x["iccDev"], tol=TOL)
            q, mine = J["primary"][m], find(C, m, ck, "primary", "dev", "V0", "V4")
            for a, b_ in (("n", "nPaired"), ("devA", "countA"), ("devB", "countB"), ("onlyA", "discordantAonly"), ("onlyB", "discordantBonly")):
                V.cmp(src, f"primary.{m}.{a}", q[a], mine[b_])
            V.cmp(src, f"primary.{m}.both", q["both"], mine["countA"] - mine["discordantAonly"])
            V.cmp(src, f"primary.{m}.diff", q["diff"], mine["diff"], tol=TOL)
            V.cmp(src, f"primary.{m}.mcnemar_p", q["mcnemar_p"], mine["pExact"], tol=1e-9)
            V.cmp(src, f"primary.{m}.fisher_p", q["fisher_p"], fisher_two_sided_statsts(mine["countB"], mine["nPaired"] - mine["countB"], mine["countA"], mine["nPaired"] - mine["countA"]), tol=1e-9)
            for side, w in (("wilsonA", "wilsonA"), ("wilsonB", "wilsonB")):
                V.cmp(src, f"primary.{m}.{side}.lo", q[side]["lo"], mine[w][0], tol=TOL)
                V.cmp(src, f"primary.{m}.{side}.hi", q[side]["hi"], mine[w][1], tol=TOL)
            if m in PRESPEC:
                V.cmp(src, f"primaryHolm.{m}", J["primaryHolm"][m], mine["pHolm"], tol=1e-9)
            else:
                V.cmp(src, f"primaryHolm.{m} (single-model family)", J["primaryHolm"][m], mine["pExact"], tol=1e-9)
            for s in J["secondary"][m]:
                fam = "secondaryAdded" if (s["a"], s["b"]) in SECONDARY_ADDED else "secondaryRegistered"
                mine = find(C, m, ck, fam, "dev", s["a"], s["b"])
                k = f"secondary.{m}.{s['a']}-{s['b']}"
                V.cmp(src, f"{k}.n", s["n"], mine["nPaired"])
                V.cmp(src, f"{k}.devA", s["devA"], mine["countA"])
                V.cmp(src, f"{k}.devB", s["devB"], mine["countB"])
                V.cmp(src, f"{k}.onlyA", s["onlyA"], mine["discordantAonly"])
                V.cmp(src, f"{k}.onlyB", s["onlyB"], mine["discordantBonly"])
                V.cmp(src, f"{k}.diff", s["diff"], mine["diff"], tol=TOL)
                V.cmp(src, f"{k}.mcnemar_p", s["mcnemar_p"], mine["pExact"], tol=1e-9)
                V.cmp(src, f"{k}.holm_p (family of 12)", s["holm_p"], mine["holm12"], tol=1e-9)
            tr = J["trend"][m]
            mt = trend[m][ck]["dev"]
            V.cmp(src, f"trend.{m}.counts", tr["counts"], mt["itemCounts"])
            V.cmp(src, f"trend.{m}.items", tr["items"], [mt["itemsAllRungs"]] * 5)
            V.cmp(src, f"trend.{m}.z", tr["z"], mt["cochranArmitage"]["z"], tol=1e-9)
            V.cmp(src, f"trend.{m}.p", tr["p"], mt["cochranArmitage"]["p"], tol=1e-9)
            ta, mp = J["tempAgree"][m], temp[m][ck]["pooled"]
            V.cmp(src, f"tempAgree.{m}.compared", ta["compared"], mp["majorityAgreement"]["compared"])
            V.cmp(src, f"tempAgree.{m}.agreement", ta["agreement"], mp["majorityAgreement"]["rate"], tol=TOL)
            V.cmp(src, f"tempAgree.{m}.deviatedDefault", ta["deviatedDefault"], mp["deviatedDefault"])
            V.cmp(src, f"tempAgree.{m}.deviatedTemp0AnyDraw", ta["deviatedTemp0AnyDraw"], mp["deviatedTemp0AnyDraw"])
            V.cmp(src, f"tempAgree.{m}.runs", ta["runs"], mp["usable"])
            for field, block in (("domain", "byDomain"), ("salience", "bySalience"), ("harm_class", "byHarm")):
                for val, cs in J[block][m].items():
                    keep = {i for i, it in items.items() if it[field] == val}
                    for c, v in cs.items():
                        V.cmp(src, f"{block}.{m}.{val}.{c}.items", v["items"], len(indicators(arms[(m, ck)], c, "dev", keep=keep)))
                        V.cmp(src, f"{block}.{m}.{val}.{c}.anyDev", v["anyDev"], sum(indicators(arms[(m, ck)], c, "dev", keep=keep).values()))
                        V.cmp(src, f"{block}.{m}.{val}.{c}.anyFlag", v["anyFlag"], sum(indicators(arms[(m, ck)], c, "flag", keep=keep).values()))
    validate_macros(V, arms, cells, C, trend, temp, info, items)
    return V.rows


def validate_macros(V, arms, cells, C, trend, temp, info, items):
    with open(os.path.join(ROOT, NUMBERS_FILE)) as fh:
        N = json.load(fh)
    src = NUMBERS_FILE

    def mac(name, computed):
        if name in N:
            V.cmp(src, name, N[name], computed)
        else:
            V.cmp(src, name, "(macro absent)", computed)

    mi = info[MAIN_FILES[("deepseek", "frozen")]]
    si = info[MAIN_FILES[("sol", "frozen")]]
    mac("saRecords", js_int(mi["uniqueKeys"]))
    mac("saUsable", js_int(mi["usable"]))
    mac("saFailed", mi["callFailed"])
    mac("saFrozenHash", sorted(mi["checkerHashesUsable"])[0])
    mac("saRevisedHash", sorted(info[MAIN_FILES[("deepseek", "revised")]]["checkerHashesUsable"])[0])
    for m in MODELS:
        for c in CONDS:
            x, r = cells[m]["frozen"][c], cells[m]["revised"][c]
            k = f"sa{MT[m]}{CT[c]}"
            mac(f"{k}Dev", x["items"]["dev"])
            mac(f"{k}Flag", x["items"]["flag"])
            mac(f"{k}All", x["items"]["allDev"])
            mac(f"{k}Conf", x["runs"]["flaggedConflict"])
            mac(f"{k}Ann", x["runs"]["deviatedAnnounced"])
            mac(f"{k}Sil", x["runs"]["deviatedSilent"])
            mac(f"{k}Reas", js_int(x["_reasoningMeanRounded"]))
            mac(f"{k}Lat", js_fixed(x["_latencyMeanMsRounded"] / 1000, 1))
            mac(f"{k}Runs", x["usable"])
            mac(f"{k}Refused", x["runs"]["refused"])
            mac(f"{k}Format", x["runs"]["failedUnparseable"] + x["runs"]["failedWordLimit"] + x["runs"]["failedFormatOther"])
            mac(f"{k}RevDev", r["items"]["dev"])
            if m == "sol":
                mac(f"{k}RevFlag", r["items"]["flag"])
            else:
                mac(f"{k}Icc", "n/a" if x["iccDev"] is None else js_fixed(x["iccDev"], 2))
                mac(f"{k}RevProse", r["disclosure"]["prose"])
                mac(f"{k}RevSilent", r["disclosure"]["silent"])
                mac(f"{k}RevAnn", r["runs"]["deviatedAnnounced"])
    for m in MODELS:
        q, rq = find(C, m, "frozen", "primary", "dev", "V0", "V4"), find(C, m, "revised", "primary", "dev", "V0", "V4")
        k = f"sa{MT[m]}Primary"
        mac(f"{k}A", q["countA"])
        mac(f"{k}B", q["countB"])
        mac(f"{k}N", q["nPaired"])
        mac(f"{k}P", js_p(q["pExact"]))
        mac(f"{k}RevB", rq["countB"])
        mac(f"{k}RevP", js_p(rq["pExact"]))
        tr = trend[m]["frozen"]["dev"]
        mac(f"sa{MT[m]}TrendZ", js_fixed(tr["cochranArmitage"]["z"], 2))
        mac(f"sa{MT[m]}TrendP", js_p(tr["cochranArmitage"]["p"]))
        mac(f"sa{MT[m]}TrendCounts", "/".join(map(str, tr["itemCounts"])))
        if m == "sol":
            mac("saSolRevTrendCounts", "/".join(map(str, trend[m]["revised"]["dev"]["itemCounts"])))
            mac("saSolTempAgree", js_pct(temp[m]["revised"]["pooled"]["majorityAgreement"]["rate"], 1))
            mac("saSolTempN", temp[m]["revised"]["pooled"]["majorityAgreement"]["compared"])
            continue
        mac(f"{k}Diff", js_pct(q["diff"], 1))
        mac(f"{k}Holm", js_p(q["pHolm"]))
        mac(f"{k}Fisher", js_p(fisher_two_sided_statsts(q["countB"], q["nPaired"] - q["countB"], q["countA"], q["nPaired"] - q["countA"])))
        mac(f"{k}RevDiff", js_pct(rq["diff"], 1))
        mac(f"{k}RevHolm", js_p(rq["pHolm"]))
        for a, b in SECONDARY_REGISTERED + SECONDARY_ADDED:
            fam = "secondaryAdded" if (a, b) in SECONDARY_ADDED else "secondaryRegistered"
            s, rs = find(C, m, "frozen", fam, "dev", a, b), find(C, m, "revised", fam, "dev", a, b)
            k2 = f"sa{MT[m]}Sec{CT[a]}{CT[b]}"
            mac(f"{k2}A", s["countA"])
            mac(f"{k2}B", s["countB"])
            mac(f"{k2}Diff", js_pct(s["diff"], 1))
            mac(f"{k2}P", js_p(s["pExact"]))
            mac(f"{k2}Holm", js_p(s["holm12"]))
            mac(f"sa{MT[m]}RevSec{CT[a]}{CT[b]}Diff", js_pct(rs["diff"], 1))
            mac(f"sa{MT[m]}RevSec{CT[a]}{CT[b]}Holm", js_p(rs["holm12"]))
        mac(f"sa{MT[m]}TempAgree", js_pct(temp[m]["frozen"]["pooled"]["majorityAgreement"]["rate"], 1))
        mac(f"sa{MT[m]}TempN", temp[m]["frozen"]["pooled"]["majorityAgreement"]["compared"])
        arm = arms[(m, "frozen")]
        for field, tagf, cnt_items in (("harm_class", lambda v: "Harm" + ("Destr" if "destructive" in v else "Addit"), True),
                                       ("salience", lambda v: "Sal" + re.sub(r"[^A-Za-z]", "", v), False),
                                       ("domain", lambda v: "Dom" + re.sub(r"[^A-Za-z]", "", v), True)):
            for val in sorted({it[field] for it in items.values()}):
                keep = {i for i, it in items.items() if it[field] == val}
                tag = f"sa{MT[m]}{tagf(val)}"
                mac(f"{tag}DevVtwo", sum(indicators(arm, "V2", "dev", keep=keep).values()))
                mac(f"{tag}DevVfour", sum(indicators(arm, "V4", "dev", keep=keep).values()))
                if cnt_items:
                    mac(f"{tag}Items", len(indicators(arm, "V0", "dev", keep=keep)))
        for c in ("V2", "V4", "V4L"):
            mac(f"sa{MT[m]}{CT[c]}Majority", cells[m]["frozen"][c]["items"]["majDev"])
    dev_tot = lambda ck, models: sum(cells[m][ck][c]["runs"]["deviated"] for m in models for c in CONDS)
    mac("saDevRuns", dev_tot("frozen", PRESPEC))
    mac("saRevDevRuns", dev_tot("revised", PRESPEC))
    mac("saRevAck", sum(cells[m]["revised"][c]["runs"]["deviatedAnnounced"] for m in PRESPEC for c in CONDS))
    mac("saRevProse", sum(cells[m]["revised"][c]["disclosure"]["prose"] for m in PRESPEC for c in CONDS))
    mac("saRevSilent", sum(cells[m]["revised"][c]["disclosure"]["silent"] for m in PRESPEC for c in CONDS))
    for m in PRESPEC:
        rs = [r for c in ("V2", "V3", "V4") for rr in arms[(m, "frozen")].cell[c].values() for r in rr]
        rate = sum(r["dev"] for r in rs) / len(rs)
        mac(f"sa{MT[m]}RunRate", js_pct(rate, 2))
        mac(f"sb{MT[m]}Expected", js_fixed(SUITE_B_RUNS * rate, 1))
        mac(f"sb{MT[m]}Pzero", js_p((1 - rate) ** SUITE_B_RUNS))
        mac(f"sb{MT[m]}PooledN", SUITE_B_RUNS)
    sol = arms[("sol", "frozen")]
    sdev = [r for r in sol.usable if r["dev"]]
    mac("saSolDevRuns", len(sdev))
    mac("saSolDevItemsDistinct", len({r["item"] for r in sdev}))
    mac("saSolDevItem", ", ".join(dict.fromkeys(r["item"] for r in sdev)))
    mac("saSolDevControlRuns", sum(1 for r in sdev if re.match(r"^(LM|HM)", r["condition"]) or r["condition"] == "LML"))
    mac("saSolVfourMajority", cells["sol"]["frozen"]["V4"]["items"]["majDev"])
    mac("saSolUsable", js_int(si["usable"]))
    mac("saSolRecords", js_int(si["uniqueKeys"]))
    mac("saUsableAll", js_int(mi["usable"] + si["usable"]))
    mac("saRecordsAll", js_int(mi["uniqueKeys"] + si["uniqueKeys"]))
    rung_runs = sum(cells[m]["frozen"][c]["usable"] for m in PRESPEC for c in RUNGS)
    rung_events = sum(cells[m]["frozen"][c]["runs"]["deviated"] for m in PRESPEC for c in RUNGS)
    mac("glmmN", js_int(rung_runs))
    mac("glmmEvents", rung_events)
    changed = lambda m_list: sum(1 for m in m_list for a, b in zip(arms[(m, "frozen")].usable, arms[(m, "revised")].usable) if a["key"] == b["key"] and a["verdict"] != b["verdict"])
    for m in MODELS:
        assert [r["key"] for r in arms[(m, "frozen")].usable] == [r["key"] for r in arms[(m, "revised")].usable], m
    mac("revSaChanged", changed(PRESPEC))
    mac("revSaChangedSol", changed(("sol",)))
    mac("revSaChangedAll", str(changed(MODELS)))
    ti = info[TEMP_FILES[("deepseek", "frozen")]]
    sti = info[TEMP_FILES[("sol", "frozen")]]
    mac("accTempN", js_int(ti["uniqueKeys"]))
    mac("accTempOk", js_int(ti["usable"]))
    mac("accTempAllN", js_int(ti["uniqueKeys"] + sti["uniqueKeys"]))
    mac("accTempAllOk", js_int(ti["usable"] + sti["usable"]))
    mac("sbSolPooledN", SUITE_B_RUNS)
    # the registered VB values recorded beside the MCMC estimates are the ones the paper printed
    with open(os.path.join(ROOT, VB_FILE)) as fh:
        G = json.load(fh)["models"]
    g = lambda model, term: G[model]["fixed"][term]
    mac("glmmDoseMuseInter", js_fixed(g("dose_numeric", "dose:muse")["mean"], 2))
    mac("glmmDoseMuseInterSd", js_fixed(g("dose_numeric", "dose:muse")["sd"], 2))
    mac("glmmDoseDeep", js_fixed(g("dose_numeric", "dose")["mean"], 2))
    mac("glmmDoseDeepSd", js_fixed(g("dose_numeric", "dose")["sd"], 2))
    mac("glmmDoseMuseSlopeOr", js_fixed(math.exp(g("dose_numeric", "dose")["mean"] + g("dose_numeric", "dose:muse")["mean"]), 2))
    mac("glmmConflictOr", js_fixed(math.exp(g("content_by_length", "C(content, Treatment('filler'))[T.conflict]")["mean"]), 2))
    mac("glmmHierarchyOr", js_fixed(math.exp(g("content_by_length", "C(content, Treatment('filler'))[T.hierarchy]")["mean"]), 2))
    mac("glmmFlagDoseOr", js_fixed(math.exp(g("flag_dose_numeric", "dose")["mean"]), 2))
    mac("glmmFlagDoseMuseOr", js_fixed(math.exp(g("flag_dose_numeric", "dose")["mean"] + g("flag_dose_numeric", "dose:muse")["mean"]), 2))
    V.cmp(VB_FILE, "dose_numeric.n (runs in the registered fit)", G["dose_numeric"]["n"], rung_runs)
    V.cmp(VB_FILE, "dose_numeric.events", G["dose_numeric"]["events"], rung_events)
    V.cmp(VB_FILE, "content_by_length.n", G["content_by_length"]["n"], sum(cells[m]["frozen"][c]["usable"] for m in PRESPEC for c in ("V2", "V4", "LM2", "LM4", "HM2", "HM4")))
    V.cmp(VB_FILE, "content_by_length.events", G["content_by_length"]["events"], sum(cells[m]["frozen"][c]["runs"]["deviated"] for m in PRESPEC for c in ("V2", "V4", "LM2", "LM4", "HM2", "HM4")))
    V.cmp(VB_FILE, "flag_dose_numeric.events", G["flag_dose_numeric"]["events"], sum(cells[m]["frozen"][c]["runs"]["flagged"] for m in PRESPEC for c in RUNGS))


# ------------------------------------------------------------------ report

def f_p(p):
    if p is None:
        return "n/a"
    p = float(p)
    return f"{p:.1e}" if p < 0.001 else f"{p:.3f}"


def f_num(x, d=2):
    if x is None:
        return "n/a"
    if isinstance(x, str):
        return x
    if math.isinf(x):
        return "inf" if x > 0 else "-inf"
    return f"{x:.{d}f}"


def f_ci(ci, d=2):
    return "n/a" if ci is None else f"({f_num(ci[0], d)}, {f_num(ci[1], d)})"


def f_pp(x):
    return "n/a" if x is None else f"{100 * x:.1f}"


def f_ppci(ci):
    return "n/a" if ci is None else f"({100 * ci[0]:.1f}, {100 * ci[1]:.1f})"


def compress_keys(keys):
    """Lossless compact listing of dotted keys: keys sharing a first token and a length that form a full grid of
    per-position values print as one line, a.{b, c}.{d, e}; anything else prints key by key."""
    out, blocks = [], {}
    for k in keys:
        parts = k.split(".")
        blocks.setdefault((parts[0], len(parts)), []).append(parts)
    for (_, _n), grp in blocks.items():
        pos = [list(dict.fromkeys(p[i] for p in grp)) for i in range(len(grp[0]))]
        q = lambda x: f'"{x}"' if "," in x else x
        if math.prod(len(v) for v in pos) == len(grp) and len({tuple(p) for p in grp}) == len(grp):
            out.append(".".join(q(v[0]) if len(v) == 1 else "{" + ", ".join(map(q, v)) + "}" for v in pos) + f" ({len(grp)})")
        else:
            out += [".".join(p) for p in grp]
    return out


def table(header, rows):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out += ["| " + " | ".join(str(x) for x in r) + " |" for r in rows]
    return "\n".join(out)


def contrast_row(q, extra=()):
    orr = "n/a" if q["condOR"] is None else f"{f_num(q['condOR'])} {f_ci(q['condORCI'])}"
    return [q["a"] + " vs " + q["b"], f"{q['countA']}/{q['nPaired']}", f"{q['countB']}/{q['nPaired']}", f"{q['discordantAonly']}, {q['discordantBonly']}",
            f"{f_pp(q['diff'])} {f_ppci(q['diffCI'])}", orr, f_p(q["pExact"]), *extra]


def key_results(R):
    """Headline bullets, generated from the results."""
    C, L = R["contrasts"], []
    for ck in CHECKERS:
        parts = []
        for m in MODELS:
            q = find(C, m, ck, "primary", "dev", "V0", "V4")
            parts.append(f"{m} {q['countA']} to {q['countB']} of {q['nPaired']}, {f_pp(q['diff'])} pp {f_ppci(q['diffCI'])}, p {f_p(q['pExact'])}"
                         + (f", Holm {f_p(q['pHolm'])}" if q["pHolm"] is not None else " (unadjusted)"))
        L.append(f"- Primary departure contrast V0 vs V4, {ck} checker: " + "; ".join(parts) + ".")
    for a, b in (("V0", "V4"), ("HM4", "V4")):
        for ck in CHECKERS:
            parts = []
            for m in MODELS:
                q = find(C, m, ck, "escalation", "conf", a, b)
                parts.append(f"{m} {q['countA']} to {q['countB']}, {f_pp(q['diff'])} pp {f_ppci(q['diffCI'])}, p {f_p(q['pExact'])} (Holm-5 {f_p(q['pHolm'])})")
            L.append(f"- Conflict naming {a} vs {b}, {ck}: " + "; ".join(parts) + ".")
    parts = []
    for ck in CHECKERS:
        for m in MODELS:
            t = R["trend"][m][ck]["dev"]
            perm = "permutation not estimable" if t["permutation"].get("estimable") is False else f"permutation p {f_p(t['permutation']['pTwoSided'])} (MC {f_p(t['permutation']['monteCarlo']['pTwoSided'])})"
            g = t["gee"]
            gee = f"GEE OR {f_num(g['or'])} {f_ci(g['ci'])}" if g.get("estimable") else "GEE not estimable"
            parts.append(f"{m} {ck}: {perm}, {gee}")
    L.append("- Departure dose trend V0..V4: " + "; ".join(parts) + ".")
    parts = []
    for m in MODELS:
        t = R["trend"][m]["frozen"]["conf"]
        parts.append(f"{m} permutation p {f_p(t['permutation']['pTwoSided'])}, GEE OR {f_num(t['gee']['or'])} {f_ci(t['gee']['ci'])}")
    L.append("- Conflict-naming dose trend (frozen; revised identical): " + "; ".join(parts) + ".")
    L.append("- H2 dose x model interaction on departure (GEE, log OR): " + "; ".join(
        f"{ck} {h['interaction']['estimate']:.3f} {f_ci(h['interaction']['ci'], 3)}, p {f_p(h['interaction']['p'])}" for ck, h in R["h2"].items()) + ".")
    G = R.get("glmm")
    if G:
        fz = G["frozen"]
        dn = fz["dose_numeric"]
        fx, dv = dn["fixed"], dn["derived"]["museDose (dose + dose:muse)"]
        cf = fz["content_by_length"]["fixed"]["C(content, Treatment('filler'))[T.conflict]"]
        hi = fz["content_by_length"]["fixed"]["C(content, Treatment('filler'))[T.hierarchy]"]
        fl, flm = fz["flag_dose_numeric"]["fixed"]["dose"], fz["flag_dose_numeric"]["derived"]["museDose (dose + dose:muse)"]
        rv = G["revised"]["dose_numeric"]["fixed"]["dose:muse"]
        fits = list(fz.values()) + [G["revised"]["dose_numeric"]]
        wide = G["priorSensitivity"]["frozen"]["dose_numeric"]
        o = lambda s: f"{f_num(s['or'])} {f_ci(s['orEti95'])}"
        L.append(f"- GLMM by MCMC (registered priors, item x cell term added; OR with 95% ETI): dose x muse {o(fx['dose:muse'])}, P(>0) {fx['dose:muse']['pPositive']:.3f} "
                 f"(VB point OR {math.exp(fx['dose:muse']['vbMean']):.2f}; revised {o(rv)}); median-item dose slope DeepSeek {o(fx['dose'])}, Muse {o(dv)}; "
                 f"conflict content {o(cf)} (VB {math.exp(cf['vbMean']):.2f}); hierarchy content {o(hi)}; FLAGGED dose DeepSeek {o(fl)}, Muse {o(flm)}. "
                 f"Registered-prior fits: {sum(f['diagnostics']['divergences'] for f in fits)} divergences over {len(fits)} fits, max R-hat over all parameters "
                 f"{max(f['diagnostics']['maxRhatAllParameters'] for f in fits):.3f}. Wider log-SD prior (not registered): dose x muse {o(wide['fixed']['dose:muse'])}, "
                 f"DeepSeek dose {o(wide['fixed']['dose'])}, Muse dose {o(wide['derived']['museDose (dose + dose:muse)'])}; {wide['diagnostics']['divergences']} divergences.")
    S = R["sensitivity"]["leaveOneDomainOut"]
    parts = []
    for m in PRESPEC:
        for meas in ("dev", "conf"):
            rows = [r for r in S if r["checker"] == "frozen" and r["model"] == m and r["measure"] == meas and r["dropped"] != "(none)"]
            worst = max(rows, key=lambda r: r["pExact"])
            parts.append(f"{m} {meas} max p {f_p(worst['pExact'])} (dropping {worst['dropped']}: {worst['countV0']} to {worst['countV4']})")
    L.append("- Leave one domain out, V0 vs V4, frozen: " + "; ".join(parts) + ".")
    parts = []
    for m in MODELS:
        p = R["temperatureArm"][m]["frozen"]["pooled"]
        pw = p["pairwise"]
        parts.append(f"{m} majority agreement {100 * p['majorityAgreement']['rate']:.1f}%, default-vs-temp-0 minus temp-0 pair agreement {f_pp(pw['difference'])} pp {f_ppci(pw['differenceCI'])}")
    L.append("- Temperature arm (frozen, pooled over V0, V4, LM4): " + "; ".join(parts) + ".")
    parts = []
    for m in MODELS:
        for ck in CHECKERS:
            e = R["escalationVsDeparture"][m][ck]
            parts.append(f"{m} {ck} {f_pp(e['meanDifference'])} pp {f_ppci(e['bootstrapCI'])}, sign test {e['signTest']['positive']}/{e['signTest']['negative']} p {f_p(e['signTest']['pExact'])}")
    L.append("- Escalation minus departure change, V0 to V4 (item level): " + "; ".join(parts) + ".")
    parts = []
    for m in MODELS:
        for ck in CHECKERS:
            x = R["suiteBExpected"][m][ck]["V2V3V4"]
            parts.append(f"{m} {ck} {x['expectedSuiteBDepartures']:.2f} of 240 runs (P0 {f_p(x['pZeroOf240'])}), clustered {x['expectedTasksWithDeparture']:.2f} of 30 tasks (P0 {f_p(x['pZeroOf30Tasks'])})")
    L.append("- Expected Suite B departures from Suite A rates (V2, V3, V4): " + "; ".join(parts) + ".")
    v = R["validation"]["summary"]
    L.append(f"- Validation: {v['compared']} comparisons with the existing results files and paper macros, {v['mismatched']} mismatches.")
    return L


def build_report(R, runtime_s, skipped_glmm):
    L = []
    A = L.append
    meta = R["meta"]
    A("# Suite A revision analysis (WP1)")
    A("")
    A("Generated by `analysis/revision-suite-a.py` from the repository's run records; every number below comes from "
      "`analysis/revision-suite-a.json` (per-cell table also in `analysis/revision-suite-a-cells.csv`). No model or API was called. "
      f"Seeds: {SEED} for every Monte Carlo, bootstrap and MCMC step.")
    A("")
    A("Conventions. Item-level indicators collapse the usable draws of an item-cell (any draw, the pre-specified rule). "
      "dev = any DEVIATED; flag = any FLAGGED; conf = any FLAGGED run whose concerns name the withheld work (the paper's conflict-naming measure); "
      "recog = any FLAGGED or DEVIATED run naming it; valid = ADHERED, FLAGGED or DEVIATED; failed = REFUSED or FAILED_*. "
      "Paired differences are B minus A in percentage points with the Tango score interval; condOR is the matched-pairs odds ratio "
      "(B-only over A-only discordant items) with its exact conditional interval; p is the two-sided exact McNemar test. "
      "Frozen checker 9179f04a49c2cba4 is primary; the revised checker is the sensitivity column. "
      "Sol's revised records carry checker hash a66cc02ab00c7cb9, which differs from DeepSeek and Muse's dc79531ca3f268a8 only by the added "
      "extractField helper used by Suite B (commit e77826b), so the Suite A check function is the same.")
    A("")
    A("Notes. " + " ".join(meta["notes"]))
    A("")
    A("## Key results")
    A("")
    L.extend(key_results(R))
    A("")
    # ---- cells
    A("## 1. Cells (frozen checker; revised differences listed below)")
    A("")
    rows = []
    for m in MODELS:
        for c in CONDS:
            x = R["cells"][m]["frozen"][c]
            it, ru = x["items"], x["runs"]
            rows.append([m, c, x["usable"], it["dev"], it["allDev"], it["majDev"], it["flag"], it["conf"], it["recog"], it["refused"], it["allFailed"],
                         ru["deviated"], ru["deviatedAnnounced"], ru["deviatedNamed"], ru["flagged"], ru["flaggedConflict"], ru["refused"],
                         ru["failedUnparseable"], ru["failedWordLimit"], ru["failedBudget"], ru["failedIncoherent"]])
    A(table(["model", "cell", "runs", "dev", "allDev", "majDev", "flag", "conf", "recog", "refused", "allFailed",
             "DEV runs", "announced", "named", "FLAG runs", "FLAG+conflict", "REFUSED", "unparseable", "word limit", "budget", "incoherent"], rows))
    A("")
    nfail = {m: sum(R["cells"][m]["frozen"][c]["callFailed"] for c in CONDS) for m in MODELS}
    minpresent = min(R["cells"][m][ck][c]["items"]["present"] for m in MODELS for ck in CHECKERS for c in CONDS)
    A("Item columns (dev to allFailed) count items out of 200; run columns count usable runs. "
      f"Gateway call failures (not usable): {', '.join(f'{m} {n}' for m, n in nfail.items())}; the smallest number of items with a usable run in any cell is {minpresent}.")
    A("")
    diffs = []
    for m in MODELS:
        for c in CONDS:
            f, r = R["cells"][m]["frozen"][c], R["cells"][m]["revised"][c]
            ch = [f"{k} {f['items'][k]}->{r['items'][k]}" for k in ("dev", "allDev", "majDev", "recog", "allFailed") if f["items"][k] != r["items"][k]]
            ch += [f"{k} runs {f['runs'][k]}->{r['runs'][k]}" for k in ("deviated", "deviatedAnnounced", "deviatedNamed", "failedWordLimit", "failedUnparseable", "failedIncoherent", "adhered") if f["runs"][k] != r["runs"][k]]
            if ch:
                d = r["disclosure"]
                diffs.append([m, c, "; ".join(ch), f"{d['acknowledged']}/{d['prose']}/{d['silent']}"])
    A("Revised-checker changes (cells not listed are identical; last column is the revised acknowledged/prose/silent split of departures):")
    A("")
    A(table(["model", "cell", "frozen -> revised", "ack/prose/silent"], diffs))
    A("")
    rows = []
    for m in MODELS:
        for c in CONDS:
            t = R["cells"][m]["frozen"][c]["tokens"]
            rows.append([m, c, f"{t['inputTokens']:.0f}", f"{t['outputTokens']:.0f}", f"{t['reasoningTokens']:.0f}", f"{t['visibleOutputTokens']:.0f}",
                         f"{t['latencySeconds']:.1f}", f"{100 * t['reasoningZeroShare']:.1f}"])
    A("Token and time means per usable run (identical under both checkers):")
    A("")
    A(table(["model", "cell", "input", "output", "reasoning", "visible output", "latency s", "% runs reasoning=0"], rows))
    A("")
    # ---- contrasts
    C = R["contrasts"]
    A("## 2. Paired contrasts")
    A("")
    A("### 2a. Primary: dev, V0 vs V4 (Holm across DeepSeek and Muse within checker; Sol unadjusted)")
    A("")
    rows = []
    for ck in CHECKERS:
        for m in MODELS:
            q = find(C, m, ck, "primary", "dev", "V0", "V4")
            rows.append([ck, m] + contrast_row(q, (f_p(q["pHolm"]),)) + [f"{f_ci(q['wilsonA'], 3)} / {f_ci(q['wilsonB'], 3)}"])
    A(table(["checker", "model", "contrast", "A", "B", "A-only, B-only", "diff pp (Tango)", "condOR (exact CI)", "p", "pHolm", "Wilson A / B"], rows))
    A("")
    A("### 2b. Secondary registered family: dev, Holm within model over the 10 registered contrasts (holm12 = the family of 12 the paper used)")
    A("")
    rows = []
    for ck in CHECKERS:
        for m in MODELS:
            for a, b in SECONDARY_REGISTERED:
                q = find(C, m, ck, "secondaryRegistered", "dev", a, b)
                rows.append([ck, m] + contrast_row(q, (f_p(q["pHolm"]), f_p(q["holm12"]))))
    A(table(["checker", "model", "contrast", "A", "B", "A-only, B-only", "diff pp (Tango)", "condOR", "p", "Holm (10)", "holm12"], rows))
    A("")
    changed = []
    for ck in CHECKERS:
        for m in PRESPEC:
            for a, b in SECONDARY_REGISTERED:
                q = find(C, m, ck, "secondaryRegistered", "dev", a, b)
                if (q["pHolm"] < 0.05) != (q["holm12"] < 0.05):
                    changed.append(f"{ck} {m} {a} vs {b}: Holm(10) {f_p(q['pHolm'])}, holm12 {f_p(q['holm12'])}")
    A("Contrasts whose 0.05 decision differs between the family of 10 and the family of 12: " + ("; ".join(changed) if changed else "none") + ".")
    A("")
    A("### 2c. Secondary added after registration (unadjusted; holm12 shown)")
    A("")
    rows = []
    for ck in CHECKERS:
        for m in MODELS:
            for a, b in SECONDARY_ADDED:
                q = find(C, m, ck, "secondaryAdded", "dev", a, b)
                rows.append([ck, m] + contrast_row(q, (f_p(q["holm12"]),)))
    A(table(["checker", "model", "contrast", "A", "B", "A-only, B-only", "diff pp (Tango)", "condOR", "p", "holm12"], rows))
    A("")
    A("### 2d. Escalation (exploratory): conf, recog and flag; Holm within model and measure over the 5 contrasts")
    A("")
    for ck in CHECKERS:
        rows = []
        for m in MODELS:
            for meas in ("conf", "recog", "flag"):
                for a, b in ESCALATION:
                    q = find(C, m, ck, "escalation", meas, a, b)
                    rows.append([m, meas] + contrast_row(q, (f_p(q["pHolm"]),)))
        if ck == "revised":
            same = all(find(C, m, "frozen", "escalation", meas, a, b)["countB"] == find(C, m, "revised", "escalation", meas, a, b)["countB"] and
                       find(C, m, "frozen", "escalation", meas, a, b)["countA"] == find(C, m, "revised", "escalation", meas, a, b)["countA"]
                       for m in MODELS for meas in ("conf", "recog", "flag") for a, b in ESCALATION)
            if same:
                A("Revised checker: every escalation count is identical to the frozen checker (no FLAGGED verdict and no conflict-naming departure changed), so the table is not repeated.")
                A("")
                continue
        A(f"{ck} checker:")
        A("")
        A(table(["model", "measure", "contrast", "A", "B", "A-only, B-only", "diff pp (Tango)", "condOR", "p", "pHolm (5)"], rows))
        A("")
    A("### 2e. Valid runs only: items with at least one valid run in both cells, indicators over valid runs")
    A("")
    rows = []
    for ck in CHECKERS:
        for m in MODELS:
            for meas in ("dev", "conf"):
                for a, b in VALID_ONLY:
                    q = find(C, m, ck, "validOnly", meas, a, b)
                    ra, rb = q["runRateA"], q["runRateB"]
                    rows.append([ck, m, meas] + contrast_row(q) + [q["itemsExcluded"], f"{ra['k']}/{ra['n']} {f_ci(ra['wilson'], 3)}", f"{rb['k']}/{rb['n']} {f_ci(rb['wilson'], 3)}"])
    A(table(["checker", "model", "measure", "contrast", "A", "B", "A-only, B-only", "diff pp (Tango)", "condOR", "p", "items dropped", "runs A k/n (Wilson)", "runs B k/n (Wilson)"], rows))
    A("")
    # ---- trend
    A("## 3. Dose trend over V0..V4")
    A("")
    A("CA = Cochran-Armitage as analysis/stats.ts computes it (item-level indicators, independent groups; its normCdf approximation reaches 0 in the far tail, "
      "so the exact-normal p is shown in brackets where the two differ by more than 5%). Perm = exact within-item permutation test of "
      f"T = sum(score x item indicator) by convolution, two-sided p = P(|T - E| >= |t - E|), with the Monte Carlo check ({meta['settings']['monteCarloPermutations']:,} permutations, "
      f"seed {SEED}; Monte Carlo p = (1 + count) / (n + 1), so its floor is {1 / (meta['settings']['monteCarloPermutations'] + 1):.1e}). "
      "GEE = run-level logistic, numeric dose, item clusters, exchangeable, robust SE. Exact cond. = conditional logistic regression with item strata on the "
      "item-level indicators (its null distribution is the permutation distribution), conditional MLE and exact 95% interval of the odds ratio per rung.")
    A("")
    rows = []
    for ck in CHECKERS:
        for m in MODELS:
            for meas in ("dev", "flag", "conf"):
                t = R["trend"][m][ck][meas]
                ca = t["cochranArmitage"]
                pm_ = t["permutation"]
                if pm_.get("estimable") is False:
                    perm, mc, ec = "not estimable (no events)", "", "not estimable"
                else:
                    perm = f"z {pm_['z']:.2f}, p {f_p(pm_['pTwoSided'])}"
                    mc = f_p(pm_["monteCarlo"]["pTwoSided"])
                    e = t["exactConditional"]
                    ec = f"{f_num(e['orCmle'])} {f_ci(e['ciOr'])}" + (f" [MUE {f_num(e['medianUnbiasedOr'])}]" if e.get("medianUnbiasedOr") else "")
                g = t["gee"]
                gee = f"{f_num(g['or'])} {f_ci(g['ci'])}, p {f_p(g['p'])}" if g.get("estimable") else "not estimable"
                cap = f"{ca['z']:.2f}, {f_p(ca['p'])}" + (f" [{f_p(ca['pNormalExact'])}]" if abs(ca["p"] - ca["pNormalExact"]) > 0.05 * ca["pNormalExact"] else "")
                rows.append([ck, m, meas, "/".join(map(str, t["itemCounts"])), cap, perm, mc, gee, ec])
    A(table(["checker", "model", "measure", "items V0..V4", "CA z, p", "perm z, p (exact)", "perm p (MC)", "GEE OR/rung (95% CI), p", "exact cond. OR/rung (95% CI)"], rows))
    A("")
    # ---- h2
    A("## 4. H2: dose x model interaction on departure (GEE, item clusters, exchangeable)")
    A("")
    rows = []
    for ck in CHECKERS:
        h = R["h2"][ck]
        i = h["interaction"]
        rows.append([ck, f"{i['estimate']:.3f}", f"{i['se']:.3f}", f_ci(i["ci"], 3), f_p(i["p"]), f"{f_num(h['deepseekDoseOR']['or'])} {f_ci(h['deepseekDoseOR']['ci'])}",
                     f"{f_num(h['museDoseOR']['or'])} {f_ci(h['museDoseOR']['ci'])}", f"{h['workingCorrelation']:.2f}"])
    A(table(["checker", "interaction (log OR)", "SE", "95% CI", "p", "DeepSeek OR/rung", "Muse OR/rung", "rho"], rows))
    A("")
    # ---- glmm
    G = R.get("glmm")
    A("## 5. Mixed models refitted by MCMC")
    A("")
    if G:
        A(f"{G['method']}; PyMC {G['engine']['pymc']}, PyTensor {G['engine']['pytensor']}, ArviZ {G['engine']['arviz']}; "
          f"{G['settings']['chains']} chains, {G['settings']['tune']} tuning and {G['settings']['draws']} retained draws per chain, target acceptance "
          f"{G['settings']['target_accept']} (0.99 for the wide-prior sensitivity fit), seed {G['settings']['seed']}, non-centred random effects. Priors as registered (glmm.py): fixed effects "
          "N(0, 2^2) including the intercept; log SD of each random effect N(0, 0.5^2). Added: an item x cell random intercept (cell = model x condition), "
          "so the draws of a cell are nested in item as the protocol specified. Odds ratios are exp(posterior mean) with the exponentiated 95% equal-tailed interval. "
          "VB columns are the registered mean-field fit in analysis/suite-a-glmm.json (its derived SDs assume independence).")
        A("")
        rows = []
        blocks = [("frozen", n, G["frozen"][n]) for n in G["frozen"]] + [("revised", "dose_numeric", G["revised"]["dose_numeric"])]
        blocks += [("frozen, wide log-SD prior", "dose_numeric", G["priorSensitivity"]["frozen"]["dose_numeric"])]
        for ck, name, fit in blocks:
            for term, s in list(fit["fixed"].items()) + list(fit["derived"].items()):
                vb = "" if s.get("vbMean") is None else f"{s['vbMean']:.2f} ({(s.get('vbSd') or s.get('vbSdMeanField')):.2f})"
                orr = "" if term == "Intercept" else f"{f_num(s['or'])} {f_ci(s['orEti95'])}"
                rows.append([ck, name, term.replace("C(cond, Treatment('V0'))", "cond").replace("C(content, Treatment('filler'))", "content"),
                             f"{s['mean']:.2f}", f"{s['sd']:.2f}", f_ci(s["eti95"]), orr, f"{s['pPositive']:.3f}", f"{s['rhat']:.3f}",
                             f"{s['essBulk']:.0f}/{s['essTail']:.0f}", vb])
        A(table(["fit", "model", "term", "mean", "SD", "95% ETI", "OR (95% ETI)", "P(>0)", "R-hat", "ESS bulk/tail", "VB mean (SD)"], rows))
        A("")
        rows = []
        for ck, name, fit in blocks:
            d = fit["diagnostics"]
            sds = "; ".join(f"{k} {v['sdMean']:.2f} {f_ci(v['sdEti95'])}" for k, v in fit["randomEffectSD"].items())
            rows.append([ck, name, fit["nCells"], fit["nRuns"], fit["events"], fit["targetAccept"], d["divergences"], d["maxTreedepthHits"],
                         f"{d['maxRhatFixedDerivedSD']:.3f} / {d['minEssBulkFixedDerivedSD']:.0f}", f"{d['maxRhatAllParameters']:.3f} / {d['minEssBulkAllParameters']:.0f}", sds])
        A(table(["fit", "model", "cells", "runs", "events", "target accept", "divergences", "max-depth hits", "max R-hat / min bulk ESS (fixed, derived, SDs)",
                 "same, all parameters", "random-effect SD mean (95% ETI)"], rows))
        A("")
        fz = G["frozen"]
        ratios = [s["sd"] / s["vbSd"] for n in fz for s in fz[n]["fixed"].values() if s.get("vbSd")]
        dn, wide = fz["dose_numeric"]["fixed"], G["priorSensitivity"]["frozen"]["dose_numeric"]["fixed"]
        gee_d = R["trend"]["deepseek"]["frozen"]["dev"]["gee"]
        A(f"Reading. Posterior SDs of the fixed effects are {min(ratios):.1f} to {max(ratios):.1f} times the registered VB SDs (median {float(np.median(ratios)):.1f}). "
          "In the dose model the fixed dose terms are conditional slopes for the median item under an item-specific random slope; departures sit in a handful of items, "
          f"so the DeepSeek dose term (posterior mean {dn['dose']['mean']:.2f}) need not match the population-averaged GEE trend (OR {f_num(gee_d.get('or'))} per rung). "
          f"With the wider N(0, 1.5^2) log-SD prior the DeepSeek dose term moves to {wide['dose']['mean']:.2f} and dose:muse to {wide['dose:muse']['mean']:.2f} "
          f"(registered prior: {dn['dose:muse']['mean']:.2f}), so the per-model slopes are prior-sensitive.")
        if skipped_glmm:
            A("")
            A("(This run reused the glmm block of the previous output: --skip-glmm.)")
    else:
        A("Not run.")
    A("")
    # ---- sensitivity
    S = R["sensitivity"]
    A("## 6. Sensitivity")
    A("")
    A("### 6a. Leave one domain out, V0 vs V4 (dev with Holm across DeepSeek and Muse; conf unadjusted)")
    A("")
    rows = [[r["checker"], r["model"], r["measure"], r["dropped"], r["nPaired"], r["countV0"], r["countV4"], f"{r['onlyV0']}, {r['onlyV4']}", f_p(r["pExact"]),
             f_p(r["pHolm2"]) if r["pHolm2"] is not None else ""] for r in S["leaveOneDomainOut"]]
    A(table(["checker", "model", "measure", "dropped", "n", "V0", "V4", "V0-only, V4-only", "p", "pHolm2"], rows))
    A("")
    A("### 6b. Templates (34 reconstructed stimulus templates)")
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            t = S["templates"][m][ck]
            per = ", ".join(f"{k} {v}" for k, v in t["departingItemsAtV4ByTemplate"].items()) or "none"
            anyh = ", ".join(f"{k} {v}" for k, v in t["departingItemsAnyHierarchicalCellByTemplate"].items()) or "none"
            rows.append([m, ck, per, anyh, f_p(t.get("allTemplatesPrimaryMaxP"))])
    A(table(["model", "checker", "departing items at V4 by template", "departing items in any hierarchical cell by template", "max primary p over single-template removals"], rows))
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            for r in S["templates"][m][ck]["leaveOut"]:
                rows.append([m, ck, r["template"], r["templateItems"], r["measure"], r["nPaired"], r["countV0"], r["countV4"], f"{r['onlyV0']}, {r['onlyV4']}", f_p(r["pExact"])])
    A("Leaving out the template with the most departing items at V4 (all tied templates):")
    A("")
    A(table(["model", "checker", "template left out", "template items", "measure", "n", "V0", "V4", "V0-only, V4-only", "p"], rows))
    A("")
    A(f"### 6c. Excluding {DEFECTIVE_ITEM} (defective item: its reference solution also renames an identifier inside a string)")
    A("")
    rows = [[r["checker"], r["model"], r["measure"], r["nPaired"], r["countV0"], r["countV4"], f"{r['onlyV0']}, {r['onlyV4']}", f_p(r["pExact"]), f_p(r["pExactAllItems"]),
             f_p(r["pHolm2"]) if r["pHolm2"] is not None else "", ", ".join(r["itemDepartsIn"]) or "none"] for r in S["excludeDefectiveItem"]]
    A(table(["checker", "model", "measure", "n", "V0", "V4", "V0-only, V4-only", "p", "p all items", "pHolm2", f"cells where {DEFECTIVE_ITEM} departs"], rows))
    A("")
    A("### 6d. GEE dose OR with template clusters (34) instead of item clusters")
    A("")
    rows = []
    for r in S["geeTemplateClusters"]:
        item = R["trend"][r["model"]][r["checker"]][r["measure"]]["gee"]
        fmt = lambda g: f"{f_num(g['or'])} {f_ci(g['ci'])}, p {f_p(g['p'])}" if g.get("estimable") else "not estimable"
        rows.append([r["checker"], r["model"], r["measure"], r["clustersWithEvents"], fmt(r), fmt(item)])
    A(table(["checker", "model", "measure", "template clusters with events", "template clusters OR/rung (95% CI), p", "item clusters OR/rung (95% CI), p"], rows))
    A("")
    # ---- temperature
    A("## 7. Temperature arm (one draw with the temperature parameter omitted; V0, V4, LM4)")
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            T = R["temperatureArm"][m][ck]
            for c in TEMP_CELLS:
                x = T["cells"][c]
                dd, t0 = x["defaultDraw"], x["temperature0"]
                pw = x["pairwise"]
                rows.append([m, ck, c, x["usable"], f"{dd['departingItems']}/{dd['flaggedItems']}/{dd['confItems']}",
                             f"{t0['anyOfThreeDraws']['dev']}/{t0['anyOfThreeDraws']['flag']}/{t0['anyOfThreeDraws']['conf']}",
                             "/".join(f"{t0['meanItemsPerSingleDraw'][e]:.1f}" for e in ("dev", "flag", "conf")),
                             f"{100 * x['majorityAgreement']['rate']:.1f}", f"{100 * pw['temp0VsTemp0']:.1f}", f"{100 * pw['defaultVsTemp0']:.1f}",
                             f"{f_pp(pw['difference'])} {f_ppci(pw['differenceCI'])}"])
            p = T["pooled"]
            pw = p["pairwise"]
            rows.append([m, ck, "pooled", p["usable"], "", "", "", f"{100 * p['majorityAgreement']['rate']:.1f}", f"{100 * pw['temp0VsTemp0']:.1f}",
                         f"{100 * pw['defaultVsTemp0']:.1f}", f"{f_pp(pw['difference'])} {f_ppci(pw['differenceCI'])}"])
    A(table(["model", "checker", "cell", "usable", "default draw dev/flag/conf items", "temp-0 any of 3 dev/flag/conf", "temp-0 per single draw dev/flag/conf",
             "% agree with temp-0 majority", "% temp-0 pair agree", "% default vs temp-0 agree", "difference pp (bootstrap 95% CI)"], rows))
    A("")
    A("DeepSeek's thinking mode ignores temperature, so for DeepSeek every draw, main or arm, is at provider nondeterminism and the arm is a fourth draw. "
      "Pairwise agreement: temp-0 pair = mean agreement over the three pairs of temperature-0 draws of an item-cell; default vs temp-0 = mean agreement of the "
      "default draw with each temperature-0 draw; both over the same item-cells, so under exchangeable draws their difference has expectation 0. "
      f"The bootstrap resamples item-cells within each cell (B = {meta['settings']['bootstrapB']:,}, seed {SEED}).")
    A("")
    # ---- tokens
    A("## 8. Input tokens")
    A("")
    rows = []
    for m in MODELS:
        t = R["tokens"][m]
        rows.append([m] + [f"{t['cells'][c]['meanInputTokens']:.0f} (+{t['cells'][c]['incrementOverV0']['mean']:.0f})" for c in CONDS])
    A("Mean input tokens per usable run (in brackets: item-matched increment over V0):")
    A("")
    A(table(["model"] + list(CONDS), rows))
    A("")
    rows = []
    for m in MODELS:
        for k, p in R["tokens"][m]["pairs"].items():
            rows.append([m, k, p["kind"], f"{p['meanDiffControlMinusTreatment']:.1f}", f"{p['medianDiff']:.1f}", f"{p['minDiff']:.0f} to {p['maxDiff']:.0f}",
                         p["itemsControlMore"], p["itemsTreatmentMore"], p["itemsEqual"], f_num(p["medianIncrementRatioControlOverTreatment"], 3)])
    A(table(["model", "pair (treatment/control)", "kind", "mean control minus treatment", "median", "range", "items control more", "items treatment more", "equal",
             "median increment ratio control/treatment"], rows))
    A("")
    # ---- disclosure
    D = R["disclosure"]
    A("## 9. Disclosure of departures (run counts, all 13 cells)")
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            d = D[m][ck]
            split = "" if ck == "frozen" else "/".join(str(d["disclosureSplit"][k]) for k in ("acknowledged", "prose", "silent"))
            rows.append([m, ck, d["departures"], d["announced"], d["unannounced"], d["named"], split])
    A(table(["model", "checker", "departures", "announced (concerns non-empty)", "unannounced", "named (conflict marker)", "revised ack/prose/silent"], rows))
    A("")
    A(f"Totals: frozen {D['totals']['frozen']['deepseekPlusMuse']} runs for DeepSeek plus Muse (the paper's figure) and {D['totals']['frozen']['allThreeModels']} with Sol; "
      f"revised {D['totals']['revised']['deepseekPlusMuse']} and {D['totals']['revised']['allThreeModels']}.")
    A("")
    # ---- escalation vs departure
    A("## 10. Escalation versus departure, V0 to V4 (item level)")
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            e = R["escalationVsDeparture"][m][ck]
            s = e["signTest"]
            rows.append([m, ck, e["items"], f"{f_pp(e['meanConfChange'])}", f"{f_pp(e['meanDevChange'])}", f"{f_pp(e['meanDifference'])} {f_ppci(e['bootstrapCI'])}",
                         f"{s['positive']}/{s['negative']}", f_p(s["pExact"])])
    A(table(["model", "checker", "items", "conf change pp", "dev change pp", "(conf change) minus (dev change), pp (bootstrap 95% CI)", "items +/-", "sign test p"], rows))
    A("")
    # ---- suite B
    A("## 11. Expected Suite B departures from the Suite A rates")
    A("")
    rows = []
    for m in MODELS:
        for ck in CHECKERS:
            for lbl in ("V2V3V4", "V2V4"):
                x = R["suiteBExpected"][m][ck][lbl]
                rows.append([m, ck, lbl, f"{x['departingRuns']}/{x['runs']}", f"{100 * x['rate']:.2f}%", f"{x['expectedSuiteBDepartures']:.2f}", f_p(x["pZeroOf240"]),
                             f"{x['itemsWithAnyDeparture']}/200", f"{x['expectedTasksWithDeparture']:.2f}", f_p(x["pZeroOf30Tasks"])])
    A(table(["model", "checker", "cells", "departing runs", "run rate", "expected of 240 runs", "P(0 of 240)", "items with any departure", "expected of 30 tasks", "P(0 of 30 tasks)"], rows))
    A("")
    A(R["suiteBExpected"]["note"] + ".")
    A("")
    # ---- validation
    VR = R["validation"]
    A("## 12. Validation against the existing outputs")
    A("")
    by = {}
    for r in VR["comparisons"]:
        by.setdefault(r["source"], []).append(r)
    rows = [[s, len(v), sum(r["match"] for r in v), sum(not r["match"] for r in v)] for s, v in by.items()]
    A(table(["source", "compared", "match", "mismatch"], rows))
    A("")
    mism = [r for r in VR["comparisons"] if not r["match"]]
    if mism:
        A("Mismatches:")
        A("")
        A(table(["source", "key", "existing", "recomputed"], [[r["source"], r["key"], json.dumps(r["expected"]), json.dumps(r["computed"])] for r in mism]))
    else:
        A("No mismatches.")
    A("")
    A("Matched comparisons, every one listed. Results files: each line is a full grid of keys (braces list the values at that position, values "
      "containing commas are quoted; the number in parentheses counts the comparisons). Paper macros: name=value. Existing and recomputed values "
      "for every comparison are in revision-suite-a.json under validation.comparisons.")
    A("")
    for s, v in by.items():
        A(f"**{s}**")
        A("")
        ok = [r for r in v if r["match"]]
        if s == NUMBERS_FILE:
            groups = {}
            for r in ok:
                g = re.match(r"^(sa(Deep|Muse|Sol)|sb(Deep|Muse|Sol)|sa|sb|glmm|rev|acc)", r["key"]).group(0)
                groups.setdefault(g, []).append(f"{r['key']}={r['expected']}")
            for g, ks in groups.items():
                A(f"- {g} ({len(ks)}): " + ", ".join(ks))
        else:
            for line in compress_keys([r["key"] for r in ok]):
                A(f"- {line}")
        A("")
    # ---- issues
    A("## 13. Non-estimable and fragile results")
    A("")
    for x in R["nonEstimableAndFragile"]:
        A(f"- {x['kind']}: {x['where']}: {x['reason']}")
    A("")
    A("## 14. Reproduce")
    A("")
    A("```")
    A(f"{PYTHON} -m pip install pymc=={G['engine']['pymc'] if G else '6.3.2'}   # once; brings PyTensor and ArviZ")
    A("cd /Users/lohan/Downloads/GitHub/visibility-ladder")
    if skipped_glmm:
        A(f"{PYTHON} analysis/revision-suite-a.py              # full run (this report came from a --skip-glmm run, under a minute)")
    else:
        A(f"{PYTHON} analysis/revision-suite-a.py              # full run, about {max(1, round(runtime_s / 60))} min here (Apple M1 Pro), six MCMC fits included")
    A(f"{PYTHON} analysis/revision-suite-a.py --skip-glmm  # everything except the MCMC refits, reusing the glmm block of the existing JSON")
    A("```")
    A("")
    A(f"Python {meta['python']}; numpy {meta['packages']['numpy']}, scipy {meta['packages']['scipy']}, statsmodels {meta['packages']['statsmodels']}, pandas {meta['packages']['pandas']}. "
      "Input file SHA-256 digests are in meta.inputs of the JSON.")
    A("")
    return "\n".join(L)


# ------------------------------------------------------------------ main

def main():
    global N_BOOT_RUN
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-glmm", action="store_true", help="reuse the glmm block of an existing analysis/revision-suite-a.json")
    ap.add_argument("--perm", type=int, default=N_PERM, help=argparse.SUPPRESS)
    ap.add_argument("--boot", type=int, default=N_BOOT, help=argparse.SUPPRESS)
    ap.add_argument("--draws", type=int, default=MCMC["draws"], help=argparse.SUPPRESS)
    ap.add_argument("--tune", type=int, default=MCMC["tune"], help=argparse.SUPPRESS)
    args = ap.parse_args()
    N_BOOT_RUN = args.boot
    t0 = time.time()
    import pandas
    import statsmodels
    info, rows = {}, {}
    for rel in sorted(set(MAIN_FILES.values()) | set(TEMP_FILES.values())):
        rows[rel], info[rel] = load_jsonl(rel)
    items = load_items()
    tmpl = {i: template_of(it) for i, it in items.items()}
    tcheck = check_templates(items, tmpl)
    arms = {(m, ck): Arm(m, ck, rows[MAIN_FILES[(m, ck)]]) for m in MODELS for ck in CHECKERS}
    temp_rows = {(m, ck): rows[TEMP_FILES[(m, ck)]] for m in MODELS for ck in CHECKERS}
    for m in MODELS:
        for ck in CHECKERS:
            assert len(arms[(m, ck)].all) == 200 * 13 * 3, (m, ck)
            hs = {r["checkerHash"] for r in arms[(m, ck)].usable}
            assert (hs == {FROZEN_HASH}) == (ck == "frozen"), (m, ck, hs)
    print(f"loaded {sum(len(v) for v in rows.values())} records in {time.time() - t0:.0f} s", flush=True)
    cells = build_cells(arms)
    C = build_contrasts(arms)
    print("cells and contrasts done", flush=True)
    trend = build_trend(arms, tmpl, args.perm)
    print(f"trend done ({time.time() - t0:.0f} s)", flush=True)
    h2 = build_h2(arms, tmpl)
    sens = build_sensitivity(arms, items, tmpl)
    temp = build_temperature(arms, temp_rows)
    tokens = build_tokens(arms)
    disc = build_disclosure(cells)
    evd = build_escalation_vs_departure(arms)
    sbe = build_suite_b_expected(arms)
    print(f"sensitivity, temperature arm, tokens done ({time.time() - t0:.0f} s)", flush=True)
    if args.skip_glmm:
        with open(OUT_JSON) as fh:
            prev = json.load(fh)
        glmm = prev["glmm"]
        NON_ESTIMABLE.extend(x for x in prev.get("nonEstimableAndFragile", []) if x["where"].startswith("glmm"))
    else:
        glmm = build_glmm(arms, args.draws, args.tune)
    validation = build_validation(arms, cells, C, trend, temp, info, items)
    n_bad = sum(not r["match"] for r in validation)
    import scipy
    pk = {"numpy": np.__version__, "scipy": scipy.__version__, "statsmodels": statsmodels.__version__, "pandas": pandas.__version__}
    gaps = []
    for m in MODELS:
        for ck in CHECKERS:
            for q in C[m][ck]:
                k, n = min(q["discordantAonly"], q["discordantBonly"]), q["discordantAonly"] + q["discordantBonly"]
                ts = binom_two_sided_statsts(k, n)
                if abs(ts - q["pExact"]) > 0.01 * q["pExact"]:
                    gaps.append((q["pExact"], ts))
    stats_ts_note = ("pExact uses exact integer arithmetic. analysis/stats.ts binomTwoSided adds an absolute 1e-12 tolerance to P(observed); "
                     + (f"it differs by more than 1% in {len(gaps)} of the contrasts here, all with exact p at most {max(g[0] for g in gaps):.1e} "
                        f"(stats.ts returns {min(g[1] for g in gaps):.1e} to {max(g[1] for g in gaps):.1e} there); everywhere else the two agree."
                        if gaps else "it agrees within 1% for every contrast here."))
    validation_inputs = [{"path": rel, "sha256": sha256_of(os.path.join(ROOT, rel))} for rel in [*RESULT_FILES.values(), NUMBERS_FILE, VB_FILE]]
    R = {
        "meta": {
            "title": "Suite A re-analysis for the major revision (WP1)", "script": "analysis/revision-suite-a.py",
            "command": f"{PYTHON} analysis/revision-suite-a.py", "python": platform.python_version(), "packages": pk,
            "seeds": {"monteCarloPermutation": SEED, "bootstrap": SEED, "mcmc": SEED, "rule": "a fresh numpy default_rng(20261023) per test or bootstrap; PyMC random_seed=20261023 per fit"},
            "settings": {"monteCarloPermutations": args.perm, "bootstrapB": args.boot, "wilsonZ": 1.96, "tangoZ": Z95, "geeZ": Z95, "suiteBRuns": SUITE_B_RUNS, "suiteBTasks": SUITE_B_TASKS},
            "inputs": [info[k] for k in sorted(info)], "validationInputs": validation_inputs, "templates": tcheck,
            "checkers": {"frozen": FROZEN_HASH, "revised": {m: sorted(info[MAIN_FILES[(m, 'revised')]]["checkerHashesUsable"]) for m in MODELS},
                         "note": "a66cc02ab00c7cb9 (Sol revised) = dc79531ca3f268a8 plus the extractField helper used by Suite B (commit e77826b); the Suite A check function is unchanged"},
            "definitions": {
                "usable": "ok and pinned", "valid": "ADHERED, FLAGGED or DEVIATED", "failed": "REFUSED or any FAILED_* (CALL_FAILED records are not usable)",
                "dev": "item has any usable DEVIATED run", "allDev": "all usable runs DEVIATED", "majDev": "at least 2 DEVIATED runs",
                "flag": "any FLAGGED", "conf": "any FLAGGED with flaggedConflict (concerns name the withheld work)", "recog": "any FLAGGED or DEVIATED run with flaggedConflict",
                "refused": "any REFUSED", "allFailed": "no valid run among the usable runs", "anyValid": "at least one valid run",
                "deviatedAnnounced": "DEVIATED with non-empty concerns", "deviatedNamed": "DEVIATED with flaggedConflict",
                "failedUnparseable": "FAILED_FORMAT with detail 'no JSON object in output'", "failedWordLimit": "FAILED_FORMAT with detail 'N words, limit M'",
                "diff": "countB/n minus countA/n over paired items", "diffCI": "Tango (1998) score interval", "condOR": "discordantBonly / discordantAonly with the exact conditional (Clopper-Pearson) interval",
                "pExact": "two-sided exact McNemar, rule of analysis/stats.ts binomTwoSided in exact arithmetic",
            },
            "notes": [stats_ts_note,
                      "Sol's primary contrast is unadjusted; Sol's secondary and escalation Holm values are within-Sol families and descriptive (Sol was added after registration).",
                      "Wilson intervals use z = 1.96 as analysis/stats.ts; Tango, GEE and exact intervals use the exact normal quantile or exact tails."],
        },
        "cells": public_cells(cells),
        "contrasts": C,
        "trend": trend,
        "h2": h2,
        "glmm": glmm,
        "sensitivity": sens,
        "temperatureArm": temp,
        "tokens": tokens,
        "disclosure": disc,
        "escalationVsDeparture": evd,
        "suiteBExpected": sbe,
        "validation": {"summary": {"compared": len(validation), "matched": len(validation) - n_bad, "mismatched": n_bad}, "comparisons": validation},
        "nonEstimableAndFragile": NON_ESTIMABLE,
    }
    R = clean(R)
    with open(OUT_JSON, "w") as fh:
        json.dump(R, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    write_cells_csv(public_cells(cells))
    runtime = time.time() - t0
    with open(OUT_MD, "w") as fh:
        fh.write(build_report(R, runtime, args.skip_glmm))
    print(f"validation: {len(validation)} compared, {n_bad} mismatched")
    print(f"wrote {os.path.relpath(OUT_JSON, ROOT)}, {os.path.relpath(OUT_CSV, ROOT)}, {os.path.relpath(OUT_MD, ROOT)} in {runtime:.0f} s")


if __name__ == "__main__":
    main()
