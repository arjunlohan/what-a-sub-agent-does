"""Suite A items that reuse pilot input material (revision, 2026-10-23; reviewer question on the 30 pilot items).

The 30 pilot items (probes/items) are not among the 200 Suite A items (probes/items-suite-a), but some Suite A items reuse
pilot inputs: a source file or document with identical content, an identical inline input (a directory listing), a
directory the pilot used, or survey and profile rows a pilot item contained. Writes analysis/pilot-material.json.
Run: python3 analysis/pilot-material.py
"""
import glob
import hashlib
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
P = os.path.join(ROOT, "probes")


def load(d):
    out = []
    for f in sorted(glob.glob(os.path.join(P, d, "*.json"))):
        out += json.load(open(f))
    return out


A, PI = load("items-suite-a"), load("items")
h = lambda s: hashlib.sha256(s.encode()).hexdigest()


def contents(it):
    """Content hashes of code files, documents and file blocks inside inline inputs."""
    inp, out = it["input"], set()
    if inp["kind"] == "code":
        for f in inp["files"]:
            out.add(h(open(os.path.join(P, "data", f)).read().strip()))
    if inp["kind"] == "doc":
        out.add(h(open(os.path.join(P, "data", inp["path"])).read().strip()))
    if inp["kind"] == "inline":
        for m in re.finditer(r"<<<(?:FILE|DOCUMENT)\n(.*?)\n(?:FILE|DOCUMENT)>>>", inp["text"], re.S):
            out.add(h(m.group(1).strip()))
    return out


def dirlabel(it):
    m = re.match(r"Directory (\S+)", it["input"].get("text", ""))
    return m.group(1) if m else None


pilot_content = set().union(*[contents(it) for it in PI])
pilot_inline = {it["input"]["text"] for it in PI if it["input"]["kind"] == "inline"}
pilot_dirs = {dirlabel(it) for it in PI if dirlabel(it)}
pilot_rows = {(it["input"]["kind"], str(x)) for it in PI if it["input"]["kind"] in ("profiles", "djinni") for x in it["input"]["ids"]}

reuse = {}
for it in A:
    kinds = []
    if contents(it) & pilot_content:
        kinds.append("identical source file or document")
    if it["input"]["kind"] == "inline" and it["input"]["text"] in pilot_inline:
        kinds.append("identical inline input")
    elif dirlabel(it) in pilot_dirs:
        kinds.append("directory used in the pilot")
    if it["input"]["kind"] in ("profiles", "djinni") and any((it["input"]["kind"], str(x)) in pilot_rows for x in it["input"]["ids"]):
        kinds.append("shared survey or profile rows")
    if kinds:
        reuse[it["id"]] = kinds

by_kind = {}
for kinds in reuse.values():
    for k in kinds:
        by_kind[k] = by_kind.get(k, 0) + 1
out = {"note": __doc__.splitlines()[0], "pilotItems": len(PI), "suiteAItems": len(A), "sharedIds": sorted({i["id"] for i in A} & {i["id"] for i in PI}),
       "itemsReusingPilotMaterial": len(reuse), "byKind": by_kind, "items": reuse,
       "pilotRows": len(pilot_rows), "suiteARowsFromPilot": sum(1 for it in A if it["input"]["kind"] in ("profiles", "djinni") for x in it["input"]["ids"] if (it["input"]["kind"], str(x)) in pilot_rows)}
json.dump(out, open(os.path.join(ROOT, "analysis", "pilot-material.json"), "w"), indent=1)
print(json.dumps({k: out[k] for k in ("itemsReusingPilotMaterial", "byKind", "sharedIds")}))
