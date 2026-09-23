import { rateLimit } from "@/lib/rateLimit";
import { parseResumeFile } from "@/lib/engine/resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

/** Turns an uploaded PDF / Word / text resume into plain text. Nothing is stored. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "resume");
  if (limited) return limited;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Send the file as multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 8 MB." }, { status: 413 });
  try {
    const text = await parseResumeFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!text.trim()) return Response.json({ error: "Couldn't find any text in that file. If it's a scanned PDF, paste the text instead." }, { status: 422 });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't read that file." }, { status: 422 });
  }
}
