// Utility functions — Checko
// WICHTIG: NIEMALS `new URL(..., request.url)` für Redirects verwenden!
// Docker/Proxy setzt request.url auf interne URLs (z.B. http://localhost:3000)
// Immer getBaseUrl() verwenden für absolute URLs.

export function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

/**
 * Repariert Altdaten-Queries bei denen Leerzeichen fehlen.
 *
 * Beispiel: `seattoledo` → `Seat Toledo` (wenn vehicleMake="Seat", vehicleModel="Toledo")
 *
 * Vergleicht den gespeicherten Query (ohne Leerzeichen/Bindestriche, lowercase) mit
 * dem erwarteten Wert aus vehicleMake + vehicleModel. Wenn sie übereinstimmen und
 * der gespeicherte Query kein Leerzeichen enthält, wird die saubere Version zurückgegeben.
 */
export function repairSearchQuery(
  query: string,
  vehicleMake?: string | null,
  vehicleModel?: string | null,
): string {
  if (!vehicleMake || !vehicleModel) return query;

  const expected = vehicleMake + " " + vehicleModel;
  const normStored = query.toLowerCase().replace(/[\s-]+/g, "");
  const normExpected = expected.toLowerCase().replace(/[\s-]+/g, "");

  if (normStored === normExpected && !query.includes(" ")) {
    return expected;
  }

  return query;
}
