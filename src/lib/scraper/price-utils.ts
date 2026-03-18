/**
 * Zentrales Schweizer Preis-Parsing
 *
 * Unterstützte Formate (Beispiel für 94900):
 *   94'900        → 94900
 *   94'900.00     → 94900
 *   94'900.–      → 94900
 *   94'900.-      → 94900
 *   94.900        → 94900  (Tausenderpunkt)
 *   94,900        → 94900  (Tausenderkomma)
 *   94 900        → 94900  (Leerzeichen als Tausender)
 *   CHF 94'900.–  → 94900
 *   Fr. 1'200.50  → 1200.50
 *
 * Rückgabe: Preis als CHF-Zahl (z.B. 94900, 1200.50)
 * Gibt 0 zurück wenn nicht parsbar.
 */
export function parseSwissPrice(raw: string | number | null | undefined): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return isNaN(raw) ? 0 : raw;

  let s = String(raw).trim();
  if (!s) return 0;

  // 1) Währungsangaben und Whitespace-Prefix entfernen
  s = s.replace(/^(?:CHF|Fr\.?|SFr\.?|€|EUR)\s*/i, "").trim();

  // 2) Dash-Suffixe entfernen:  .–  .-  ,–  ,-  –  -  (am Ende)
  s = s.replace(/[.,]?[–\-]\s*$/, "");

  // 3) Trailing-Punkt entfernen (z.B. "1'200." → "1'200")
  s = s.replace(/\.\s*$/, "");

  // 4) Alle Nicht-Zahl-Zeichen außer  . , ' ' ʼ ʻ `  entfernen
  //    (bewahrt die Trennzeichen für die Logik unten)
  s = s.replace(/[^0-9.,'ʼʻ`'\u2019\u2018\u0027 ]/g, "");

  if (!s) return 0;

  // 5) Alle Apostroph-Varianten normalisieren → '
  s = s.replace(/[ʼʻ`'\u2019\u2018\u0027]/g, "'");

  // 6) Apostrophe sind IMMER Tausender-Trennzeichen in CH → entfernen
  s = s.replace(/'/g, "");

  // 7) Leerzeichen als Tausender-Trennzeichen → entfernen
  s = s.replace(/\s/g, "");

  // 8) Punkt und Komma disambiguieren
  //    Strategie: Schaue wo Punkt und Komma stehen
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots === 1 && commas === 0) {
    // z.B. "94.900" oder "1200.50"
    // Prüfe ob es ein Tausenderpunkt ist: genau 3 Ziffern nach dem Punkt?
    const afterDot = s.split(".")[1];
    if (afterDot.length === 3 && !afterDot.includes(",")) {
      // Tausenderpunkt (94.900 → 94900)
      s = s.replace(".", "");
    }
    // Sonst: Dezimalpunkt (1200.50 bleibt 1200.50)
  } else if (commas === 1 && dots === 0) {
    // z.B. "94,900" oder "1200,50"
    const afterComma = s.split(",")[1];
    if (afterComma.length === 3) {
      // Tausenderkomma (94,900 → 94900)
      s = s.replace(",", "");
    } else {
      // Dezimalkomma (1200,50 → 1200.50)
      s = s.replace(",", ".");
    }
  } else if (dots > 1) {
    // Mehrere Punkte = Tausender-Trennzeichen (z.B. "1.234.567")
    s = s.replace(/\./g, "");
  } else if (commas > 1) {
    // Mehrere Kommas = Tausender-Trennzeichen
    s = s.replace(/,/g, "");
  } else if (dots === 1 && commas === 1) {
    // z.B. "1.234,56" oder "1,234.56"
    const dotIdx = s.indexOf(".");
    const commaIdx = s.indexOf(",");
    if (dotIdx < commaIdx) {
      // Punkt ist Tausender, Komma ist Dezimal: "1.234,56"
      s = s.replace(".", "").replace(",", ".");
    } else {
      // Komma ist Tausender, Punkt ist Dezimal: "1,234.56"
      s = s.replace(",", "");
    }
  }

  const result = parseFloat(s);
  return isNaN(result) || result < 0 ? 0 : result;
}

/**
 * Parsed Schweizer Preis und gibt Wert in Rappen (Cent) zurück.
 * Convenience-Wrapper um parseSwissPrice.
 */
export function parseSwissPriceRappen(raw: string | number | null | undefined): number {
  const chf = parseSwissPrice(raw);
  return Math.round(chf * 100);
}
