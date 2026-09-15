import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// latin-ext carries ā č ē ģ ī ķ ļ ņ š ū ž. Without it every Latvian word on
// the page mixes Geist for the ASCII letters with a fallback face for the
// diacritics, which is most of the text this app renders.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "Policy Radar LV",
  description:
    "Weekly startup-relevance digest of Latvian policy sources: TAP portāls, Saeima, VSS, MK, EM, LIAA, Altum.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
