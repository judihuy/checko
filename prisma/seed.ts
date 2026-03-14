// Seed-Script: Alle 20 Checko-Module in die DB
// Idempotent via upsert — kann beliebig oft ausgeführt werden
// Aufruf: npx tsx prisma/seed.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface ModuleSeed {
  slug: string;
  name: string;
  icon: string;
  status: string;
  isActive: boolean;
  description: string;
  sortOrder: number;
}

const modules: ModuleSeed[] = [
  {
    slug: "preisradar",
    name: "Checko Preisradar",
    icon: "📡",
    status: "active",
    isActive: true,
    description:
      "Überwache Marktplätze wie Tutti.ch, Ricardo und eBay Kleinanzeigen automatisch. Erhalte Sofort-Benachrichtigungen bei neuen Treffern und finde die besten Schnäppchen.",
    sortOrder: 1,
  },
  {
    slug: "scam-shield",
    name: "Checko Scam Shield",
    icon: "🛡️",
    status: "coming_soon",
    isActive: false,
    description:
      "Schütze dich vor Betrug auf Online-Marktplätzen. Checko analysiert Inserate automatisch und warnt dich bei verdächtigen Angeboten, bevor du Geld verlierst.",
    sortOrder: 2,
  },
  {
    slug: "legal",
    name: "Checko Legal",
    icon: "⚖️",
    status: "coming_soon",
    isActive: false,
    description:
      "Erstelle Kündigungen, Mahnungen und Rechtsbriefe in Sekunden. Rechtssicher formuliert und sofort einsatzbereit — ohne teure Anwälte.",
    sortOrder: 3,
  },
  {
    slug: "abo-killer",
    name: "Checko Abo-Killer",
    icon: "✂️",
    status: "coming_soon",
    isActive: false,
    description:
      "Finde versteckte Abonnements in deinen Kontoauszügen und kündige sie mit einem Klick. Spare jeden Monat Geld, ohne selbst suchen zu müssen.",
    sortOrder: 4,
  },
  {
    slug: "immo",
    name: "Checko Immo",
    icon: "🏠",
    status: "coming_soon",
    isActive: false,
    description:
      "Überwache den Immobilienmarkt automatisch. Erhalte sofort Benachrichtigungen bei neuen Wohnungen oder Häusern, die genau zu deinen Kriterien passen.",
    sortOrder: 5,
  },
  {
    slug: "kleingedrucktes",
    name: "Checko Kleingedrucktes",
    icon: "🔍",
    status: "coming_soon",
    isActive: false,
    description:
      "Lade AGB oder Verträge hoch und Checko analysiert das Kleingedruckte für dich. Versteckte Klauseln, Risiken und unfaire Bedingungen werden sofort markiert.",
    sortOrder: 6,
  },
  {
    slug: "uebersetzer",
    name: "Checko Übersetzer",
    icon: "🌍",
    status: "coming_soon",
    isActive: false,
    description:
      "Übersetze Dokumente, E-Mails und Texte professionell in über 50 Sprachen. Natürlich klingende Übersetzungen statt steifer Maschinentexte.",
    sortOrder: 7,
  },
  {
    slug: "budget",
    name: "Checko Budget",
    icon: "💰",
    status: "coming_soon",
    isActive: false,
    description:
      "Behalte den Überblick über deine Finanzen. Checko analysiert deine Ausgaben, erkennt Sparpotenzial und hilft dir, dein Budget einzuhalten.",
    sortOrder: 8,
  },
  {
    slug: "versicherung",
    name: "Checko Versicherung",
    icon: "🏥",
    status: "coming_soon",
    isActive: false,
    description:
      "Vergleiche Versicherungsangebote und finde die beste Lösung für dich. Checko analysiert deine aktuelle Police und zeigt Einsparpotenzial auf.",
    sortOrder: 9,
  },
  {
    slug: "steuer",
    name: "Checko Steuer",
    icon: "📊",
    status: "coming_soon",
    isActive: false,
    description:
      "Mach deine Steuererklärung einfach und schnell. Checko hilft dir, alle Abzüge zu finden und optimiert deine Erklärung für maximale Rückerstattung.",
    sortOrder: 10,
  },
  {
    slug: "reise",
    name: "Checko Reise",
    icon: "✈️",
    status: "coming_soon",
    isActive: false,
    description:
      "Überwache Flug- und Hotelpreise automatisch. Checko findet den besten Zeitpunkt zum Buchen und benachrichtigt dich bei Preisänderungen.",
    sortOrder: 11,
  },
  {
    slug: "auto",
    name: "Checko Auto",
    icon: "🚗",
    status: "coming_soon",
    isActive: false,
    description:
      "Finde das perfekte Auto zum besten Preis. Checko durchsucht alle Plattformen und prüft Inseratshistorie, Preisfairness und mögliche Mängel.",
    sortOrder: 12,
  },
  {
    slug: "energie",
    name: "Checko Energie",
    icon: "⚡",
    status: "coming_soon",
    isActive: false,
    description:
      "Vergleiche Strom- und Gasanbieter automatisch. Checko findet günstigere Tarife und hilft dir beim unkomplizierten Wechsel.",
    sortOrder: 13,
  },
  {
    slug: "handy",
    name: "Checko Handy",
    icon: "📱",
    status: "coming_soon",
    isActive: false,
    description:
      "Finde den besten Handyvertrag für deine Bedürfnisse. Checko vergleicht alle Anbieter und zeigt dir versteckte Kosten und bessere Alternativen.",
    sortOrder: 14,
  },
  {
    slug: "garantie",
    name: "Checko Garantie",
    icon: "🔧",
    status: "coming_soon",
    isActive: false,
    description:
      "Behalte den Überblick über deine Garantien und Gewährleistungen. Checko erinnert dich rechtzeitig vor Ablauf und hilft bei Reklamationen.",
    sortOrder: 15,
  },
  {
    slug: "umzug",
    name: "Checko Umzug",
    icon: "📦",
    status: "coming_soon",
    isActive: false,
    description:
      "Plane deinen Umzug stressfrei. Checko erstellt Checklisten, vergleicht Umzugsfirmen und kümmert sich um Adressänderungen und Ummeldungen.",
    sortOrder: 16,
  },
  {
    slug: "haustier",
    name: "Checko Haustier",
    icon: "🐾",
    status: "coming_soon",
    isActive: false,
    description:
      "Finde die besten Angebote für dein Haustier. Checko vergleicht Futter, Versicherungen und Tierärzte und erinnert dich an wichtige Termine.",
    sortOrder: 17,
  },
  {
    slug: "fitness",
    name: "Checko Fitness",
    icon: "💪",
    status: "coming_soon",
    isActive: false,
    description:
      "Vergleiche Fitnessstudio-Abos und finde das beste Angebot in deiner Nähe. Checko analysiert Leistungen, Vertragsbedingungen und versteckte Kosten.",
    sortOrder: 18,
  },
  {
    slug: "dating",
    name: "Checko Dating",
    icon: "❤️",
    status: "coming_soon",
    isActive: false,
    description:
      "Optimiere dein Dating-Profil mit KI-Unterstützung. Checko analysiert dein Profil, schlägt Verbesserungen vor und hilft beim Schreiben von Nachrichten.",
    sortOrder: 19,
  },
  {
    slug: "karriere",
    name: "Checko Karriere",
    icon: "🎯",
    status: "coming_soon",
    isActive: false,
    description:
      "Optimiere deinen Lebenslauf und Bewerbungen. Checko analysiert Stelleninserate, passt dein CV an und bereitet dich auf Vorstellungsgespräche vor.",
    sortOrder: 20,
  },
];

async function main() {
  console.log("🦎 Starte Checko Module Seed...\n");

  for (const mod of modules) {
    const result = await prisma.module.upsert({
      where: { slug: mod.slug },
      update: {
        name: mod.name,
        icon: mod.icon,
        status: mod.status,
        isActive: mod.isActive,
        description: mod.description,
        sortOrder: mod.sortOrder,
        priceMonthly: 0,
      },
      create: {
        slug: mod.slug,
        name: mod.name,
        icon: mod.icon,
        status: mod.status,
        isActive: mod.isActive,
        description: mod.description,
        sortOrder: mod.sortOrder,
        priceMonthly: 0,
      },
    });
    const statusIcon = mod.isActive ? "✅" : "⏳";
    console.log(`  ${statusIcon} ${mod.icon} ${result.name} (${mod.slug})`);
  }

  console.log(`\n🎉 ${modules.length} Module erfolgreich geseeded!`);
}

main()
  .catch((e) => {
    console.error("❌ Seed-Fehler:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
