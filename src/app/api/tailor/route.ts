import { rateLimit } from "@/lib/rateLimit";
import { DEFAULT_MODELS, ProviderError, tailorOffline, tailorWithAi } from "@/lib/engine/tailor";
import type { AiProvider, Job } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120; // room for 5s/15s/30s retries when the model is busy
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<AiProvider>(["gemini", "openai", "anthropic"]);

export async function POST(req: Request) {
  const limited = rateLimit(req, "tailor");
  if (limited) return limited;
  let body: { job?: Job; resume?: string; provider?: AiProvider; apiKey?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { job, resume = "", provider, apiKey, model } = body;
  if (!job?.title) return Response.json({ error: "Missing job" }, { status: 400 });
  if (!resume.trim()) return Response.json({ error: "Add your resume in Settings first." }, { status: 400 });

  // The key is used for this one request and never stored or logged server-side.
  if (!apiKey || !provider || !PROVIDERS.has(provider)) {
    return Response.json(tailorOffline(job, resume));
  }
  try {
    return Response.json(await tailorWithAi(job, resume, provider, apiKey, model));
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    const status = e instanceof ProviderError ? e.status : undefined;
    console.error(`[tailor] ${provider}/${model || DEFAULT_MODELS[provider as AiProvider]} failed${status ? ` (HTTP ${status})` : ""}: ${message.slice(0, 300)}`);
    return Response.json({ ...tailorOffline(job, resume), error: message, errorStatus: status, errorModel: model || DEFAULT_MODELS[provider as AiProvider] });
  }
}
