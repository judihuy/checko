// Landing Page — Checko
// Hero + Module Grid + Pricing + CTA + Footer

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GeckoLogo } from "@/components/GeckoLogo";
import { ModuleCard } from "@/components/ModuleCard";
import { PricingSection } from "@/components/PricingSection";
import { prisma } from "@/lib/prisma";

// Force dynamic rendering (needs DB access)
export const dynamic = "force-dynamic";

// Module type for when DB is empty (fallback demo data)
interface ModuleData {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  icon: string | null;
  isActive: boolean;
}

const DEMO_MODULES: ModuleData[] = [
  {
    id: "demo-1",
    slug: "preisradar",
    name: "Checko Preisradar",
    description:
      "Ueberwache Marktplaetze automatisch und finde die besten Schnaeppchen. Sofort-Benachrichtigung bei Treffern.",
    priceMonthly: 500,
    icon: "📡",
    isActive: true,
  },
  {
    id: "demo-2",
    slug: "scam-shield",
    name: "Checko Scam Shield",
    description:
      "Schuetze dich vor Betrug auf Online-Marktplaetzen. Automatische Erkennung verdaechtiger Inserate.",
    priceMonthly: 790,
    icon: "🛡️",
    isActive: false,
  },
  {
    id: "demo-3",
    slug: "legal",
    name: "Checko Legal",
    description:
      "Kuendigungen, Mahnungen und Rechtsbriefe automatisch erstellen. Rechtssicher und in Sekunden fertig.",
    priceMonthly: 990,
    icon: "⚖️",
    isActive: false,
  },
  {
    id: "demo-4",
    slug: "abo-killer",
    name: "Checko Abo-Killer",
    description:
      "Finde versteckte Abos in deinen Kontoauszuegen und kuendige sie mit einem Klick.",
    priceMonthly: 490,
    icon: "✂️",
    isActive: false,
  },
  {
    id: "demo-5",
    slug: "immo",
    name: "Checko Immo",
    description:
      "Wohnungs- und Haus-Ueberwachung. Sofort benachrichtigt bei neuen Inseraten, die zu deinen Kriterien passen.",
    priceMonthly: 790,
    icon: "🏠",
    isActive: false,
  },
  {
    id: "demo-6",
    slug: "kleingedrucktes",
    name: "Checko Kleingedrucktes",
    description:
      "AGB und Vertraege analysieren lassen. Versteckte Klauseln und Risiken sofort erkennen.",
    priceMonthly: 590,
    icon: "🔍",
    isActive: false,
  },
];

async function getModules(): Promise<ModuleData[]> {
  try {
    const modules = await prisma.module.findMany({
      orderBy: { sortOrder: "asc" },
    });
    if (modules.length > 0) return modules;
    return DEMO_MODULES;
  } catch {
    // DB not connected yet — use demo data
    return DEMO_MODULES;
  }
}

export default async function HomePage() {
  const modules = await getModules();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <GeckoLogo className="w-20 h-20 mx-auto mb-6" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            Checko — Dein Toolkit
            <br />
            <span className="text-emerald-600">fuer alles.</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Smarte Module, die dir im Alltag Zeit und Geld sparen. Waehle nur die
            Tools, die du wirklich brauchst.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="bg-emerald-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
            >
              Jetzt kostenlos starten
            </Link>
            <Link
              href="/#module"
              className="bg-white text-gray-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition border border-gray-200"
            >
              Module entdecken
            </Link>
          </div>
        </div>
      </section>

      {/* Module Grid */}
      <section id="module" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Unsere Module</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Jedes Modul loeest ein konkretes Problem. Buche nur, was du brauchst — und
              spare mit jedem weiteren Modul.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {modules.map((mod) => (
              <ModuleCard
                key={mod.id}
                slug={mod.slug}
                name={mod.name}
                description={mod.description}
                priceMonthly={mod.priceMonthly}
                icon={mod.icon}
                isActive={mod.isActive}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* CTA Section */}
      <section className="py-20 bg-emerald-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Bereit loszulegen?</h2>
          <p className="text-emerald-100 text-lg mb-8">
            Erstelle dein kostenloses Konto und entdecke, was Checko fuer dich tun kann.
          </p>
          <Link
            href="/register"
            className="inline-block bg-white text-emerald-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition shadow-lg"
          >
            Jetzt kostenlos starten
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
