import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { generateText, gateway } from "ai";
import type { ModelSpec } from "./models";

export type CallResult = {
  ok: boolean;
  error: string | null;
  text: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cost: number | null;
  marketCost: number | null; // list-price cost; on BYOK calls the gateway bills cost 0 and the provider bills marketCost
  credentialTypes: string[]; // credential type of every provider attempt (byok or system)
  provider: string | null;
  generationId: string | null;
  finishReason: string | null;
  responseModelId: string | null;
  warnings: string[];
};

/**
 * Spend billed to gateway credits by calls whose BYOK attempt failed and fell back to system credentials (the gateway
 * always retries that way; it cannot be disabled). Sums the gateway cost of every record carrying a system credential
 * across the given run files, so concurrent runners of one arm share a single fallback cap (FALLBACK_CAP_USD).
 */
export function fallbackSpendUsd(files: string[]): number {
  let total = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if ((r.credentialTypes ?? []).includes("system")) total += Number(r.cost ?? 0);
    }
  }
  return total;
}

export const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * One worker call. Temperature 0, reasoning at the model's pinned level,
 * provider pinned. The AI SDK retries transient errors (maxRetries) with
 * backoff; a final failure is returned as ok=false, never thrown, so the
 * runner can record it and keep going.
 */
export async function callWorker(
  spec: ModelSpec,
  system: string,
  prompt: string,
  opts: { temperature?: number | null; maxRetries?: number; maxOutputTokens?: number; reasoning?: string | null; providerReasoning?: string | null; providerThinking?: "enabled" | "disabled" | null } = {},
): Promise<CallResult> {
  const started = Date.now();
  try {
    const res = await generateText({
      model: gateway(spec.id),
      system,
      prompt,
      ...(opts.temperature === null ? {} : { temperature: opts.temperature ?? 0 }),
      maxRetries: opts.maxRetries ?? 3,
      maxOutputTokens: opts.maxOutputTokens ?? 32000,
      ...(opts.reasoning === null ? {} : { reasoning: opts.reasoning ?? spec.reasoning }),
      // provider-level effort (for example DeepSeek's max, above what the SDK's xhigh maps to); passed through the gateway under the provider slug
      providerOptions: {
        gateway: { only: spec.only, tags: ["visibility-paper"] },
        // provider-level thinking switch (DeepSeek: thinking.type enabled or disabled), same pass-through path as the effort
        ...(opts.providerReasoning || opts.providerThinking
          ? { [spec.only[0]]: { ...(opts.providerReasoning ? { reasoningEffort: opts.providerReasoning } : {}), ...(opts.providerThinking ? { thinking: { type: opts.providerThinking } } : {}) } }
          : {}),
      },
    } as any);
    const u: any = res.usage ?? {};
    const g: any = (res.providerMetadata as any)?.gateway ?? {};
    return {
      ok: true,
      error: null,
      text: res.text,
      latencyMs: Date.now() - started,
      inputTokens: u.inputTokens ?? null,
      outputTokens: u.outputTokens ?? null,
      reasoningTokens: u.outputTokenDetails?.reasoningTokens ?? null,
      cacheReadTokens: u.inputTokenDetails?.cacheReadTokens ?? null,
      cost: g.cost != null ? Number(g.cost) : null,
      marketCost: g.marketCost != null ? Number(g.marketCost) : null,
      credentialTypes: (g.routing?.modelAttempts ?? []).flatMap((m: any) => (m.providerAttempts ?? []).map((a: any) => String(a.credentialType))),
      provider: g.routing?.finalProvider ?? null,
      generationId: g.generationId ?? null,
      finishReason: res.finishReason ?? null,
      responseModelId: (res.response as any)?.modelId ?? null,
      warnings: (res.warnings ?? []).map((w: any) => String(w.message ?? w.type)),
    };
  } catch (e: any) {
    return {
      ok: false,
      error: String(e?.message ?? e).slice(0, 400),
      text: "",
      latencyMs: Date.now() - started,
      inputTokens: null, outputTokens: null, reasoningTokens: null, cacheReadTokens: null,
      cost: null, marketCost: null, credentialTypes: [], provider: null, generationId: null, finishReason: null, responseModelId: null, warnings: [],
    };
  }
}
