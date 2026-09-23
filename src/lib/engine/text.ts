const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&rsquo;": "'",
  "&lsquo;": "'",
  "&rdquo;": '"',
  "&ldquo;": '"',
  "&ndash;": "-",
  "&mdash;": "-",
  "&bull;": "•",
  "&hellip;": "...",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|bull|hellip);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** HTML (possibly entity-escaped, as Greenhouse returns it) → readable plain text. */
export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-escapes: &lt;p&gt; … decode once if it looks escaped.
  if (/&lt;\/?[a-z]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|h[1-6]|ul|ol|li|section)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l, i, a) => l.length > 0 || (i > 0 && a[i - 1].length > 0))
    .join("\n")
    .trim();
}

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or our that the their this to we will with you your who what when where which while within able about across all also any been but can do each etc more most must not other over per such than them they these those through under up use using via was were work working year years".split(
    " ",
  ),
);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#./ -]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[./-]+|[./-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}
