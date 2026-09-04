"""Supporting analysis from PROTOCOL.md section 8: mixed-effects logistic regression of DEVIATED (run level)
on the visibility dose, with item random intercepts crossed with model and an item random slope for dose,
fitted by variational Bayes with weakly informative priors (statsmodels BinomialBayesMixedGLM), because
V0 cells have zero events and R is not installed on this machine.
Run: <statsenv>/bin/python visibility-paper/analysis/glmm.py  (writes analysis/suite-a-glmm.json)"""
import json, sys, os
import numpy as np, pandas as pd
from statsmodels.genmod.bayes_mixed_glm import BinomialBayesMixedGLM
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = []
for line in open(os.path.join(ROOT, "runs", "suite-a.jsonl")):
    r = json.loads(line)
    if not (r.get("ok") and r.get("pinned")): continue
    rows.append({"item": r["item"], "model": r["model"], "cond": r["condition"], "draw": r["draw"], "dev": int(r["verdict"] == "DEVIATED"), "flag": int(r["verdict"] == "FLAGGED")})
df = pd.DataFrame(rows)
DOSE = {"V0": 0, "V1": 1, "V2": 2, "V3": 3, "V4": 4}
out = {"n_runs": len(df), "models": {}}
def fit(name, d, formula, vc, note):
    d = d.copy(); d["item_model"] = d["item"] + ":" + d["model"]
    m = BinomialBayesMixedGLM.from_formula(formula, vc, d, vcp_p=0.5, fe_p=2.0)
    res = m.fit_vb()
    fe = {n: {"mean": float(res.fe_mean[i]), "sd": float(res.fe_sd[i])} for i, n in enumerate(res.model.exog_names)}
    vcp = {n: {"mean_log_sd": float(res.vcp_mean[i]), "sd": float(res.vcp_sd[i])} for i, n in enumerate(res.model.exog_vc.names)} if hasattr(res.model.exog_vc, "names") else {}
    out["models"][name] = {"formula": formula, "vc": vc, "n": int(len(d)), "events": int(d["dev"].sum()), "fixed": fe, "variance_components": vcp, "note": note}
    print(f"\n## {name}: {note}\n{formula}; n={len(d)}, events={int(d['dev'].sum())}")
    for n, v in fe.items(): print(f"- {n}: {v['mean']:+.3f} (sd {v['sd']:.3f}); odds ratio {np.exp(v['mean']):.2f}")
    for n, v in vcp.items(): print(f"- vc {n}: log sd {v['mean_log_sd']:+.2f} (sd {v['sd']:.2f})")
# 1. Dose model on V0..V4 (numeric dose, model, interaction), item random intercept crossed with model, item random slope for dose
d1 = df[df["cond"].isin(DOSE)].copy(); d1["dose"] = d1["cond"].map(DOSE).astype(float); d1["muse"] = (d1["model"] == "muse").astype(float)
fit("dose_numeric", d1, "dev ~ dose * muse", {"item": "0 + C(item)", "item_model": "0 + C(item_model)", "item_dose": "0 + C(item):dose"}, "numeric dose 0..4 by model, item intercept, item-by-model intercept, item slope for dose")
# 2. Factor version of the rung
fit("dose_factor", d1, "dev ~ C(cond, Treatment('V0')) * muse", {"item": "0 + C(item)", "item_model": "0 + C(item_model)"}, "rung as a factor by model, item intercept, item-by-model intercept")
# 3. Content versus length for the V2/V4 and LM/HM cells: content (hierarchical conflicting = V, hierarchical non-conflicting = HM, filler = LM) crossed with length (2 vs 4)
d3 = df[df["cond"].isin(["V2", "V4", "LM2", "LM4", "HM2", "HM4"])].copy(); d3["content"] = d3["cond"].str.replace(r"\d", "", regex=True).map({"V": "conflict", "HM": "hierarchy", "LM": "filler"}); d3["long"] = d3["cond"].str.endswith("4").astype(float); d3["muse"] = (d3["model"] == "muse").astype(float)
fit("content_by_length", d3, "dev ~ C(content, Treatment('filler')) * long + muse", {"item": "0 + C(item)", "item_model": "0 + C(item_model)"}, "content (filler, hierarchy, conflict) crossed with length, plus model")
# 4. FLAGGED as outcome (H3) on the dose cells
d4 = d1.copy(); d4["dev"] = d4["flag"]
fit("flag_dose_numeric", d4, "dev ~ dose * muse", {"item": "0 + C(item)", "item_model": "0 + C(item_model)"}, "FLAGGED as outcome, numeric dose by model")
json.dump(out, open(os.path.join(ROOT, "analysis", "suite-a-glmm.json"), "w"), indent=1)
print("\nGLMM_OK")
