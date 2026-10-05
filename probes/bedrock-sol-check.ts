/**
 * Routing check for the third model, GPT-6.1 Sol, pinned to AWS Bedrock (DECISIONS.md, 2026-10-04): N small requests
 * through the AI Gateway with providerOptions.gateway.only = ["bedrock"], recording for each the provider that served
 * it, the credential type of every routing attempt (byok means the team's own Bedrock credentials, billed to AWS;
 * system means Vercel's credentials, billed to gateway credits) and the gateway's cost fields. Stops at the first
 * request that was not served by Bedrock on BYOK credentials. Writes runs/bedrock-sol-check.json.
 * Run: N=10 pnpm tsx probes/bedrock-sol-check.ts (AI_GATEWAY_API_KEY in the environment)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, gateway } from "ai";

const N = Number(process.env.N ?? 10);
const out: any[] = [];
for (let i = 1; i <= N; i++) {
  const started = Date.now();
  try {
    const res = await generateText({
      model: gateway("openai/gpt-6.1-sol"),
      prompt: `Reply with the number ${i} and nothing else.`,
      maxOutputTokens: 2000,
      reasoning: "low",
      providerOptions: { gateway: { only: ["bedrock"], tags: ["visibility-paper", "bedrock-check"] } },
    } as any);
    const g: any = (res.providerMetadata as any)?.gateway ?? {};
    // provider attempts sit inside routing.modelAttempts[].providerAttempts (gateway metadata, AI SDK 7)
    const attempts = (g.routing?.modelAttempts ?? []).flatMap((m: any) => (m.providerAttempts ?? m.attempts ?? []).map((a: any) => ({ provider: a.provider ?? a.providerId, credentialType: a.credentialType ?? a.credentialSource ?? null, success: a.success ?? (a.status === "success") })));
    const row = { i, ok: true, text: res.text.trim().slice(0, 40), latencyMs: Date.now() - started, finalProvider: g.routing?.finalProvider ?? null, attempts, cost: g.cost ?? null, marketCost: g.marketCost ?? null, gatewayCost: g.gatewayCost ?? null, surchargeCost: g.surchargeCost ?? null, generationId: g.generationId ?? null, usage: { input: res.usage?.inputTokens, output: res.usage?.outputTokens } };
    if (i === 1) console.log("modelAttempts:", JSON.stringify(g.routing?.modelAttempts ?? null).slice(0, 1500));
    out.push(row); console.log(JSON.stringify(row));
    // billed to the team's own Bedrock credentials: served by bedrock, every successful attempt on BYOK credentials,
    // and nothing charged to gateway credits (cost 0 while the market cost is positive)
    const byok = row.finalProvider === "bedrock" && attempts.filter((a: any) => a.success).every((a: any) => a.credentialType === "byok") && Number(row.cost) === 0 && Number(row.marketCost) > 0;
    if (!byok) { console.log(`STOP: request ${i} was not served by Bedrock on BYOK credentials`); break; }
  } catch (e: any) {
    const row = { i, ok: false, error: String(e?.message ?? e).slice(0, 300), latencyMs: Date.now() - started };
    out.push(row); console.log(JSON.stringify(row)); break;
  }
}
writeFileSync(join(import.meta.dirname, "..", "runs", "bedrock-sol-check.json"), JSON.stringify({ model: "openai/gpt-6.1-sol", only: ["bedrock"], ts: new Date().toISOString(), rows: out }, null, 1));
const okRows = out.filter((r) => r.ok && r.finalProvider === "bedrock");
console.log(`DONE ${okRows.length}/${N} served by bedrock; credential types: ${JSON.stringify([...new Set(out.flatMap((r) => (r.attempts ?? []).map((a: any) => a.credentialType)))])}`);
