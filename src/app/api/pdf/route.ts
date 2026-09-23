import { rateLimit } from "@/lib/rateLimit";
import { generateResumePdf, PdfLayoutError } from "@/lib/resume/pdf.server";
import type { ResumeDoc } from "@/lib/resume/doc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { doc, fileName } → { pdf (base64), html, layout, fill } — one-page resume, job-tailor rules. Nothing is stored. */
export async function POST(req: Request) {
  const limited = rateLimit(req, "pdf");
  if (limited) return limited;
  let body: { doc?: ResumeDoc; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const doc = body.doc;
  if (!doc || !Array.isArray(doc.sections)) return Response.json({ error: "Missing resume" }, { status: 400 });
  const fileName = (body.fileName || "Resume").replace(/[^\w.-]+/g, "_").slice(0, 80);
  try {
    const r = await generateResumePdf(doc, fileName);
    return Response.json(
      { pdf: Buffer.from(r.pdf).toString("base64"), html: r.html, fileName, layout: r.layout, fill: r.fillRatio, pages: r.pageCount, underfilled: r.underfilled },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const status = e instanceof PdfLayoutError ? 422 : 500;
    const message =
      e instanceof PdfLayoutError
        ? e.message
        : /Executable doesn't exist|browserType\.launch/i.test(String(e))
          ? "PDF engine isn't installed. Run: npx playwright install chromium"
          : "Couldn't build the PDF.";
    return Response.json({ error: message }, { status });
  }
}
