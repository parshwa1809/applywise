import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Applywise — apply to real jobs, skip the ghosts",
  description: "Open-source job search: scans company job boards directly, flags ghost listings, scores roles against your resume and tailors it honestly.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e14" },
  ],
};

// Apply the saved theme before paint to avoid a light/dark flash.
const themeScript = `try{var s=JSON.parse(localStorage.getItem('applywise')||'{}');var t=s.state&&s.state.theme;if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
