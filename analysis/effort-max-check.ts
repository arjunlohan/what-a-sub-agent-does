/**
 * Does DeepSeek V4 Flash run at its highest effort under the SDK's xhigh? Five Suite A items at V4, one draw each, at
 * (a) reasoning xhigh (the study setting), (b) an explicit provider reasoningEffort of max, (c) provider default.
 * Run: pnpm tsx visibility-paper/analysis/effort-max-check.ts  (writes runs/effort-max-check.json)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, gateway } from "ai";
import { loadItems } from "../harness/items";
import { buildPrompt } from "../harness/prompts";
const ROOT = join(import.meta.dirname, "..");
const items = loadItems("items-suite-a"); const pick = ["ACE-01", "ACE-03", "ADE-01", "ASU-01", "ATS-06"].map((id) => items.find((i) => i.id === id)!);
const variants: Array<[string, any]> = [["xhigh", { reasoning: "xhigh" }], ["max-provider", { providerOptions: { deepseek: { reasoningEffort: "max" } } }], ["default", {}]];
const out: any[] = [];
for (const it of pick) for (const [name, extra] of variants) {
  const idx = items.indexOf(it); const { system, user } = buildPrompt(it, "V4" as any, idx, items); const t0 = Date.now();
  try { const r: any = await generateText({ model: gateway("deepseek/deepseek-v4-flash-0731"), system, prompt: user, maxOutputTokens: 32000, maxRetries: 2, ...(extra.reasoning ? { reasoning: extra.reasoning } : {}), providerOptions: { ...(extra.providerOptions ?? {}), gateway: { only: ["deepseek"], tags: ["visibility-paper", "effort-max-check"] } } } as any);
    out.push({ item: it.id, variant: name, reasoningTokens: r.usage?.outputTokenDetails?.reasoningTokens ?? null, outputTokens: r.usage?.outputTokens ?? null, cost: r.providerMetadata?.gateway?.cost ?? null, warnings: (r.warnings ?? []).map((w: any) => w.type ?? String(w)), ms: Date.now() - t0 }); }
  catch (e: any) { out.push({ item: it.id, variant: name, error: String(e?.message ?? e).slice(0, 200) }); }
}
writeFileSync(join(ROOT, "runs", "effort-max-check.json"), JSON.stringify(out, null, 1));
for (const v of variants) { const rs = out.filter((o) => o.variant === v[0] && o.reasoningTokens != null); console.log(`${v[0]}: n=${rs.length}, mean reasoning tokens ${rs.length ? Math.round(rs.reduce((a, o) => a + o.reasoningTokens, 0) / rs.length) : "n/a"}; per item ${rs.map((o) => `${o.item}=${o.reasoningTokens}`).join(" ")}; warnings ${JSON.stringify([...new Set(out.filter((o) => o.variant === v[0]).flatMap((o) => o.warnings ?? []))])}; errors ${out.filter((o) => o.variant === v[0] && o.error).length}`); }
console.log("EFFORT_MAX_CHECK_OK");
