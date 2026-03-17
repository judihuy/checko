# CHECKO — Aktueller Stand (16.03.2026, 20:00 Uhr)

## WICHTIG: VOR JEDER ARBEIT LESEN!

Fort-Knox Agent hat am 16.03.2026 zahlreiche Änderungen DIREKT auf dem VPS gemacht (NICHT via git).
Der git-Stand auf GitHub ist VERALTET. Der aktuelle Code ist NUR auf dem VPS unter /opt/checko.

**Codee MUSS vor jedem Commit den aktuellen VPS-Stand als Basis nehmen!**
```bash
cd /opt/checko && git add -A && git commit -m "sync: Fort-Knox direct changes 2026-03-16" && git push
```

---

## Projektübersicht

- **Name:** Checko — Modulare AI-Web-Plattform (PWA)
- **Domain:** https://checko.ch (LIVE mit SSL)
- **Firma:** Huy Digital (MIT Leerzeichen!)
- **Logo:** Gecko 🦎
- **GitHub:** https://github.com/judihuy/checko (PUBLIC)
- **VPS Path:** /opt/checko
- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind CSS
- **DB:** MySQL 8.0 (Docker Container `checko-mysql`)
- **ORM:** Prisma 5.22.0
- **Auth:** NextAuth.js
- **Container:** Docker Compose (`checko-app` + `checko-mysql`)
- **Reverse Proxy:** Traefik (automatisches SSL)
- **Port:** 3100 (intern)

---

## Aktuell aktive Features

### 1. Checko Preisradar (Erstes Modul)
- Marktplatz-Überwachung über 6 aktive Plattformen
- Automatische Scraper mit Cron-Job (*/5 * * * *)
- 3 Qualitätsstufen: Standard (24h), Premium (12h), Pro (5min)
- Kategorie-spezifische Suchfelder (Fahrzeuge, Immobilien, Möbel)
- Preisanalyse mit Claude Haiku

### 2. Checkos-Währungssystem
- Eigene Währung: 1 Checko = 1 CHF
- Stripe-Integration für Kauf (20/50/100/250 Checkos)
- Glücksrad (täglicher Bonus)
- Refer-a-Friend Programm
- Botschafter-Programm

### 3. Auth & User Management
- E-Mail Registration + Verification
- Login/Logout
- Admin-Bereich

---

## Aktive Scraper-Plattformen

| Plattform | Status | Scraper-Typ | Besonderheiten |
|-----------|--------|-------------|----------------|
| eBay Kleinanzeigen | ✅ Aktiv | HTTP + Puppeteer Fallback | Proxy erforderlich |
| Ricardo | ✅ Aktiv | Puppeteer | Ohne Proxy |
| Tutti | ✅ Aktiv | Puppeteer | Proxy, manchmal 403 |
| Anibis | ✅ Aktiv | Puppeteer | Proxy |
| Willhaben | ✅ Aktiv | HTTP (__NEXT_DATA__) | ⚠️ Preise=0, keine Bilder |
| AutoScout24 | ✅ Aktiv | Puppeteer | URL: /de/s/mo-{model}/mk-{make} |

### Deaktivierte Plattformen
| Plattform | Grund |
|-----------|-------|
| Google Shopping | CAPTCHA blockiert |
| Amazon | CAPTCHA blockiert |
| Comparis | DataDome Captcha |

---

## Bekannte Bugs (MÜSSEN GEFIXT WERDEN)

### 🐛 Bug 1: Bilder werden nicht angezeigt
- **Problem:** imageUrl ist in der DB vorhanden (eBay, AutoScout), wird aber im Frontend nicht angezeigt
- **Betroffene Datei:** `src/app/dashboard/preisradar/page.tsx` (Treffer/Benachrichtigungen-Ansicht)
- **Lösung:** Die Alert-Cards müssen `imageUrl` rendern (z.B. als Thumbnail links)

### 🐛 Bug 2: Kategorie-Felder werden nicht in Suchkarten angezeigt
- **Problem:** User sieht in der Suchkarten-Übersicht NICHT was er eingegeben hat (keine Marke, kein Modell, kein Baujahr etc.)
- **Betroffene Datei:** `src/app/dashboard/preisradar/page.tsx` (Suchkarten-Rendering, ca. Zeile 600-700)
- **API gibt zurück:** `query`, `platforms`, `status`, `alertCount` — aber NICHT die Kategorie-Felder
- **Lösung:** 
  1. GET-Endpoint muss category, subcategory, vehicleMake, vehicleModel, yearFrom, yearTo etc. zurückgeben
  2. Suchkarten müssen diese Felder anzeigen (z.B. "🚗 Audi S3 | 1999-2004 | Benzin | Automatik")

### 🐛 Bug 3: Baujahr/Filter werden nicht an Scraper weitergegeben
- **Problem:** User gibt Baujahr 1999-2004 ein, aber Scraper liefert alle Jahrgänge
- **Ursache:** Die Felder sind zwar in der DB und werden an die Scraper durchgereicht (via ScraperOptions), aber NUR AutoScout24 nutzt vehicleMake/vehicleModel für die URL. Keiner filtert nach yearFrom/yearTo/fuelType/transmission.
- **Lösung:** 
  1. AutoScout24: yearFrom/yearTo als URL-Parameter nutzen (z.B. `?yearFrom=1999&yearTo=2004`)
  2. Alle Scraper: Post-Scrape Filter — Ergebnisse die nicht zum Baujahr passen rausfiltern (schwierig, da Baujahr nicht immer im Titel steht)
  3. Alternativ: UI zeigt klar an "Filter gelten nur für unterstützte Plattformen"

### 🐛 Bug 4: Bearbeiten-Modal lädt Kategorie-Felder nicht
- **Problem:** Beim Bearbeiten einer Suche sind alle Kategorie-Felder leer
- **Betroffene Datei:** `src/app/dashboard/preisradar/page.tsx` (openEditModal Funktion)
- **Lösung:** Die edit-Modal muss die gespeicherten Werte laden und in die State-Variablen setzen

### 🐛 Bug 5: Willhaben Preise und Bilder
- **Problem:** Willhaben liefert Treffer aber Preis=0, imageUrl=NULL, URLs sind generisch
- **Betroffene Datei:** `src/lib/scraper/willhaben.ts`
- **Ursache:** Der __NEXT_DATA__ Parser findet die Preise und Bilder nicht korrekt
- **Lösung:** Willhaben __NEXT_DATA__ Response analysieren und Parser anpassen

### 🐛 Bug 6: Horizontales Scrollen auf Mobile
- **Problem:** Seite passt nicht ganz auf Mobilbildschirm, horizontales Scrollen nötig
- **Teilweise gefixt:** overflow-x-hidden auf Modal, grid-cols responsive
- **Möglicherweise noch nötig:** Gesamtseite prüfen

---

## Prisma Schema — Neue Felder in PreisradarSearch

Am 16.03.2026 wurden 16 neue Felder hinzugefügt:

```prisma
// Fahrzeug-Felder
vehicleMake     String?
vehicleModel    String?
yearFrom        Int?
yearTo          Int?
kmFrom          Int?
kmTo            Int?
fuelType        String?
transmission    String?
engineSizeCcm   Int?
motorcycleType  String?

// Immobilien-Felder
propertyType    String?
propertyOffer   String?
rooms           Int?
areaM2          Int?
location        String?

// Möbel-Felder
furnitureType   String?
```

Diese Felder werden:
- ✅ Im Frontend erfasst (Kategorie-Suchmasken)
- ✅ An die API gesendet
- ✅ In der DB gespeichert
- ✅ An die Scraper durchgereicht (via ScraperOptions)
- ❌ NICHT in den Suchkarten angezeigt
- ❌ NICHT im Edit-Modal geladen
- ❌ NICHT von allen Scrapern genutzt (nur AutoScout nutzt make/model)

---

## Scraper-Architektur

### ScraperOptions Interface (base.ts)
```typescript
export interface ScraperOptions {
  maxPrice?: number;   // in Rappen
  minPrice?: number;   // in Rappen
  limit?: number;
  category?: string;
  subcategory?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  yearFrom?: number;
  yearTo?: number;
  kmFrom?: number;
  kmTo?: number;
  fuelType?: string;
  transmission?: string;
  engineSizeCcm?: number;
  motorcycleType?: string;
  propertyType?: string;
  propertyOffer?: string;
  rooms?: number;
  areaM2?: number;
  location?: string;
  furnitureType?: string;
}
```

### AutoScout24 URL-Format (WICHTIG!)
- Mit Marke+Modell: `/de/s/mo-{model}/mk-{make}` (z.B. `/de/s/mo-s3/mk-audi`)
- Nur Marke: `/de/s/mk-{make}`
- Ohne Marke: `/de/s?q={freitext}`
- **Das mk-/mo- Format liefert präzise, gefilterte Ergebnisse!**

### Scheduler (scheduler.ts)
- Cron auf VPS: `*/5 * * * * curl -s -m 120 -X POST https://checko.ch/api/cron/preisradar -H "x-cron-secret: C5Qs8Sp9AVNyLO1FPNAB2Hqpyatlbcci"`
- Log: `/var/log/checko-cron.log`
- Intervalle: Standard=1440min(24h), Premium=720min(12h), Pro=5min

---

## API-Routen (Preisradar)

| Route | Method | Beschreibung |
|-------|--------|-------------|
| `/api/modules/preisradar/searches` | GET | Eigene Suchen auflisten |
| `/api/modules/preisradar/searches` | POST | Neue Suche erstellen |
| `/api/modules/preisradar/searches/[id]` | PUT | Suche bearbeiten |
| `/api/modules/preisradar/searches/[id]` | DELETE | Suche löschen |
| `/api/modules/preisradar/searches/[id]/activate` | POST | Draft aktivieren |
| `/api/cron/preisradar` | POST | Cron-Endpoint (x-cron-secret Header) |

### POST /searches Body:
```json
{
  "query": "Audi S3",           // Optional wenn vehicleMake gesetzt
  "platforms": ["autoscout", "ebay-ka"],
  "qualityTier": "standard",
  "duration": "1d",
  "category": "Fahrzeuge",
  "subcategory": "Autos",
  "vehicleMake": "Audi",
  "vehicleModel": "S3",
  "yearFrom": 1999,
  "yearTo": 2004
}
```

---

## Wichtige Dateien

| Datei | Beschreibung |
|-------|-------------|
| `src/app/dashboard/preisradar/page.tsx` | Haupt-Frontend (~1400 Zeilen) |
| `src/app/api/modules/preisradar/searches/route.ts` | API: Suchen CRUD |
| `src/app/api/modules/preisradar/searches/[id]/activate/route.ts` | Draft aktivieren |
| `src/app/api/cron/preisradar/route.ts` | Cron-Endpoint |
| `src/lib/scraper/scheduler.ts` | Scraper-Scheduler |
| `src/lib/scraper/base.ts` | Base-Scraper + ScraperOptions |
| `src/lib/scraper/autoscout.ts` | AutoScout24 (Puppeteer) |
| `src/lib/scraper/willhaben.ts` | Willhaben (__NEXT_DATA__) |
| `src/lib/scraper/ebay-ka.ts` | eBay Kleinanzeigen |
| `src/lib/scraper/ricardo.ts` | Ricardo |
| `src/lib/scraper/tutti.ts` | Tutti |
| `src/lib/scraper/anibis.ts` | Anibis |
| `prisma/schema.prisma` | DB Schema |
| `Dockerfile` | NIEMALS ÄNDERN ohne alle Module zu prüfen! |

---

## REGELN (NIEMALS BRECHEN!)

1. **Dockerfile NIEMALS ändern** ohne zu prüfen dass OpenSSL, nodemailer, undici, Chromium, Puppeteer, Stripe drin bleiben
2. **Prisma: findFirst statt findUnique** — Engine Panic Bug mit cuid IDs
3. **Prisma Version pinnen:** `npx --yes prisma@5.22.0 db push --accept-data-loss`
4. **KI-Model-Namen NIEMALS dem User zeigen** — nur Standard/Premium/Pro
5. **Firmenname:** "Huy Digital" (MIT Leerzeichen)
6. **Redirects:** NIEMALS `new URL(..., request.url)`, IMMER `getBaseUrl()` / `NEXTAUTH_URL`
7. **ModuleCard Links:** Aktiv → `/dashboard/[slug]`, Coming Soon → `/module/[slug]`
8. **VPS Cron-Job nicht anfassen** — `*/5 * * * *` auf dem Host, nicht im Container
9. **Existing features NICHT brechen** — jede Änderung muss rückwärtskompatibel sein
10. **Nach jedem Commit: git push** — Fort-Knox Agent deployed automatisch

---

## ENV-Variablen (/opt/checko/.env)

```
DATABASE_URL=mysql://checko_user:vN3v4Zx3DSUJUtk0o85kqF3bxd5IgBdP@checko-mysql:3306/checko
NEXTAUTH_URL=https://checko.ch
NEXTAUTH_SECRET=5fH4lKTWWyK3MT5KZv05EIt5QTfnT27cpcfcljvWAlw
NEXT_PUBLIC_APP_URL=https://checko.ch
SMTP_HOST=mail.infomaniak.com
SMTP_PORT=587
SMTP_USER=support@checko.ch
SMTP_PASSWORD=@Jasmin2021s7ajg5
SMTP_FROM=Checko <support@checko.ch>
ANTHROPIC_API_KEY=sk-ant-api03-...
CRON_SECRET=C5Qs8Sp9AVNyLO1FPNAB2Hqpyatlbcci
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SCRAPER_PROXY=http://kfxavtnr-de-1:4f55trvs9n0y@p.webshare.io:80
```

---

## Deploy-Workflow

```bash
cd /opt/checko
git stash && git pull
docker compose build --no-cache
docker compose up -d
# Prisma Schema sync:
docker run --rm --network checko_checko-network -v /opt/checko:/app -w /app node:22-alpine sh -c "apk add --no-cache openssl > /dev/null 2>&1 && npx --yes prisma@5.22.0 db push --accept-data-loss"
# Seed if needed:
docker exec checko-app npx tsx prisma/seed.ts
```
