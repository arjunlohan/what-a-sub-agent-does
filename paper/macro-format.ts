/**
 * Loading and formatting shared by paper/build-numbers.ts and paper/build-numbers-revision.ts, so the two generators
 * print numbers alike. analysis/revision-suite-a.py mirrors p() as js_p when it validates the macros.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const rj = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const runsCache = new Map<string, any[]>();
/** The records of runs/<f>, parsed once per process; callers must not mutate them. */
export const jl = (f: string): any[] => {
  let v = runsCache.get(f);
  if (!v) { v = readFileSync(join(ROOT, "runs", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); runsCache.set(f, v); }
  return v;
};
export const safe = (s: string) => s.replace(/[^A-Za-z]/g, "");
export const int = (x: number) => Math.round(x).toLocaleString("en-US");
export const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)}\\%`;
/** A p-value without its prefix: $<$0.001, else three decimals. */
export const pv = (x: number) => (x < 0.001 ? "$<$0.001" : x.toFixed(3));
export const p = (x: number) => (x < 0.001 ? `p${pv(x)}` : `p=${pv(x)}`);
export const CT: Record<string, string> = { V0: "Vz", V1: "Vone", V2: "Vtwo", V3: "Vthree", V4: "Vfour", LM2: "LMtwo", LM4: "LMfour", HM2: "HMtwo", HM4: "HMfour", V2N: "VtwoN", V2P: "VtwoP", V4L: "VfourL", LML: "LML", V5: "Vfive", V5E: "VfiveE" };
export const MT: Record<string, string> = { muse: "Muse", deepseek: "Deep", sol: "Sol" };
export const LBL: Record<string, string> = { muse: "Muse Spark", deepseek: "DeepSeek", sol: "GPT-6.1 Sol" };
