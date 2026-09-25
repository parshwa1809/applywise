import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chromium for the resume PDF must stay a real Node dependency (not bundled).
  serverExternalPackages: ["playwright", "playwright-core", "@sparticuz/chromium"],
  // Files the PDF route loads at runtime by path, which the tracer can't see on its own:
  // the compressed Chromium build for Vercel, and the Times-metric font used there.
  outputFileTracingIncludes: {
    "/api/pdf": [
      "./node_modules/@sparticuz/chromium/bin/**",
      "./src/lib/resume/fonts/*.woff2",
      // playwright-core reads browsers.json and other files by path at runtime; the tracer misses them
      "./node_modules/playwright-core/**/*",
      "./node_modules/playwright/**/*",
    ],
  },
};

export default nextConfig;
