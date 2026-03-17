# BUGFIX RUNDE 2: Kritische Bugs + Features

## WICHTIG: Mobile muss PERFEKT sein! Alles muss auf 375px Breite ohne horizontales Scrollen funktionieren!

---

## Bug 1: Mobile Overflow (IMMER NOCH NICHT GEFIXT!)
- Suchkarten: Buttons "Aktiv"/"Löschen" abgeschnitten
- Suchformular: Labels links abgeschnitten ("elche Länder", "ualitätsstufe")
- Benachrichtigungen: "Einstellungen" + Filter-Tabs abgeschnitten
- Checkos-Seite: Rabatt-Staffel rechts abgeschnitten
- FIX: JEDE Seite auf 375px testen! overflow-x: hidden auf body, alle Container max-w-full, flex-wrap, text-truncate wo nötig

## Bug 6: KI liest Inserat-Beschreibung NICHT
- KI sagt "ohne Angabe von Baujahr, Kilometerstand" obwohl auf Ricardo ALLES in der Beschreibung steht
- Scraper liefert nur Titel + Preis, NICHT die Beschreibung
- FIX OPTION A: Scraper muss Beschreibung/Details mitscrapen
- FIX OPTION B: KI muss den Inserat-Link öffnen und Beschreibung lesen (teurer aber besser)
- KI-Bewertung "4/10 Durchschnittlich" oben aber "teuer" unten = WIDERSPRUCH
- Wenn aktuelles Modell zu schwach: GPT-4.5 oder GPT-5.2 verwenden

## Bug 7: AutoScout Werbe-/Premium-Anzeigen nicht gefiltert
- Treffer zeigen CHF 28900/20900/31990 obwohl maxPrice 5000 ist
- Das sind AutoScout "Spotlight"/Premium-Händleranzeigen
- FIX: Preisfilter MUSS serverseitig greifen. Alles über maxPrice → RAUSFILTERN vor dem Speichern
- Auch Baujahr-Filter prüfen: max 2004 aber neue Autos kommen durch

## Bug 8: KI-Bewertungen verschwinden nach Navigation
- Beim ersten Laden sind Bewertungen sichtbar
- Nach Dashboard → zurück: Bewertungen weg
- FIX: Bewertungen müssen in DB gespeichert werden (nicht nur im Client-State)

## Bug 9: Starten-Button Preis nicht aktualisiert
- Pro = 7 Checkos ausgewählt, Button zeigt "Starten (2 🎉)" statt 7
- FIX: Button-Text muss dynamisch auf gewählte Qualitätsstufe reagieren

## Feature 1: Timestamps überall
- Suchresultate + Benachrichtigungen müssen zeigen:
  - "Gefunden am: 17.03.2026, 12:20" (wann Checko es entdeckt hat)
  - "Online seit: 17.03.2026, 12:18" (wann Inserat eingestellt wurde, falls vom Scraper geliefert)
- Zeigt Speed-Vorteil von Checko

## Feature 2: Bilder in Benachrichtigungen
- Aktuell: nur Text + Preis
- NEU: Thumbnail-Bild links in jeder Benachrichtigung (imageUrl ist in DB vorhanden)

---

## Testpflicht Codee:
1. JEDE Seite auf 375px Mobile testen (Chrome DevTools)
2. Suche erstellen: Seat Toledo, max 5000 CHF, max 2004
3. Prüfen: KEINE Treffer über 5000 CHF, KEINE Autos nach 2004
4. KI-Bewertung muss Beschreibung lesen und konsistent sein
5. Qualitätsstufe wechseln → Button-Preis muss sich ändern
6. Navigation hin/her → Bewertungen müssen bleiben

## Testpflicht Reviewer:
1. Mobile CSS auf 375px validieren
2. Preisfilter-Logik prüfen
3. KI-Prompt prüfen (Beschreibung muss mitgegeben werden)
4. Bewertung-Persistenz prüfen
