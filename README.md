# Checko — Dein AI-Toolkit für alles 🦎

Modulare AI-Web-Plattform (PWA) unter [checko.ch](https://checko.ch).

## Tech Stack
- Next.js 14 + TypeScript
- Prisma + MySQL
- NextAuth.js
- Stripe Subscriptions
- Puppeteer (Scraping)
- Claude Haiku 4.5 (KI-Bewertung)

## Erstes Modul: Checko Preisradar
Marktplatz-Überwachung für Schnäppchen auf eBay Kleinanzeigen, Tutti.ch und Ricardo.ch.

## Setup
```bash
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

## Hosting
Docker Container auf Hostinger VPS (separat von OpenClaw).

---
© 2026 Checko — Ein Produkt von Huy Digital
