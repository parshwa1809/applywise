/**
 * Resume file → plain text, keeping one achievement per line and "•" bullets so the
 * scorer and tailor can find individual bullets.
 */
const BULLET = /^[\s]*[•●▪◦‣∙·\-*–]\s*/;

export function tidyResumeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/||•/g, "•") // Word/PDF symbol-font bullets
    .split("\n")
    .map((l) => l.replace(/ {2,}/g, " ").trim())
    .map((l) => (BULLET.test(l) ? `• ${l.replace(BULLET, "")}` : l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** PDF lines often wrap mid-sentence; glue a continuation line back onto its bullet. */
export function joinWrappedLines(text: string): string {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const prev = out[out.length - 1];
    const isContinuation =
      prev !== undefined &&
      prev.startsWith("•") &&
      line.length > 0 &&
      !line.startsWith("•") &&
      /^[a-z0-9(%$&,]/.test(line) &&
      !/[.:]$/.test(prev);
    if (isContinuation) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out.join("\n");
}

export async function parseResumeFile(name: string, bytes: Uint8Array): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(text) ? text : [text];
    return joinWrappedLines(tidyResumeText(pages.join("\n")));
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    // keep list items as bullets and paragraphs as lines
    const text = html
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    return tidyResumeText(text);
  }
  if (lower.endsWith(".doc")) throw new Error("Old .doc files aren't supported — save it as .docx or PDF and try again.");
  if (/\.(txt|md|markdown)$/.test(lower)) return tidyResumeText(new TextDecoder().decode(bytes));
  throw new Error("Upload a PDF, Word (.docx), .txt or .md file.");
}
