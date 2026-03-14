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
