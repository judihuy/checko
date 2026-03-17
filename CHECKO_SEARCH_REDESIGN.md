# Auftrag: Such-Formular Redesign + Scraper-Filter + KI-Nachfilterung

## 1. Suchformular — Logischer Aufbau

### Aktuelles Problem:
- Suchbegriff-Feld oben ist sinnlos wenn Kategorie gewählt wird
- KM-Filter (kmFrom/kmTo) wird vom Scraper IGNORIERT
- Alle Felder werden immer angezeigt → unprofessionell

### Neuer Ablauf:
1. **Schritt 1: Kategorie wählen** (Pflicht)
   - Fahrzeuge (Autos, Motorräder)
   - Immobilien
   - Möbel / Haushalt
   - Allgemein (Freitext)

2. **Schritt 2: Felder erscheinen je nach Kategorie**
   
   **Fahrzeuge:**
   - Marke (Pflicht) — Dropdown oder Freitext
   - Modell (Optional) — Freitext
   - Baujahr von / bis
   - KM von / bis
   - Preis von / bis (CHF)
   - Getriebe (Alle/Manuell/Automatik)
   - Treibstoff (Alle/Benzin/Diesel/Elektro/Hybrid)
   - KEIN allgemeines Suchbegriff-Feld!
   
   **Immobilien:**
   - Typ (Wohnung/Haus/Grundstück)
   - Kauf/Miete
   - Zimmer von / bis
   - Fläche m² von / bis
   - Preis von / bis
   - Ort/Region
   - KEIN allgemeines Suchbegriff-Feld!
   
   **Möbel / Haushalt:**
   - Suchbegriff (Pflicht)
   - Typ (Optional: Sofa, Tisch, Küche, etc.)
   - Preis von / bis
   - Zustand (Alle/Neu/Wie neu/Gebraucht)
   
   **Allgemein:**
   - Suchbegriff (Pflicht)
   - Preis von / bis
   - Zustand (Optional)

3. **Schritt 3: Plattformen + Qualität + Dauer** (wie jetzt)

## 2. Scraper-URLs — MÜSSEN alle Filter nutzen

### Jede Plattform MUSS die Filter in die URL einbauen:

**Ricardo.ch:**
- Preis: `?price_min=X&price_max=Y`
- Kategorie Fahrzeuge: `/de/c/fahrzeuge/`

**AutoScout24.ch:**
- Bereits implementiert: `?yearFrom=X&yearTo=Y`
- FEHLT: `&kmFrom=X&kmTo=Y` → `&km_from=X&km_to=Y` oder `&mileageFrom=X&mileageTo=Y`
- Prüfe die echte URL-Struktur auf autoscout24.ch!

**Kleinanzeigen.de:**
- Preis: `/s-preis:MIN:MAX/`
- Kategorie: `/s-autos/` für Fahrzeuge

**Tutti.ch:**
- Preis: `?pr=MIN-MAX`
- Wenn Cloudflare blockiert: Plattform als "eingeschränkt" markieren

**Anibis.ch:**
- Preis: `?pr=MIN-MAX`
- Wenn Cloudflare blockiert: Plattform als "eingeschränkt" markieren

**Willhaben.at:**
- Preis: `?PRICE_FROM=X&PRICE_TO=Y`
- KM: Prüfe URL-Parameter

### WICHTIG: Bevor du die URLs baust, gehe auf JEDE Plattform, mache eine echte Suche mit Filtern und kopiere die URL-Parameter! Nicht raten!

## 3. KI-Nachfilterung (Neues Feature)

### Ablauf:
1. Scraper holt Resultate wie bisher
2. BEVOR Resultate als Alerts gespeichert werden: KI prüft jedes Resultat
3. KI bekommt: Titel, Preis, Beschreibung des Inserats + die Suchkriterien des Users
4. KI entscheidet: RELEVANT (speichern) oder IRRELEVANT (verwerfen)

### Implementierung:
- Nutze Claude Haiku (günstig, schnell): `anthropic/claude-3-5-haiku-latest` via OpenRouter
- API Key: aus ENV `OPENROUTER_API_KEY` oder `ANTHROPIC_API_KEY`
- Prompt-Template:
```
Du bist ein Relevanz-Filter für Marktplatz-Inserate.
Suchkriterien: {marke}, {modell}, Baujahr {yearFrom}-{yearTo}, KM {kmFrom}-{kmTo}, Preis {minPrice}-{maxPrice}
Inserat: "{title}" — {price} CHF — "{description}"
Ist dieses Inserat relevant? Antworte NUR mit JA oder NEIN.
```

- Batch-Verarbeitung: Maximal 5 API-Calls gleichzeitig (Rate Limit)
- Kosten: ~$0.001 pro Resultat (Haiku ist billig)
- Wenn KI sagt NEIN → Resultat wird NICHT als Alert gespeichert
- Log: `[KI-Filter] "BMW X5 2003" — IRRELEVANT (KM 15000 < 100000)`

### Fallback:
- Wenn KI-API nicht erreichbar → alle Resultate durchlassen (besser zu viel als zu wenig)
- Timeout: 5s pro API-Call

## 4. Regeln
- Dockerfile: Neue COPY-Zeilen für puppeteer-extra Deps NICHT NÖTIG — Dockerfile kopiert jetzt ALLE node_modules
- findFirst statt findUnique
- "Huy Digital" (mit Leerzeichen)
- 1 Commit, Reviewer muss approven
- Nach Push: Selbst testen!
- Meine Fixes (maxPrice Validierung, error details, Dockerfile) NICHT überschreiben!

## 5. Priorität
1. Suchformular-Redesign (Kategorie → dynamische Felder)
2. Scraper-URLs mit echten Filtern
3. KI-Nachfilterung
