# SCRAPER UPGRADE - Anti-Block + Monitoring

## Problem
Alle Scraper werden von Cloudflare geblockt (HTTP 403). Residential Proxy reicht nicht - Cloudflare erkennt Headless-Browser-Fingerprint.

## Loesung

Beide Seiten haben interne JSON/GraphQL APIs. Statt Puppeteer:
- Network-Tab analysieren, interne API-Endpoints finden
- Direkt per fetch/axios aufrufen mit echten Browser-Headers
- Proxy fuer IP-Rotation nutzen
- Das umgeht Cloudflare komplett!

### 2. Proxy-Rotation + Monitoring
Neues File: src/lib/scraper/proxy-manager.ts
- Webshare Residential Proxy mit Laender-Rotation (de, ch, at)
- Bei 403: anderes Land versuchen
- Bei 3x 403: 60s Pause
- Erfolgsrate pro Plattform tracken

Neues File: src/lib/scraper/health-monitor.ts
- Nach jedem Scrape: Erfolgsrate berechnen
- Wenn 0 Prozent ueber 3 Durchlaeufe: Telegram-Alert
- Bot Token: 8774648234:AAGlsfQzsWPSVZVtMucpQHPCBWjig9c3DEU
- Chat ID: 5464533686

### 3. Tutti + Anibis deaktivieren
Cloudflare-geschuetzt, kein API-Workaround. Im UI anzeigen: Temporaer nicht verfuegbar

- PROXY_USERNAME=kfxavtnr
- PROXY_PASSWORD=4f55trvs9n0y
- PROXY_HOST=p.webshare.io
- PROXY_PORT=80

## Prioritaet
1. Ricardo API (wichtigste CH-Plattform)
2. AutoScout API
3. Monitoring + Telegram-Alerts
4. Tutti/Anibis deaktivieren

## Constraints
- Dockerfile: Bulk COPY node_modules
- Build muss durchlaufen (tsc + next build)
- findFirst statt findUnique
