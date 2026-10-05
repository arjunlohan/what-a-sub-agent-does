#!/usr/bin/env bash
# Third model, GPT-6.1 Sol at medium effort on AWS Bedrock with the team's own credentials (DECISIONS.md, 2026-10-04).
# Suite A: the main block (200 items x 13 cells x 3 draws) and the provider-default-temperature arm (V0, V4, LM4 x 1
# draw); the pilot-overlap block does not apply (Sol has no pilot). Suite B: 30 tasks x 5 conditions x 2 draws, on the
# task inputs of 2026-09-03 (SB_REPO_ROOT, SB_CORE_DIR). Caps count the list price, which AWS bills. Resumable.
# Run from the repo root with AI_GATEWAY_API_KEY set and the local MySQL survey table up.
set -u
cd "$(dirname "$0")"
# Arjun, 2026-10-05: fallbacks to Vercel's system credentials allowed up to $2 in total across the arm's run files
export FALLBACK_CAP_USD=2 FALLBACK_FILES=suite-a-sol.jsonl,suite-a-sol-temp.jsonl,suiteb-sol.jsonl
part="${1:-all}"
if [ "$part" = "a" ] || [ "$part" = "all" ]; then
  export ITEMS_DIR=items-suite-a
  echo "suite-a-sol main start $(date -u +%FT%TZ)"
  RUN_CONCURRENCY=${RUN_CONCURRENCY:-3} RUN_LABEL=suite-a-sol RUN_MODELS=sol RUN_CONDITIONS=V0,V1,V2,V3,V4,LM2,LM4,HM2,HM4,V2N,V2P,V4L,LML RUN_DRAWS=3 RUN_BUDGET_USD=120 \
    ./node_modules/.bin/tsx harness/run.ts 2>&1 | grep -v -i api_key > runs/suite-a-sol.log
  tail -2 runs/suite-a-sol.log
  # the temperature arm runs only after a clean main block (a stopped run means a guard tripped; see the log)
  if ! tail -1 runs/suite-a-sol.log | grep -q RUN_DONE; then echo "SUITE_A_SOL_STOPPED $(date -u +%FT%TZ)"; exit 1; fi
  echo "suite-a-sol temperature arm start $(date -u +%FT%TZ)"
  RUN_CONCURRENCY=${RUN_CONCURRENCY:-3} RUN_LABEL=suite-a-sol-temp RUN_TEMPERATURE=default RUN_MODELS=sol RUN_CONDITIONS=V0,V4,LM4 RUN_DRAWS=1 RUN_BUDGET_USD=10 \
    ./node_modules/.bin/tsx harness/run.ts 2>&1 | grep -v -i api_key > runs/suite-a-sol-temp.log
  tail -2 runs/suite-a-sol-temp.log
  echo "SUITE_A_SOL_DONE $(date -u +%FT%TZ)"
fi
if [ "$part" = "b" ] || [ "$part" = "all" ]; then
  echo "suiteb-sol start $(date -u +%FT%TZ)"
  SB_REPO_ROOT=/Users/lohan/Downloads/GitHub/project-lore/.claude/worktrees/semantic-search-table-107563 \
  SB_CORE_DIR=/Users/lohan/Downloads/GitHub/project-lore/.claude/worktrees/competent-meitner-19b724/packages/core/src \
  SB_LABEL=suiteb-sol SB_TASKS=all SB_MODELS=sol SB_CONDS=V0,V2,V4,V5,V5E SB_DRAWS=2 SB_BUDGET_USD=60 SB_CONCURRENCY=3 \
    ./node_modules/.bin/tsx suiteb/run.ts 2>&1 | grep -v -i api_key > runs/suiteb-sol.log
  tail -2 runs/suiteb-sol.log
  echo "SUITE_B_SOL_DONE $(date -u +%FT%TZ)"
fi
