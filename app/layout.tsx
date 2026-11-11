import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/cormorant-garamond";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://ceria.io"),
  title: { default: "ceria", template: "%s · ceria" },
  description: "A private workspace for ceria tutoring.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a className="skip-link" href="#main-content">Skip to content</a>
    {children}
  </body></html>;
}
