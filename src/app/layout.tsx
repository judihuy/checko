import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { CookieBanner } from "@/components/CookieBanner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Checko — Smarte Module für den Alltag | checko.ch",
  description:
    "Checko bietet smarte Module für Preisüberwachung, Vertragscheck, Betrugsschutz und mehr. Dein smartes Toolkit für den Alltag.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "Checko — Smarte Module für den Alltag | checko.ch",
    description:
      "Checko bietet smarte Module für Preisüberwachung, Vertragscheck, Betrugsschutz und mehr. Dein smartes Toolkit für den Alltag.",
    url: "https://checko.ch",
    siteName: "Checko",
    type: "website",
    locale: "de_CH",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 text-gray-900`}>
        <Providers>
          {children}
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
