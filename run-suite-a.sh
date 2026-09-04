#!/usr/bin/env bash
# Suite A: main block (200 items x 13 cells x 3 draws x 2 models), then the provider-default-temperature arm
# (V0, V4, LM4 x 1 draw), then the 30 pilot items rerun in the four pilot cells as the contamination block.
# Resumable: rerunning skips keys whose last record is a pinned success. Run from the repo root after
# `set -a; source .env.local; set +a`. Logs under runs/.
set -u
cd "$(dirname "$0")/.."
export ITEMS_DIR=items-suite-a
echo "suite-a main start $(date -u +%FT%TZ)"
RUN_LABEL=suite-a RUN_MODELS=deepseek,muse RUN_CONDITIONS=V0,V1,V2,V3,V4,LM2,LM4,HM2,HM4,V2N,V2P,V4L,LML RUN_DRAWS=3 RUN_BUDGET_USD=45 \
  pnpm -s tsx harness/run.ts 2>&1 | grep -v -i api_key > runs/suite-a.log
tail -2 runs/suite-a.log
echo "suite-a temperature arm start $(date -u +%FT%TZ)"
RUN_LABEL=suite-a-temp RUN_TEMPERATURE=default RUN_MODELS=deepseek,muse RUN_CONDITIONS=V0,V4,LM4 RUN_DRAWS=1 RUN_BUDGET_USD=6 \
  pnpm -s tsx harness/run.ts 2>&1 | grep -v -i api_key > runs/suite-a-temp.log
tail -2 runs/suite-a-temp.log
echo "pilot-overlap block start $(date -u +%FT%TZ)"
ITEMS_DIR=items RUN_LABEL=suite-a-overlap RUN_MODELS=deepseek,muse RUN_CONDITIONS=V0,V2,V4,LM4 RUN_DRAWS=3 RUN_BUDGET_USD=4 \
  pnpm -s tsx harness/run.ts 2>&1 | grep -v -i api_key > runs/suite-a-overlap.log
tail -2 runs/suite-a-overlap.log
echo "SUITE_A_ALL_DONE $(date -u +%FT%TZ)"
