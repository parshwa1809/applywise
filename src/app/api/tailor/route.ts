import { tailorOffline, tailorWithAi } from "@/lib/engine/tailor";
import type { AiProvider, Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS = new Set<AiProvider>(["gemini", "openai", "anthropic"]);

export async function POST(req: Request) {
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
    return Response.json({ ...tailorOffline(job, resume), error: message });
  }
}
