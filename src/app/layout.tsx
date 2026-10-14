import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* The same two self-hosted fonts the Customs Wise website uses (SIL Open Font Licence). */
const oswald = localFont({ src: "./fonts/Oswald-Variable.woff2", variable: "--font-oswald", weight: "200 700", display: "swap", fallback: ["Arial Narrow", "sans-serif"] });
const openSans = localFont({ src: "./fonts/OpenSans-Variable.woff2", variable: "--font-open-sans", weight: "300 800", display: "swap", fallback: ["Segoe UI", "Arial", "sans-serif"] });

export const metadata: Metadata = {
  title: { default: "Multi-Site Blog CMS (local prototype)", template: "%s" },
  description: "Local proof of concept of the Multi-Site Blog CMS.",
  // A local test tool: never to be indexed, wherever it is opened.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${oswald.variable} ${openSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
