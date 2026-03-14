// JSON-LD Schema.org Komponenten für SEO
// Organization, Product, FAQ

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Checko",
    url: "https://checko.ch",
    description:
      "Checko bietet smarte Module für Preisüberwachung, Vertragscheck, Betrugsschutz und mehr. Dein AI-Toolkit für den Alltag.",
    logo: "https://checko.ch/favicon.ico",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ProductJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description: string;
  url: string;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    url,
    brand: {
      "@type": "Organization",
      name: "Checko",
    },
    offers: {
      "@type": "Offer",
      priceCurrency: "CHF",
      price: "0.90",
      description: "Ab 0.90 CHF pro Checko (Mengenrabatt möglich)",
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FaqJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Was ist Checko?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Checko ist eine modulare Plattform mit smarten Tools für den Alltag. Du wählst nur die Module, die du brauchst — z.B. Preisüberwachung, Betrugsschutz oder Vertragscheck — und bezahlst pro Nutzung mit Checkos.",
        },
      },
      {
        "@type": "Question",
        name: "Was sind Checkos?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Checkos sind die interne Währung von Checko. Du kaufst Checkos und setzt sie ein, um Module zu nutzen. Es gibt keine Abos — du bezahlst nur, was du wirklich brauchst.",
        },
      },
      {
        "@type": "Question",
        name: "Ist Checko kostenlos?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Die Registrierung ist kostenlos und du erhältst 10 Gratis-Checkos zum Start. Danach kaufst du Checkos-Pakete ab 5 Checkos. Je mehr du kaufst, desto günstiger wird es.",
        },
      },
      {
        "@type": "Question",
        name: "Welche Module bietet Checko an?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Checko bietet 20 Module an, darunter Preisradar (Preisüberwachung), Scam Shield (Betrugsschutz), Legal (Rechtsvorlagen), Abo-Killer (Abos kündigen), Immo (Wohnungssuche) und viele mehr. Neue Module werden laufend freigeschaltet.",
        },
      },
      {
        "@type": "Question",
        name: "Wie funktioniert das Preisradar?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Mit dem Preisradar überwachst du Marktplätze automatisch. Definiere Suchbegriffe, Preislimits und Qualitätsstufen — Checko prüft regelmässig und benachrichtigt dich sofort bei Treffern.",
        },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
