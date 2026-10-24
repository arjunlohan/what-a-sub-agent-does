"""Stimulus template of every Suite A item, reconstructed by analysis/revision-suite-a.py (template_of), with counts per
domain. Writes analysis/item-templates.json. Run: <statsenv>/bin/python analysis/item-templates.py"""
import importlib.util, json, os
from collections import Counter
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
spec = importlib.util.spec_from_file_location("rsa", os.path.join(ROOT, "analysis", "revision-suite-a.py")); rsa = importlib.util.module_from_spec(spec); spec.loader.exec_module(rsa)
items = rsa.load_items(); tmpl = {i: rsa.template_of(it) for i, it in items.items()}
per = {d: len({tmpl[i] for i, it in items.items() if it["domain"] == d}) for d in sorted({it["domain"] for it in items.values()})}
json.dump({"templates": len(set(tmpl.values())), "perDomain": per, "itemsPerTemplate": dict(Counter(tmpl.values())), "item": tmpl}, open(os.path.join(ROOT, "analysis", "item-templates.json"), "w"), indent=1)
print(len(set(tmpl.values())), per)
