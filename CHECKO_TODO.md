# CHECKO TODO — Nächster Auftrag

## Priorität 1: UX-Bugs fixen (Preisradar)

### 1.1 Suchkarten müssen Kategorie-Details anzeigen
- GET `/api/modules/preisradar/searches` muss alle Kategorie-Felder zurückgeben (vehicleMake, vehicleModel, yearFrom, yearTo, kmFrom, kmTo, fuelType, transmission etc.)
- Die Suchkarte im Dashboard muss anzeigen: "🚗 Audi S3 | Baujahr: 1999-2004 | Benzin | Automatik"
- Bei Immobilien: "🏠 Wohnung | Miete | 3+ Zimmer | 60m² | Zürich"
- Bei Möbel: "🪑 Sofa"

### 1.2 Bearbeiten-Modal muss Felder laden
- `openEditModal(search)` muss alle Kategorie-Felder in die State-Variablen laden
- Wenn User "Bearbeiten" klickt, müssen Marke, Modell, Baujahr etc. vorausgefüllt sein

### 1.3 Bilder in Benachrichtigungen/Treffer anzeigen
- `imageUrl` ist in der DB vorhanden (eBay, AutoScout liefern Bilder)
- Die Alert-Cards müssen Thumbnails zeigen (links neben Titel/Preis)
- Fallback: Plattform-Icon wenn kein Bild

### 1.4 Horizontales Scrollen auf Mobile fixen
- Gesamtseite und Modal prüfen
- Alle grids responsive machen (grid-cols-1 auf Mobile, grid-cols-2 auf Tablet+)

---

## Priorität 2: Scraper verbessern

### 2.1 Willhaben fixen
- Preise sind immer 0 → __NEXT_DATA__ Parser prüfen
- Bilder fehlen → imageUrl aus Willhaben-Response extrahieren
- URLs sind generisch → Inserat-URL aus adId konstruieren: `willhaben.at/iad/kaufen-und-verkaufen/d/-{adId}/`

### 2.2 AutoScout24 Jahresfilter
- yearFrom/yearTo als URL-Parameter: `?yearFrom=1999&yearTo=2004`
- Testen ob AutoScout24 diese Parameter akzeptiert
- Format: `/de/s/mo-s3/mk-audi?yearFrom=1999&yearTo=2004`

### 2.3 Post-Scrape Filterung
- Ergebnisse nach Baujahr/km/Preis filtern BEVOR sie als Alerts gespeichert werden
- Nur wenn die Felder gesetzt sind
- Baujahr im Titel suchen (Regex: 4-stellige Zahl 19xx/20xx)

---

## Priorität 3: Qualität & Polish

### 3.1 Preise korrekt formatieren
- Preise sind in Rappen gespeichert (z.B. 1489000 = CHF 14'890)
- Anzeige: CHF mit Tausender-Trennzeichen (Apostroph, Schweizer Format)

### 3.2 Plattform-Icons
- Jede Plattform braucht ein erkennbares Icon/Logo in den Treffern

### 3.3 Ladezeit der Suche
- "Erste Suche läuft..." muss nach ~30s automatisch refreshen
- Polling alle 10s bis lastScrapedAt gesetzt ist

---

## NICHT ANFASSEN (funktioniert!)

- ✅ Stripe Integration (Checkos kaufen)
- ✅ Auth (Login/Register/Verify)
- ✅ Glücksrad
- ✅ Checkos-System
- ✅ E-Mail (SMTP via Infomaniak)
- ✅ AutoScout24 Scraper (mk-/mo- URLs)
- ✅ eBay KA Scraper (mit Bildern!)
- ✅ Ricardo Scraper
- ✅ Cron-Job auf VPS
- ✅ SSL/Traefik
- ✅ Docker Compose Setup
