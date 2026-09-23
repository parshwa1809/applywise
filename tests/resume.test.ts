import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseResumeFile } from "../src/lib/engine/resume";
import { resumeBullets } from "../src/lib/engine/tailor";

const load = (f: string) => new Uint8Array(readFileSync(`${__dirname}/fixtures/${f}`));

describe("resume upload", () => {
  it("reads Word bullets", async () => {
    const t = await parseResumeFile("resume.docx", load("resume.docx"));
    expect(t).toContain("Jane Doe");
    expect(t).toContain("• Drove personalization roadmap");
    expect(resumeBullets(t)).toHaveLength(2);
  });
  it("reads PDF and re-joins wrapped bullet lines", async () => {
    const t = await parseResumeFile("resume.pdf", load("resume.pdf"));
    expect(t).toContain("lifting retention 23% through A/B testing");
    expect(resumeBullets(t)).toHaveLength(2);
  });
  it("rejects unsupported types", async () => {
    await expect(parseResumeFile("resume.doc", new Uint8Array())).rejects.toThrow(/docx/);
  });
});
