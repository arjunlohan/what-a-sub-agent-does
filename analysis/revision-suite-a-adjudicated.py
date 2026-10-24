"""Suite A re-analysis under the audit-adjudicated verdicts (major revision, 2026-10-23; DECISIONS.md).

Applies the per-record verdicts of analysis/audit2-adjudicated.json (the author's label, else the two blinded judges where
they agree, else the frozen checker) to the frozen-checker records, and runs the builders of analysis/revision-suite-a.py
unchanged on the result: primary and registered secondary departure contrasts, the departure trend (exact permutation
and GEE), the dose x model interaction, escalation contrasts, escalation minus departure, leave-one-domain-out, and the
Suite B projection. Conflict naming is the judges' coding where they coded it (every FLAGGED record in the census cells
V0, V2, V4, LM2, LM4, HM2, HM4) and the marker rule elsewhere, so escalation contrasts are reported for census cells only.
Writes analysis/revision-suite-a-adjudicated.json. Deterministic (seed 20261023).

With --census, the census check: the same verdicts plus the corrections of the one-judge censuses (records where both
judges agree on another verdict than the checker's; analysis/audit2_aggregate.py section 13), reported only for the
contrasts whose two cells both censuses cover (V0, V4, LM4, HM4) and for escalation minus departure from V0 to V4; Holm
is kept for the primary family alone. Writes analysis/revision-suite-a-census.json.
Run: /Users/lohan/Downloads/GitHub/visibility-statsenv/bin/python analysis/revision-suite-a-adjudicated.py [--census]
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
spec = importlib.util.spec_from_file_location("rsa", os.path.join(ROOT, "analysis", "revision-suite-a.py"))
rsa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rsa)

CHECK = "--census" in sys.argv
CK = "census" if CHECK else "adjudicated"
ADJ = json.load(open(os.path.join(ROOT, "analysis", "audit2-adjudicated.json")))
CENSUS = set(ADJ["censusCells"])
CHECK_CELLS = set(ADJ["censusCheckCells"])
OVERRIDES = {**ADJ["records"], **(ADJ["censusCorrections"] if CHECK else {})}
VMAP = {"ADHERED": "ADHERED", "FLAGGED": "FLAGGED", "DEVIATED": "DEVIATED", "REFUSED": "REFUSED", "FAILED": "FAILED_ADJUDICATED"}


def apply(rows):
    changed = 0
    for x in rows:
        a = OVERRIDES.get(x["key"])
        if not a:
            continue
        v = VMAP[a["verdict"]]
        changed += v != x["verdict"]
        x["verdict"] = v
        rsa.set_verdict_flags(x, v, bool(a["named"] if a["named"] is not None else x["fc"]))
    return changed


def main():
    rows_main, _ = rsa.load_jsonl("runs/suite-a.jsonl")
    rows_sol, _ = rsa.load_jsonl("runs/suite-a-sol.frozen.jsonl")
    rows = rows_main + rows_sol
    changed = apply(rows)
    arms = {(m, CK): rsa.Arm(m, CK, rows) for m in rsa.MODELS}
    items = rsa.load_items()
    tmpl = {i: rsa.template_of(it) for i, it in items.items()}
    one = (CK,)
    contrasts = rsa.build_contrasts(arms, checkers=one)
    if CHECK:
        for m in rsa.MODELS:
            qs = [q for q in contrasts[m][CK] if q["a"] in CHECK_CELLS and q["b"] in CHECK_CELLS]
            for q in qs:
                if q["family"] != "primary":  # only part of each Holm family is here, so its adjustment and note go
                    q.pop("pHolm", None), q.pop("holm12", None), q.pop("note", None)
            contrasts[m][CK] = qs
        out = {"note": __doc__.splitlines()[0] + " Census check (--census).",
               "source": {"adjudicated": "analysis/audit2-adjudicated.json", "humanLabels": ADJ["humanLabels"], "censusCorrections": len(ADJ["censusCorrections"]), "verdictsChanged": changed},
               "cells": {m: {c: rsa.cell_stats(arms[(m, CK)], c) for c in sorted(CHECK_CELLS)} for m in rsa.MODELS},
               "contrasts": contrasts, "escalationVsDeparture": rsa.build_escalation_vs_departure(arms, checkers=one)}
        name = "revision-suite-a-census.json"
    else:
        # escalation contrasts are meaningful only where conflict naming was coded by the judges (census cells)
        for m in rsa.MODELS:
            contrasts[m][CK] = [q for q in contrasts[m][CK] if q["measure"] == "dev" or (q["a"] in CENSUS and q["b"] in CENSUS)]
        # the conf and flag trends cross V1 and V3, where naming is the marker rule: departures only
        trend = rsa.build_trend(arms, tmpl, rsa.N_PERM, checkers=one, measures=("dev",))
        out = {
            "note": __doc__.splitlines()[0],
            "source": {"adjudicated": "analysis/audit2-adjudicated.json", "humanLabels": ADJ["humanLabels"], "recordsOverridden": len(ADJ["records"]), "verdictsChanged": changed},
            "cells": {m: {c: rsa.cell_stats(arms[(m, CK)], c) for c in rsa.CONDS} for m in rsa.MODELS},
            "contrasts": contrasts,
            "trend": trend,
            "h2": rsa.build_h2(arms, tmpl, checkers=one),
            "escalationVsDeparture": rsa.build_escalation_vs_departure(arms, checkers=one),
            "suiteBExpected": rsa.build_suite_b_expected(arms, checkers=one),
            "sensitivity": {"leaveOneDomainOut": rsa.build_sensitivity(arms, items, tmpl, checkers=one, lodo_only=True)["leaveOneDomainOut"]},
        }
        name = "revision-suite-a-adjudicated.json"
    with open(os.path.join(ROOT, "analysis", name), "w") as fh:
        json.dump(rsa.clean(out), fh, indent=1, sort_keys=False)
    prim = {m: next(q for q in contrasts[m][CK] if q["family"] == "primary") for m in rsa.MODELS}
    print(json.dumps({"verdictsChanged": changed, "primary": {m: [prim[m]["countA"], prim[m]["countB"], prim[m]["pExact"], prim[m]["pHolm"]] for m in rsa.MODELS}}, default=str))


if __name__ == "__main__":
    main()
