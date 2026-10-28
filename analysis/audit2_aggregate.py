"""Aggregate the blinded audit (analysis/audit2.ts; DECISIONS.md, 2026-10-23).

Reads runs/audit2-sample.json (strata and population sizes), runs/audit2-judgements.json (both judges, every record),
runs/audit2-human.json and runs/audit2-human-map.json when present (the author's labels), and the earlier unblinded audit
(analysis/suite-a-audit.json). Writes analysis/audit2.json. Deterministic (bootstrap seed 20261023).

Reference standard: the author's label where one exists; otherwise the two judges' verdict where they agree. Records the
two judges split on, with no author label, are reported and excluded from rates that need a reference.
Run: /Users/lohan/Downloads/GitHub/visibility-statsenv/bin/python analysis/audit2_aggregate.py
"""
import json, os
from collections import Counter, defaultdict
import numpy as np
from scipy import stats

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
R = lambda *p: os.path.join(ROOT, *p)
CLASSES = ["ADHERED", "FLAGGED", "DEVIATED", "REFUSED", "FAILED"]
MODELS = ["deepseek", "muse", "sol"]
DEFECTIVE_ITEM, SUBHEADING_ITEM = "ACE-16", "ASU-28"  # the defective item, and the item whose nested subheadings the checker misread
rng = np.random.default_rng(20261023)


def norm(v):
    return "FAILED" if v.startswith("FAILED") else v


def kappa(a, b, classes=CLASSES):
    a, b = list(a), list(b)
    n = len(a)
    if n == 0:
        return None
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[c] * cb[c] for c in classes) / (n * n)
    return None if pe >= 1 else (po - pe) / (1 - pe)


def kappa_ci(a, b, classes=CLASSES, B=2000):
    a, b = np.array(a, dtype=object), np.array(b, dtype=object)
    n = len(a)
    if n < 2:
        return [None, None]
    ks = []
    for _ in range(B):
        idx = rng.integers(0, n, n)
        k = kappa(a[idx], b[idx], classes)
        if k is not None:
            ks.append(k)
    return [float(np.quantile(ks, 0.025)), float(np.quantile(ks, 0.975))] if ks else [None, None]


def cp(k, n):
    """Exact (Clopper-Pearson) 95% interval for k of n."""
    if n == 0:
        return [None, None]
    lo = 0.0 if k == 0 else stats.beta.ppf(0.025, k, n - k + 1)
    hi = 1.0 if k == n else stats.beta.ppf(0.975, k + 1, n - k)
    return [float(lo), float(hi)]


def pair(rows, fa, fb, classes=CLASSES):
    xs = [(fa(r), fb(r)) for r in rows if fa(r) is not None and fb(r) is not None]
    if not xs:
        return {"n": 0}
    a, b = zip(*xs)
    agree = sum(x == y for x, y in xs)
    return {"n": len(xs), "agree": agree, "agreement": agree / len(xs), "kappa": kappa(a, b, classes), "kappaCI": kappa_ci(a, b, classes)}


S = json.load(open(R("runs", "audit2-sample.json")))
JUDGEMENTS = json.load(open(R("runs", "audit2-judgements.json")))
J = JUDGEMENTS["judgements"]
human = {}
if os.path.exists(R("runs", "audit2-human.json")) and os.path.exists(R("runs", "audit2-human-map.json")):
    hmap = {m["rid"]: m["key"] for m in json.load(open(R("runs", "audit2-human-map.json")))}
    for rid, lab in json.load(open(R("runs", "audit2-human.json"))).items():
        if rid in hmap and lab.get("verdict"):
            human[hmap[rid]] = lab
old = {r["key"]: r for r in json.load(open(R("analysis", "suite-a-audit.json")))["rows"]}

rows = []
for x in S["records"]:
    j = J.get(x["key"], {})
    o, g = j.get("opus"), j.get("gemini")
    h = human.get(x["key"])
    r = dict(x)
    r["frozenN"], r["revisedN"] = norm(x["frozen"]), norm(x["revised"])
    r["opus"] = o["verdict"] if o else None
    r["gemini"] = g["verdict"] if g else None
    r["opusNamed"] = o["conflict_named"] if o else None
    r["geminiNamed"] = g["conflict_named"] if g else None
    r["human"] = h["verdict"] if h else None
    r["humanNamed"] = h.get("conflictNamed") if h else None
    r["consensus"] = r["opus"] if r["opus"] is not None and r["opus"] == r["gemini"] else None
    r["reference"] = r["human"] if r["human"] else r["consensus"]
    namedRef = r["humanNamed"] if h else (r["opusNamed"] if r["opusNamed"] is not None and r["opusNamed"] == r["geminiNamed"] else None)
    r["namedRef"] = namedRef
    r["old"] = old.get(x["key"], {}).get("auditVerdict")
    rows.append(r)

out = {"note": "blinded audit aggregate; see analysis/audit2_aggregate.py", "n": len(rows), "humanLabelled": len(human),
       "strata": S["strata"], "judgeStats": JUDGEMENTS["stats"]}

# 1. verdict agreement (five classes) and kappa, all records and by model
pairs = {
    "frozen_opus": ("frozenN", "opus"), "frozen_gemini": ("frozenN", "gemini"), "revised_opus": ("revisedN", "opus"),
    "revised_gemini": ("revisedN", "gemini"), "opus_gemini": ("opus", "gemini"),
    "human_frozen": ("human", "frozenN"), "human_revised": ("human", "revisedN"), "human_opus": ("human", "opus"), "human_gemini": ("human", "gemini"),
}
out["agreement"] = {}
for scope in ["all"] + MODELS:
    rs = rows if scope == "all" else [r for r in rows if r["model"] == scope]
    out["agreement"][scope] = {name: pair(rs, lambda r, a=a: r[a], lambda r, b=b: r[b]) for name, (a, b) in pairs.items()}

# 2. departure as a binary call
dep = lambda v: None if v is None else ("DEVIATED" if v == "DEVIATED" else "OTHER")
out["departureAgreement"] = {}
for scope in ["all"] + MODELS:
    rs = rows if scope == "all" else [r for r in rows if r["model"] == scope]
    out["departureAgreement"][scope] = {name: pair(rs, lambda r, a=a: dep(r[a]), lambda r, b=b: dep(r[b]), ["DEVIATED", "OTHER"]) for name, (a, b) in pairs.items()}

# 3. confirmation of checker departures (precision), by model and checker, against each reference
def confirm(rs, checker, ref):
    d = [r for r in rs if r[checker] == "DEVIATED" and r[ref] is not None]
    k = sum(r[ref] == "DEVIATED" for r in d)
    return {"n": len(d), "confirmed": k, "rate": (k / len(d)) if d else None, "ci": cp(k, len(d))}

out["checkerDepartures"] = {}
for m in MODELS:
    rs = [r for r in rows if r["model"] == m]
    out["checkerDepartures"][m] = {f"{c}_{ref}": confirm(rs, c, ref) for c in ["frozenN", "revisedN"] for ref in ["opus", "gemini", "consensus", "human", "reference"]}
    # the earlier, unblinded audit on the same records
    d = [r for r in rs if r["frozenN"] == "DEVIATED" and r["old"]]
    out["checkerDepartures"][m]["frozen_unblindedAudit"] = {"n": len(d), "confirmed": sum(r["old"] == "DEVIATED" for r in d)}

# 4. missed departures among valid non-departing records of the treated rungs (stratum S2), scaled to the population
out["missedDepartures"] = {}
for m in MODELS:
    s2 = [r for r in rows if r["model"] == m and r["stratum"] == "S2"]
    N = S["strata"][m]["S2"]["N"]
    res = {"populationN": N, "sampled": len(s2)}
    for ref in ["opus", "gemini", "consensus", "either", "human", "reference"]:
        if ref == "either":
            judged = [r for r in s2 if r["opus"] is not None and r["gemini"] is not None]
            keys = [r["key"] for r in judged if r["opus"] == "DEVIATED" or r["gemini"] == "DEVIATED"]
        else:
            judged = [r for r in s2 if r[ref] is not None]
            keys = [r["key"] for r in judged if r[ref] == "DEVIATED"]
        k = len(keys)
        lo, hi = cp(k, len(judged))
        res[ref] = {"n": len(judged), "k": k, "rate": (k / len(judged)) if judged else None, "ci": [lo, hi],
                    "estimatedMissed": (k / len(judged) * N) if judged else None, "estimatedMissedCI": [lo * N if lo is not None else None, hi * N if hi is not None else None],
                    "keys": keys}
    out["missedDepartures"][m] = res

# 5. conflict-naming: the marker rule against the judges and the author on flagged records (strata S3named, S3unnamed)
out["conflictNaming"] = {}
for m in MODELS:
    res = {}
    for st in ["S3named", "S3unnamed"]:
        rs = [r for r in rows if r["model"] == m and r["stratum"] == st]
        N = S["strata"][m][st]["N"]
        for ref, f in [("opus", lambda r: r["opusNamed"]), ("gemini", lambda r: r["geminiNamed"]), ("reference", lambda r: r["namedRef"])]:
            judged = [r for r in rs if f(r) is not None]
            k = sum(bool(f(r)) for r in judged)
            res[f"{st}_{ref}"] = {"n": len(judged), "namedByRef": k, "rate": (k / len(judged)) if judged else None, "ci": cp(k, len(judged)), "populationN": N}
    out["conflictNaming"][m] = res
# marker rule versus the judges on every record whose output has concerns the checker could read (all strata)
fcpairs = [(r["fc"], r["opusNamed"], r["geminiNamed"]) for r in rows if r["opusNamed"] is not None and r["geminiNamed"] is not None]
out["conflictNamingAll"] = {
    "n": len(fcpairs),
    "marker_vs_opus": {"agree": sum(a == b for a, b, _ in fcpairs), "kappa": kappa([a for a, _, _ in fcpairs], [b for _, b, _ in fcpairs], [True, False])},
    "marker_vs_gemini": {"agree": sum(a == c for a, _, c in fcpairs), "kappa": kappa([a for a, _, _ in fcpairs], [c for _, _, c in fcpairs], [True, False])},
    "opus_vs_gemini": {"agree": sum(b == c for _, b, c in fcpairs), "kappa": kappa([b for _, b, _ in fcpairs], [c for _, _, c in fcpairs], [True, False])},
}

# 6. records the checker revision changed, and the defective item
changed = [r for r in rows if r["frozenN"] != r["revisedN"]]
out["revisionChanged"] = [{k: r[k] for k in ["key", "frozen", "revised", "opus", "gemini", "human", "old"]} for r in changed]
out["revisionChangedSummary"] = {
    "n": len(changed),
    "consensusSidesWithFrozen": sum(r["consensus"] == r["frozenN"] for r in changed),
    "consensusSidesWithRevised": sum(r["consensus"] == r["revisedN"] for r in changed),
    "consensusOther": sum(r["consensus"] is not None and r["consensus"] not in (r["frozenN"], r["revisedN"]) for r in changed),
    "split": sum(r["consensus"] is None for r in changed),
    "byItem": dict(Counter(r["item"] for r in changed)),
}
ace16 = [r for r in rows if r["item"] == DEFECTIVE_ITEM]
out["ace16"] = [{k: r[k] for k in ["key", "frozen", "opus", "gemini", "human"]} for r in ace16]

# 7. per-class precision and recall of the checker against the reference (sample-level; strata are not proportional)
def prf(rs, checker):
    res = {}
    for c in CLASSES:
        tp = sum(r[checker] == c and r["reference"] == c for r in rs)
        fp = sum(r[checker] == c and r["reference"] not in (None, c) for r in rs)
        fn = sum(r[checker] != c and r["reference"] == c for r in rs)
        res[c] = {"tp": tp, "fp": fp, "fn": fn, "precision": tp / (tp + fp) if tp + fp else None, "recall": tp / (tp + fn) if tp + fn else None}
    return res

out["perClass"] = {"reference": {c: prf(rows, c) for c in ["frozenN", "revisedN"]}}
if human:
    hr = [dict(r, reference=r["human"]) for r in rows if r["human"]]
    out["perClass"]["human"] = {c: prf(hr, c) for c in ["frozenN", "revisedN"]}

# 8. disagreement listings for review (judges reject a checker departure; judges find a departure the checker missed)
out["listings"] = {
    "checkerDepartureRejectedByConsensus": [r["key"] for r in rows if r["frozenN"] == "DEVIATED" and r["consensus"] not in (None, "DEVIATED")],
    "checkerDepartureSplit": [r["key"] for r in rows if r["frozenN"] == "DEVIATED" and r["consensus"] is None],
    "consensusDepartureCheckerMissed": [r["key"] for r in rows if r["consensus"] == "DEVIATED" and r["frozenN"] != "DEVIATED"],
    "eitherJudgeDepartureCheckerMissed": [r["key"] for r in rows if (r["opus"] == "DEVIATED" or r["gemini"] == "DEVIATED") and r["frozenN"] != "DEVIATED"],
}
out["verdictTables"] = {name: {f"{a}->{b}": n for (a, b), n in Counter((r[x], r[y]) for r in rows if r[x] and r[y]).items()} for name, (x, y) in [("frozen_vs_consensus", ("frozenN", "consensus")), ("frozen_vs_opus", ("frozenN", "opus")), ("frozen_vs_gemini", ("frozenN", "gemini")), ("frozen_vs_human", ("frozenN", "human"))]}

# 9. extension set b: every word-limit failure (both judges) and the flagged records judged for conflict naming (one judge)
setb = {}
if os.path.exists(R("runs", "audit2b-prompts.jsonl")):
    for line in open(R("runs", "audit2b-prompts.jsonl")):
        p = json.loads(line)
        setb[p["key"]] = p["set"]
setc = set()
if os.path.exists(R("runs", "audit2c-prompts.jsonl")):
    setc = {json.loads(line)["key"] for line in open(R("runs", "audit2c-prompts.jsonl")) if line.strip()}
# the one-judge censuses: set b's flagged records and set c (Gemini on every record, Opus where Gemini differs)
ONE_JUDGE = {k for k, s in setb.items() if s == "FLAG"} | setc

def load_records():
    """Frozen and revised verdicts of every usable Suite A record (all three models)."""
    recs = {}
    for fz, rv in [("suite-a.jsonl", "suite-a.rescored.jsonl"), ("suite-a-sol.frozen.jsonl", "suite-a-sol.rescored.jsonl")]:
        rev = {}
        for line in open(R("runs", rv)):
            r = json.loads(line)
            if r.get("ok") and r.get("pinned"):
                rev[r["key"]] = r["verdict"]
        for line in open(R("runs", fz)):
            r = json.loads(line)
            if r.get("ok") and r.get("pinned"):
                recs[r["key"]] = {"model": r["model"], "cond": r["condition"], "item": r["item"], "domain": r["domain"], "frozen": r["verdict"], "detail": r.get("verdictDetail") or "", "revised": rev[r["key"]], "fc": bool(r.get("flaggedConflict"))}
    return recs

REC = load_records()
is_wl = lambda k: REC[k]["frozen"] == "FAILED_FORMAT" and "words, limit" in REC[k]["detail"]  # failed only its word limit


def item_any(keys, hit):
    """Item-level indicator over the records in keys: 1 for an item where any record satisfies hit."""
    d = defaultdict(int)
    for k in keys:
        d[REC[k]["item"]] = max(d[REC[k]["item"]], int(hit(k)))
    return d


wl_keys = [k for k in REC if is_wl(k)]
wl = {"byModel": {}}
for m in MODELS:
    ks = [k for k in wl_keys if REC[k]["model"] == m]
    judged = [k for k in ks if J.get(k, {}).get("opus") and J.get(k, {}).get("gemini")]
    both = [k for k in judged if J[k]["opus"]["verdict"] == "DEVIATED" and J[k]["gemini"]["verdict"] == "DEVIATED"]
    either = [k for k in judged if J[k]["opus"]["verdict"] == "DEVIATED" or J[k]["gemini"]["verdict"] == "DEVIATED"]
    disclosed = [k for k in both if J[k]["opus"].get("departure_disclosed") and J[k]["gemini"].get("departure_disclosed")]
    named = [k for k in both if J[k]["opus"].get("conflict_named") and J[k]["gemini"].get("conflict_named")]
    wl["byModel"][m] = {"wordLimitFailures": len(ks), "judgedByBoth": len(judged), "departureBoth": len(both), "departureEither": len(either), "disclosedBoth": len(disclosed), "namedBoth": len(named),
                        "byCell": dict(Counter(REC[k]["cond"] for k in both)), "byDomain": dict(Counter(REC[k]["domain"] for k in both))}
out["wordLimitFailures"] = wl

# 10. adjudicated verdicts: the author's label where present, else the two judges where they agree, else the frozen
#     checker. They draw on the sample and the word-limit census, which both judges classified in every cell; the
#     one-judge censuses cover some cells only and keep the checker verdict here (their corrections: section 13)
def adjudicated(k):
    v = REC[k]
    h = human.get(k)
    if h:
        return h["verdict"], "author"
    j = J.get(k, {})
    o, g = j.get("opus"), j.get("gemini")
    if o and g and o["verdict"] == g["verdict"] and k not in ONE_JUDGE:
        return o["verdict"], "judges"
    return norm(v["frozen"]), "checker"

ADJ = {k: adjudicated(k) for k in REC}
out["adjudicatedSources"] = dict(Counter(src for _, src in ADJ.values()))
out["adjudicatedChanges"] = {m: dict(Counter(f"{norm(REC[k]['frozen'])}->{ADJ[k][0]}" for k in REC if REC[k]["model"] == m and ADJ[k][0] != norm(REC[k]["frozen"]))) for m in MODELS}

# item-level departure indicators per cell under the adjudicated verdicts, and the primary contrast
def item_ind(model, cond, verdict_of):
    return item_any([k for k, v in REC.items() if v["model"] == model and v["cond"] == cond], lambda k: verdict_of(k) == "DEVIATED")

def mcnemar(a, b):
    items = sorted(set(a) & set(b))
    b10 = sum(a[i] == 1 and b[i] == 0 for i in items); b01 = sum(a[i] == 0 and b[i] == 1 for i in items)
    n = b10 + b01
    p = 1.0 if n == 0 else min(1.0, 2 * stats.binom.cdf(min(b10, b01), n, 0.5))
    return {"n": len(items), "a": sum(a[i] for i in items), "b": sum(b[i] for i in items), "aOnly": b10, "bOnly": b01, "p": p}

cells = ["V0", "V1", "V2", "V3", "V4", "LM2", "LM4", "HM2", "HM4", "V2N", "V2P", "V4L", "LML"]
adj, dev_ind = {}, {}
for m in MODELS:
    ind = dev_ind[m] = {c: item_ind(m, c, lambda k: ADJ[k][0]) for c in cells}
    adj[m] = {"items": {c: sum(ind[c].values()) for c in cells},
              "runs": {c: sum(1 for k, v in REC.items() if v["model"] == m and v["cond"] == c and ADJ[k][0] == "DEVIATED") for c in cells},
              "primary": mcnemar(ind["V0"], ind["V4"]), "HM4_V4": mcnemar(ind["HM4"], ind["V4"]), "LM4_V4": mcnemar(ind["LM4"], ind["V4"]),
              "HM2_V2": mcnemar(ind["HM2"], ind["V2"]), "LM2_V2": mcnemar(ind["LM2"], ind["V2"]),
              "byDomainV4": dict(Counter(REC[k]["domain"] for k in REC if REC[k]["model"] == m and REC[k]["cond"] == "V4" and ADJ[k][0] == "DEVIATED"))}
ps = [adj[m]["primary"]["p"] for m in ["deepseek", "muse"]]
order = np.argsort(ps); holm = [None, None]; running = 0.0
for rank, i in enumerate(order):
    running = max(running, min(1.0, (2 - rank) * ps[i])); holm[i] = running
adj["deepseek"]["primary"]["pHolm"], adj["muse"]["primary"]["pHolm"] = holm
out["adjudicatedDepartures"] = adj

# 11. escalation re-measured by the judges: an adjudicated FLAGGED run whose concerns the judge(s) say name the withheld
#     work. Census cells (every FLAGGED record judged): V0, V2, V4, LM2, LM4, HM2, HM4. A sampled record uses both
#     judges' agreement (a split counts as not named); a census record uses the census judge, Gemini.
def judge_named(k):
    j = J.get(k, {})
    o, g = j.get("opus"), j.get("gemini")
    h = human.get(k)
    if h:
        return bool(h.get("conflictNamed"))
    if k in ONE_JUDGE and g:
        return bool(g["conflict_named"])
    if o and g:
        return bool(o["conflict_named"] and g["conflict_named"])
    if g:
        return bool(g["conflict_named"])
    if o:
        return bool(o["conflict_named"])
    return None

def wilson(k, n):
    if n == 0:
        return [None, None]
    z = 1.959963984540054; ph = k / n; den = 1 + z * z / n
    c = (ph + z * z / (2 * n)) / den; h = z * ((ph * (1 - ph) / n + z * z / (4 * n * n)) ** 0.5) / den
    return [c - h, c + h]

census_cells = ["V0", "V2", "V4", "LM2", "LM4", "HM2", "HM4"]
esc = {}
for m in MODELS:
    keys = {c: [k for k, v in REC.items() if v["model"] == m and v["cond"] == c] for c in census_cells}
    coverage = {c: {"flagged": sum(ADJ[k][0] == "FLAGGED" for k in keys[c]), "flaggedJudged": sum(ADJ[k][0] == "FLAGGED" and judge_named(k) is not None for k in keys[c])} for c in census_cells}
    marker = lambda k: REC[k]["frozen"] == "FLAGGED" and REC[k]["fc"]
    judged = lambda k: ADJ[k][0] == "FLAGGED" and bool(judge_named(k))
    res = {"coverage": coverage}
    for name, f in [("marker", marker), ("judge", judged)]:
        I = {c: item_any(keys[c], f) for c in census_cells}
        res[name] = {"items": {c: sum(I[c].values()) for c in census_cells}, "runs": {c: sum(int(f(k)) for k in keys[c]) for c in census_cells},
                     "V0_V4": mcnemar(I["V0"], I["V4"]), "HM4_V4": mcnemar(I["HM4"], I["V4"]), "LM4_V4": mcnemar(I["LM4"], I["V4"]), "HM2_V2": mcnemar(I["HM2"], I["V2"]), "LM2_V2": mcnemar(I["LM2"], I["V2"])}
        for c in census_cells:
            res[name].setdefault("wilson", {})[c] = wilson(res[name]["items"][c], 200)
    # escalation versus departure, both adjudicated: paired item-level change V0 -> V4
    Iesc0, Iesc4 = item_any(keys["V0"], judged), item_any(keys["V4"], judged)
    Idev0, Idev4 = dev_ind[m]["V0"], dev_ind[m]["V4"]
    items_all = sorted(set(Iesc0) & set(Iesc4) & set(Idev0) & set(Idev4))
    dd = np.array([(Iesc4[i] - Iesc0[i]) - (Idev4[i] - Idev0[i]) for i in items_all], dtype=float)
    boots = [dd[rng.integers(0, len(dd), len(dd))].mean() for _ in range(10000)]
    pos, neg = int((dd > 0).sum()), int((dd < 0).sum())
    res["escalationMinusDeparture"] = {"n": len(items_all), "mean": float(dd.mean()), "ci": [float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975))],
                                       "signTest": {"pos": pos, "neg": neg, "p": float(min(1.0, 2 * stats.binom.cdf(min(pos, neg), pos + neg, 0.5))) if pos + neg else 1.0}}
    esc[m] = res
out["escalationJudged"] = esc

# 11b. the pre-specified checker's departure errors against the author's labels: false departures by item, and missed
#      departures that the checker had scored as word-limit failures
if human:
    hr = [r for r in rows if r["human"]]
    fp = [r for r in hr if r["frozenN"] == "DEVIATED" and r["human"] != "DEVIATED"]
    fn = [r for r in hr if r["human"] == "DEVIATED" and r["frozenN"] != "DEVIATED"]
    out["humanDepartureErrors"] = {"falseDepartures": len(fp), "falseDeparturesByItem": dict(Counter(r["item"] for r in fp)),
                                   "missedDepartures": len(fn), "missedWordLimit": sum(is_wl(r["key"]) for r in fn),
                                   "missed": [{k: r[k] for k in ["key", "item", "frozen"]} for r in fn]}
    # the other classes' errors: failures the author did not label as failures, and adherence the checker scored otherwise
    ff = [r for r in hr if r["frozenN"] == "FAILED" and r["human"] != "FAILED"]
    ma = [r for r in hr if r["human"] == "ADHERED" and r["frozenN"] != "ADHERED"]
    out["humanOtherErrors"] = {"falseFailures": len(ff), "falseFailuresDefectiveItem": sum(r["item"] == DEFECTIVE_ITEM for r in ff),
                               "falseFailuresWordLimitDepartures": sum(is_wl(r["key"]) and r["human"] == "DEVIATED" for r in ff),
                               "missedAdherence": len(ma), "missedAdherenceAsu28": sum(r["item"] == SUBHEADING_ITEM and r["frozenN"] == "DEVIATED" for r in ma),
                               "missedAdherenceDefectiveItem": sum(r["item"] == DEFECTIVE_ITEM for r in ma)}

# 12. per-record adjudicated verdicts for the Suite A re-analysis (analysis/revision-suite-a-adjudicated.py): every record
#     whose verdict the audit changes, and every FLAGGED record whose conflict naming a judge or the author coded
export = {}
for k, v in REC.items():
    verdict, src = ADJ[k]
    named = judge_named(k) if (verdict == "FLAGGED" and (J.get(k) or human.get(k))) else None
    if verdict != norm(v["frozen"]) or named is not None:
        export[k] = {"verdict": verdict, "source": src, "named": named}

# 13. the one-judge censuses: a correction is a census record on which both judges agree on a verdict other than the
#     checker's (Opus judged exactly the records where Gemini differs, so these equal a two-judge census's). Corrections
#     are applied only in the census check of the contrasts whose cells both censuses cover, V0, V4, LM4 and HM4
#     (analysis/revision-suite-a-adjudicated.py --census).
CENSUS_CHECK_CELLS = ["V0", "V4", "LM4", "HM4"]
census, corrections = {}, {}
for name, keys in [("flagged", sorted(k for k, s in setb.items() if s == "FLAG")), ("summaries", sorted(setc))]:
    census[name] = {}
    for m in MODELS:
        ks = [k for k in keys if REC[k]["model"] == m]
        gj = [k for k in ks if J.get(k, {}).get("gemini")]
        gd = [k for k in gj if J[k]["gemini"]["verdict"] != norm(REC[k]["frozen"])]
        oj = [k for k in gd if J[k].get("opus")]
        both = [k for k in oj if J[k]["opus"]["verdict"] == J[k]["gemini"]["verdict"]]
        deps = [k for k in both if J[k]["gemini"]["verdict"] == "DEVIATED"]
        census[name][m] = {"records": len(ks), "byCell": dict(Counter(REC[k]["cond"] for k in ks)), "geminiJudged": len(gj),
                           "geminiDiffers": dict(Counter(J[k]["gemini"]["verdict"] for k in gd)), "opusJudged": len(oj),
                           "corrected": dict(Counter(J[k]["gemini"]["verdict"] for k in both)), "correctedDepartures": len(deps),
                           "correctedDeparturesByCell": dict(Counter(REC[k]["cond"] for k in deps)),
                           "correctedDeparturesByDomain": dict(Counter(REC[k]["domain"] for k in deps)),
                           "correctedDepartureItems": sorted({REC[k]["item"] for k in deps})}
        for k in both:
            corrections[k] = {"verdict": J[k]["gemini"]["verdict"], "source": "census", "named": bool(J[k]["gemini"]["conflict_named"])}
out["census"] = census

json.dump({"note": "audit-adjudicated verdicts (author label, else both judges agreeing, else the frozen checker) and judge-coded conflict naming; analysis/audit2_aggregate.py",
           "censusCells": census_cells, "censusCheckCells": CENSUS_CHECK_CELLS, "humanLabels": len(human), "records": export,
           "censusCorrections": corrections}, open(R("analysis", "audit2-adjudicated.json"), "w"), indent=0)

json.dump(out, open(R("analysis", "audit2.json"), "w"), indent=1, default=float)
print(json.dumps({"n": out["n"], "human": out["humanLabelled"], "agreeAll": {k: round(v["agreement"], 3) for k, v in out["agreement"]["all"].items() if v.get("n")},
                  "kappaAll": {k: round(v["kappa"], 3) for k, v in out["agreement"]["all"].items() if v.get("n") and v["kappa"] is not None},
                  "depKappaAll": {k: round(v["kappa"], 3) for k, v in out["departureAgreement"]["all"].items() if v.get("n") and v["kappa"] is not None},
                  "revisionChanged": out["revisionChangedSummary"]}, indent=1))
