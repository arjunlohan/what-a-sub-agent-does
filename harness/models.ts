/**
 * The two models under test (DECISIONS.md, 2026-09-02). Prices are gateway
 * list prices per million tokens for pre-run estimates only; the ledger uses
 * the gateway's per-request cost field, which is authoritative.
 */
export type ModelSpec = {
  key: "deepseek" | "muse" | "luna";
  id: string;
  only: string[]; // provider pin: a run served by any other provider is discarded
  reasoning: "xhigh";
  priceIn: number;
  priceOut: number;
  priceCacheRead: number;
  peak?: { priceIn: number; priceOut: number; priceCacheRead: number; windowsUtc: string };
  concurrency: number;
};

export const MODELS: Record<"deepseek" | "muse" | "luna", ModelSpec> = {
  deepseek: {
    key: "deepseek",
    id: "deepseek/deepseek-v4-flash-0731",
    only: ["deepseek"],
    reasoning: "xhigh",
    // First-party DeepSeek rates (what the pilot actually paid; the pilot's $0.9764 reproduces to the cent from
    // the peak rates): off-peak $0.22 in / $0.007 cache read / $0.66 out; peak (01:00-04:00 and 06:00-10:00 UTC,
    // weekdays) $0.44 / $0.014 / $1.32. Third-party gateway routes list $0.13 / $0.26 but are not pinned.
    priceIn: 0.22,
    priceOut: 0.66,
    priceCacheRead: 0.007,
    peak: { priceIn: 0.44, priceOut: 1.32, priceCacheRead: 0.014, windowsUtc: "01:00-04:00, 06:00-10:00 weekdays" },
    concurrency: 12,
  },
  muse: {
    key: "muse",
    id: "meta/muse-spark-1.3-contributor",
    only: ["meta"],
    reasoning: "xhigh",
    priceIn: 0.1,
    priceOut: 0.2,
    priceCacheRead: 0.002,
    concurrency: 10,
  },
  // Third model, authorized by Arjun on 2026-09-03 at pilot scale (about $2): a third post-training regime
  // (OpenAI's budget tier), single provider, about 3 s per call in the probe.
  luna: {
    key: "luna",
    id: "openai/gpt-5.6-luna",
    only: ["openai"],
    reasoning: "xhigh",
    priceIn: 0.2,
    priceOut: 1.2,
    priceCacheRead: 0.02,
    concurrency: 8,
  },
};

/** Hard ceiling for the whole paper (DECISIONS.md) and the per-stage envelopes. */
export const BUDGET_USD = { total: 150, pilot: 5, suiteA: 40, suiteB: 60 };
