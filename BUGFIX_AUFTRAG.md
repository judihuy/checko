# BUGFIX-AUFTRAG: Kritische Fixes für Preisradar

## Priorität: HOCH — Alles muss perfekt funktionieren!

---

## Bug 1: Mobile Overflow
- Suchkarten sind zu breit auf Mobile (horizontales Scrollen nötig)
- "Aktiv" und "Löschen" Buttons werden abgeschnitten
- Auch auf der Checkos-kaufen-Seite: Rabatt-Staffel wird rechts abgeschnitten
- **Fix:** Alle Karten/Container `max-width: 100%`, `overflow-x: hidden`, responsive Breakpoints prüfen

## Bug 2: Glücksrad Gewinn falsch
- Rad-Animation zeigt auf eine Zahl, aber "Gewonnen: X Checkos" zeigt eine andere Zahl
- Berechnung und Animation sind nicht synchron
- **Fix:** Endposition der Animation muss exakt zum berechneten Gewinn passen

## Bug 3: Checkos kaufen funktioniert nicht
- "10 Checkos kaufen — CHF 10.00" Button tut nichts
- Stripe-Checkout wird nicht ausgelöst
- **Fix:** Stripe-Integration prüfen, Checkout-Session erstellen und weiterleiten

## Bug 4: KI-Filter lässt irrelevante Treffer durch
- Suche nach "Seat Toledo" (Kategorie Auto) zeigt Werbe-Prospekte ("Seat Toledo Prospekte, 2 Stück, 1999")
- KI erkennt es als Prospekt, filtert es aber NICHT raus
- **Fix:** KI-Filter muss Treffer die KEINE echten Inserate sind (Prospekte, Zubehör, Bücher, Modellbau) komplett entfernen

## Bug 5: KI-Bewertung zu schwach — STÄRKERES MODELL
- AutoScout zeigt "seat toledo" aber Link führt zu neuem Seat Ibiza 2026
- KI bewertet "fair" ohne zu merken dass es das FALSCHE AUTO ist
- KI sagt sogar "keine Angaben zu Marke, Modell" — erkennt Problem aber filtert nicht
- **WICHTIG:** 
  - Stärkeres Modell für KI-Bewertung verwenden (GPT-4.1 mini oder besser, NICHT Haiku)
  - KI muss Titel, Preis, Beschreibung UND Kategorie-Kriterien abgleichen
  - Wenn Inserat nicht zur Suche passt → rausfiltern (nicht nur schlecht bewerten)
  - Baujahr-Filter: Wenn Suche "max 2004" und Inserat ist 2026 → SOFORT raus

## Generelle Anforderung: Suchresultate müssen PERFEKT sein
- Nur echte, relevante Inserate anzeigen
- Bilder müssen sichtbar sein (kein Platzhalter wenn imageUrl vorhanden)
- Falsche Treffer = kein Kunde bezahlt dafür
- Codee muss nach dem Fix SELBST testen ob die Resultate stimmen
- Reviewer muss ebenfalls testen und verifizieren

## Test-Kriterien für Codee VOR dem Commit:
1. Neue Suche erstellen: "Seat Toledo", max Preis 5000, max Baujahr 2004
2. Scraper laufen lassen
3. Prüfen: Keine Prospekte, keine falschen Autos, keine Treffer >2004
4. Mobile View testen (Chrome DevTools)
5. Checkos kaufen → Stripe Checkout muss öffnen
6. Glücksrad → Gewinn muss mit Animation übereinstimmen

## Test-Kriterien für Reviewer:
1. Code-Review wie gewohnt
2. ZUSÄTZLICH: Selbst die Suchresultate prüfen (curl/API)
3. Mobile CSS validieren
4. Stripe-Integration prüfen
