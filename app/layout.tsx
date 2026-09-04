import type { Metadata } from "next";
import { Playfair_Display, Bebas_Neue, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "../styles/globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  weight: "400",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Blizzard Site Checker",
  description:
    "Audit any URL against 35 SEO, AI-optimization, and accessibility checks. Get scores in under a minute.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${bebas.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-body bg-warm-white text-blue">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
