#!/usr/bin/env bash
# Build the paper: regenerate numbers and figures from the artifacts, then compile with the TMLR style.
set -euo pipefail
cd "$(dirname "$0")/.."
TSX="$PWD/node_modules/.bin/tsx"; [ -x "$TSX" ] || TSX="$PWD/../node_modules/.bin/tsx"
"$TSX" paper/build-numbers.ts
STATSENV="${STATSENV:-/private/tmp/claude-501/-Users-lohan-Downloads-GitHub-project-lore--claude-worktrees-semantic-search-table-107563/3ba085b1-55a2-4a83-90d7-aef0c2863285/scratchpad/statsenv}"
if [ -x "$STATSENV/bin/python" ]; then PY="$STATSENV/bin/python"; elif python3 -c "import matplotlib" 2>/dev/null; then PY=python3; else python3 -m venv "$STATSENV" && "$STATSENV/bin/pip" -q install matplotlib numpy && PY="$STATSENV/bin/python"; fi
"$PY" paper/figures.py
python3 - <<'PY2'
import re
src=open("literature/refs.bib").read()
def fix(m):
    field,val=m.group(1),m.group(2)
    val=re.sub(r"(?<!\\)([&%#])", r"\\\1", val)
    if field=="author":
        val=re.sub(r"\s*\([^)]*\)", "", val)
        if ";" in val and " and " not in val: val=" and ".join(x.strip() for x in val.split(";") if x.strip())
        if " and " not in val and "," in val:
            parts=[x.strip() for x in val.split(",") if x.strip()]
            if all(len(x.split())>=2 for x in parts): val=" and ".join(parts)
    return f"  {field} = {{{val}}}"
out=re.sub(r"  (title|author|note|journal|howpublished) = \{(.*)\}", fix, src)
OVR={"printed2026patternsproblems":"Anthropic","documentation2026orchestrateteams":"Anthropic","anthropic2026subagentssdk":"Anthropic","openai2026openaiapi":"OpenAI","center2026swarmcapabilities":"Moonshot AI","anthropic2026cardclaude":"Anthropic","anthropic2026cardclaude2":"Anthropic","openai2026gptcard2":"OpenAI","project2025llm062025":"{OWASP GenAI Security Project}","metr2026frontierrisk":"METR"}
def ovr(m):
    key=m.group(1); body=m.group(2)
    if key in OVR: body=re.sub(r"  author = \{[^\n]*\}", "  author = {"+OVR[key]+"}", body, count=1)
    return "@"+m.group(0)[1:m.group(0).index("{")+1]+key+","+body
out=re.sub(r"@\w+\{([^,]+),(.*?)(?=\n@|\Z)", ovr, out, flags=re.S)
open("paper/refs.bib","w").write(out)
PY2
cd paper && latexmk -pdf -interaction=nonstopmode -halt-on-error -silent main.tex >/dev/null 2>&1 || { echo "BUILD_FAILED"; grep -E "^!|Error|Undefined control|Citation .* undefined" main.log | head -20; exit 1; }
echo "BUILD_OK $(python3 -c "import re;print(re.search(r'Output written on main.pdf \((\d+) pages', open('main.log').read()).group(1))") pages; undefined citations: $(grep -c 'Citation.*undefined' main.log || true)"
