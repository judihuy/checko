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
      "Definiere eine Suche — z.B. 'iPhone 14 Pro unter 500 CHF'. Checko überwacht automatisch Ricardo, Tutti, eBay Kleinanzeigen und weitere Marktplätze. Sofort-Alert wenn ein Match auftaucht, mit KI-Preisbewertung und Betrugs-Warnung.",
    sortOrder: 1,
  },
  {
    slug: "scam-shield",
    name: "Checko Scam Shield",
    icon: "🛡️",
    status: "coming_soon",
    isActive: false,
    description:
      "Echtzeit-Betrugsschutz: Browser-Extension warnt bei Fake-Shops, Link-Check erkennt Phishing, Screenshot-Check analysiert verdächtige WhatsApp-Nachrichten. Warnt BEVOR du Geld verlierst.",
    sortOrder: 2,
  },
  {
    slug: "legal",
    name: "Checko Legal",
    icon: "⚖️",
    status: "coming_soon",
    isActive: false,
    description:
      "KI-Rechtssystem für Alltagsprobleme: Kündigungen schreiben, Mahnungen formulieren, Widersprüche gegen Bussgelder, Verträge prüfen. Auf Schweizer und deutsches Recht spezialisiert.",
    sortOrder: 3,
  },
  {
    slug: "abo-killer",
    name: "Checko Abo-Killer",
    icon: "✂️",
    status: "coming_soon",
    isActive: false,
    description:
      "Kontoauszüge hochladen (Bank, Kreditkarte, Twint, PayPal) — KI findet automatisch ALLE laufenden Abos und vergessene Mitgliedschaften. Kündigungs-Assistent generiert fertige Kündigungsschreiben.",
    sortOrder: 4,
  },
  {
    slug: "immo",
    name: "Checko Immo",
    icon: "🏠",
    status: "coming_soon",
    isActive: false,
    description:
      "Sofort-Alert bei neuen Wohnungsinseraten unter Marktwert. KI generiert personalisiertes Bewerbungsschreiben, analysiert Pendeldistanz und Nachbarschafts-Score. Schneller als andere Bewerber.",
    sortOrder: 5,
  },
  {
    slug: "kleingedrucktes",
    name: "Checko Kleingedrucktes",
    icon: "🔍",
    status: "coming_soon",
    isActive: false,
    description:
      "AGB, Mietvertrag, Arbeitsvertrag hochladen — KI übersetzt Juristendeutsch in Klartext. Ampel-Analyse: problematische Klauseln rot, neutrale gelb, gute grün.",
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
      "Alle Versicherungspolicen hochladen — KI findet Doppelversicherungen, Deckungslücken und günstigere Alternativen. Krankenkassen-Optimierer berechnet die beste Franchise.",
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
      "Flug verspätet? Paket nicht angekommen? Problem in 2 Sätzen beschreiben — KI generiert sofort den perfekten Reklamationsbrief, rechtlich korrekt mit Fristsetzung und Gesetzesverweis.",
    sortOrder: 11,
  },
  {
    slug: "auto",
    name: "Checko Auto",
    icon: "🚗",
    status: "coming_soon",
    isActive: false,
    description:
      "Marke, Modell, Baujahr, Kilometer eingeben — sofort fairer Marktwert mit Preisspanne. Plus Prognose ob der Preis steigt oder fällt. Vergleich mit aktuellen Inseraten auf AutoScout24, Tutti & Co.",
    sortOrder: 12,
  },
  {
    slug: "energie",
    name: "Checko Energie",
    icon: "⚡",
    status: "coming_soon",
    isActive: false,
    description:
      "Stromrechnung analysieren, Verbrauch mit Durchschnitt vergleichen, günstigeren Anbieter finden. Plus Solar-Rechner und Wärmepumpen-Vergleich. Spar-Potenzial sofort sichtbar.",
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

// ==================== SYSTEM SETTINGS ====================

const defaultSettings = [
  { key: "wheel_registration_min", value: "1" },
  { key: "wheel_registration_max", value: "50" },
  { key: "wheel_daily_min", value: "1" },
  { key: "wheel_daily_max", value: "10" },
];

async function main() {
  console.log("🦎 Starte Checko Module Seed...\n");

  // System-Settings seeden
  console.log("⚙️ System-Settings...");
  for (const setting of defaultSettings) {
    await prisma.systemSettings.upsert({
      where: { key: setting.key },
      update: {}, // Bestehende Werte NICHT überschreiben
      create: { id: setting.key, key: setting.key, value: setting.value },
    });
    console.log(`  ✅ ${setting.key} = ${setting.value}`);
  }
  console.log("");

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
