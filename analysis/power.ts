/**
 * Power simulation for the paired item design, calibrated to the pilot: an item random effect on the logit
 * scale sized from the pilot ICC, three draws at temperature 0, the item-level indicator "any draw DEVIATED",
 * McNemar exact on discordant items, Holm across the two models (alpha 0.025 per model for the primary contrast).
 * Reports power for adjacent-step differences and the minimum detectable difference per number of items.
 * Run: pnpm tsx visibility-paper/analysis/power.ts   (writes analysis/power.json)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { binomTwoSided } from "./stats";
const ROOT = join(import.meta.dirname, "..");
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(7);
function randn() { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const sig = (x: number) => 1 / (1 + Math.exp(-x));
const ICC = 0.7; const SIGMA = Math.sqrt((ICC / (1 - ICC)) * (Math.PI ** 2 / 3)); // logistic latent scale
const DRAWS = 3;
/** Item-level rate E[1-(1-p_i)^DRAWS] for logit p_i = a + b_i, b_i ~ N(0, SIGMA^2), by Gauss-Hermite-free quadrature. */
function itemRate(a: number): number { const K = 400; let s = 0; for (let i = 0; i < K; i++) { const z = -4 + (8 * (i + 0.5)) / K; const w = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * (8 / K); const p = sig(a + SIGMA * z); s += w * (1 - (1 - p) ** DRAWS); } return s; }
function alphaFor(target: number): number { if (target <= 0) return -60; let lo = -30, hi = 10; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (itemRate(mid) < target) lo = mid; else hi = mid; } return (lo + hi) / 2; }
function power(nItems: number, p0: number, p1: number, alpha: number, reps = 3000): number {
  const a0 = alphaFor(p0), a1 = alphaFor(p1); let rej = 0;
  for (let r = 0; r < reps; r++) {
    let onlyA = 0, onlyB = 0;
    for (let i = 0; i < nItems; i++) { const b = SIGMA * randn(); const pa = sig(a0 + b), pb = sig(a1 + b); let da = false, db = false; for (let d = 0; d < DRAWS; d++) { if (rand() < pa) da = true; if (rand() < pb) db = true; } if (da && !db) onlyA++; if (db && !da) onlyB++; }
    if (binomTwoSided(Math.min(onlyA, onlyB), onlyA + onlyB) < alpha) rej++;
  }
  return rej / reps;
}
const ALPHA = 0.025; // Holm across two models, primary contrast per model
const grid: any[] = [];
for (const n of [30, 40, 100, 200]) for (const p0 of [0, 0.05]) for (const delta of [0.05, 0.1, 0.15, 0.2]) grid.push({ nItems: n, p0, p1: p0 + delta, delta, power: power(n, p0, p0 + delta, ALPHA) });
const mde: Record<string, number | null> = {};
for (const n of [30, 40, 100, 200]) { let found: number | null = null; for (const delta of [0.03, 0.05, 0.07, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3]) { if (power(n, 0, delta, ALPHA, 1500) >= 0.8) { found = delta; break; } } mde[String(n)] = found; }
const pilot = { nItems: 30, p0: 0, p1: 4 / 30, power: power(30, 0, 4 / 30, ALPHA) };
const out = { generatedAt: new Date().toISOString(), assumptions: { icc: ICC, sigmaLogit: Number(SIGMA.toFixed(2)), draws: DRAWS, alphaPerModel: ALPHA, test: "McNemar exact on item-level any-DEVIATED indicators, paired across conditions" }, grid, mde, pilot };
writeFileSync(join(ROOT, "analysis", "power.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ mde, pilot, sample: grid.filter((g) => g.p0 === 0 && (g.delta === 0.1 || g.delta === 0.15)) }, null, 1));
console.log("POWER_OK");
