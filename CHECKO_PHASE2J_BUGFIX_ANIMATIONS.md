# Phase 2j — Bugfixes + Gecko-Animationen + UX

## KRITISCHE REGELN
- **Dockerfile NIEMALS ändern!** (enthält OpenSSL, nodemailer, undici, Chromium, Puppeteer, Stripe, NEXT_PUBLIC_APP_URL ARG)
- **Prisma: IMMER `findFirst` statt `findUnique`** (Engine Panic Bug mit cuid IDs)
- **Redirects: NIEMALS `new URL(..., request.url)`, IMMER `getBaseUrl()` / `NEXTAUTH_URL`**
- **KI-Modellnamen NIEMALS dem User zeigen** — nur Standard/Premium/Pro
- **Firmenname: "Huy Digital" (MIT Leerzeichen)**
- **Alle Gecko-Dateien liegen bereits in `/opt/checko/public/`** — NICHT herunterladen oder verschieben

## Verfügbare Gecko-Assets (alle in `public/`)
### Videos (21 Stück)
- `gecko-01.mp4` bis `gecko-21.mp4`

### Bilder
- `gecko-logo.png` — Haupt-Logo (Midjourney, weisser Hintergrund)
- `gecko-logo.svg` — Logo als SVG (transparent)
- `gecko-pose-1.png` — Alternative Pose (transparent)
- `gecko-pose-2.png` — Alternative Pose 2 (transparent)
- `gecko-pose-2.svg` — Pose 2 als SVG

## BUGS (MÜSSEN alle gefixt werden)

### Bug 1: Glücksrad-Sync KAPUTT (KRITISCH!)
**Problem:** Das Rad zeigt Segment "5 Checkos" an, aber der Server gibt 4 Checkos.
**Ursache:** Frontend und Backend verwenden unterschiedliche Logik für die Segment-Zuordnung.
**Lösung:** 
- Server bestimmt Gewinn-Betrag UND das Ziel-Segment
- API-Response muss `{ amount: number, targetSegment: number }` zurückgeben
- Frontend spinnt das Rad zum EXAKT vom Server bestimmten Segment
- KEIN separater RNG im Frontend!
- Segmente im Frontend und Backend müssen IDENTISCH definiert sein
- Test: 10x drehen → Angezeigter Betrag muss IMMER mit gutgeschriebenem Betrag übereinstimmen

### Bug 2: Keine "Checkos reichen nicht" Warnung
**Problem:** Wenn User eine Suche startet mit 0 Checkos-Guthaben, passiert nichts / keine Fehlermeldung.
**Lösung:**
- Vor Suche-Start: Checkos-Guthaben prüfen
- Wenn nicht genug: Modal/Toast "Du hast nicht genug Checkos. Aktuelles Guthaben: X Checkos. Benötigt: Y Checkos."
- Button "Checkos aufladen" → Link zu `/dashboard/checkos`

### Bug 3: KI-Modellnamen sichtbar
**Problem:** User sieht "Haiku", "Sonnet", "Opus" in der UI.
**Lösung:** Überall ersetzen:
- `Haiku` / `claude-haiku` → **"Standard"**
- `Sonnet` / `claude-sonnet` → **"Premium"**  
- `Opus` / `claude-opus` → **"Pro"**
- Suche in ALLEN Dateien: `grep -r "Haiku\|Sonnet\|Opus\|haiku\|sonnet\|opus" src/`
- Nur interne API-Calls dürfen die echten Modellnamen verwenden
- Alles was der User sieht: Standard / Premium / Pro

### Bug 4: Benachrichtigungen-Seite ohne Navbar
**Problem:** `/dashboard/notifications` hat keine Navbar → User kann nicht zurück navigieren.
**Lösung:** Navbar/Sidebar in die Notifications-Page einbauen (wie alle anderen Dashboard-Seiten).

### Bug 5: Tutti.ch zeigt ⚠️
**Problem:** Tutti.ch wird als "nicht funktionierend" angezeigt trotz angeblichem Fix.
**Lösung:**
- Prüfen ob `isWorking: true` in der Platform-Config gesetzt ist
- Testen ob der Parser tatsächlich Resultate liefert
- Wenn Parser funktioniert → `isWorking: true` setzen
- Wenn Parser NICHT funktioniert → neuen Parser schreiben basierend auf aktuellem Tutti.ch HTML

## UX-VERBESSERUNGEN

### Feature 1: Logo grösser
- Navbar-Logo grösser machen (aktuell zu klein, soll auffällig sein)
- Startseite Hero: Logo prominent und gross
- Professionell aber auffällig

### Feature 2: Gecko-Animationen einbauen
Animierte Gecko-Videos an strategischen Stellen einbauen:

**A) Startseite / Hero-Bereich:**
- Grosser animierter Gecko als Willkommens-Animation
- Video autoplay, muted, loop
- `<video autoPlay muted loop playsInline className="...">`
- Empfehlung: `gecko-01.mp4` oder `gecko-02.mp4` (wähle den besten)

**B) Modul-Seiten (`/module/[slug]`):**
- Jede "Coming Soon" Modulseite bekommt einen kleinen animierten Gecko
- Verschiedene Videos für verschiedene Module (rotierend)
- Dezent animiert, nicht ablenkend

**C) Glücksrad-Gewinn:**
- Nach Gewinn: Feier-Animation mit tanzendem Gecko
- Eines der Videos als Overlay/Modal nach dem Spin
- Empfehlung: `gecko-05.mp4` oder ähnlich energetisches Video

**D) Willkommen-Seite (`/willkommen`):**
- Animierter Gecko begrüsst neue User
- Passend zum "Willkommen bei Checko!" Text

**E) 404-Seite:**
- Gecko-Animation als lustiges Element auf der Fehlerseite
- "Oops! Diese Seite wurde nicht gefunden."

**F) Lade-Animation:**
- Beim Laden von Suchergebnissen: kleiner animierter Gecko statt Spinner
- Macht das Warten angenehmer

**Wichtig bei Videos:**
- Immer `autoPlay muted loop playsInline` 
- Responsive Grössen (nicht zu gross auf Mobile)
- `preload="metadata"` für Performance
- Videos NICHT in den Docker-Build kopieren — sie liegen bereits in `public/`

## Reihenfolge
1. Erst ALLE Bugs fixen (1-5)
2. Dann UX-Verbesserungen
3. Dann Gecko-Animationen
4. Am Ende: EINEN Commit mit allem

## Test-Checkliste vor Push
- [ ] Glücksrad: 5x drehen, angezeigter Betrag = gutgeschriebener Betrag
- [ ] Suche mit 0 Checkos → Warnung erscheint
- [ ] Nirgends "Haiku/Sonnet/Opus" sichtbar für User
- [ ] Benachrichtigungen-Seite hat Navbar
- [ ] Tutti.ch kein ⚠️ mehr (oder isWorking korrekt gesetzt)
- [ ] Logo ist grösser und auffällig
- [ ] Mindestens 3 Gecko-Animationen eingebaut
- [ ] Mobile responsive getestet
- [ ] Build erfolgreich (`npm run build`)
