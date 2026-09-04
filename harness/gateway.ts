import { createHash } from "node:crypto";
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
  provider: string | null;
  generationId: string | null;
  finishReason: string | null;
  responseModelId: string | null;
  warnings: string[];
};

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
      cost: null, provider: null, generationId: null, finishReason: null, responseModelId: null, warnings: [],
    };
  }
}
