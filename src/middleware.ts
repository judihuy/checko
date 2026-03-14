// Middleware: Protect admin and dashboard routes
// Rollen: admin = Vollzugriff, moderator = /admin/users/* erlaubt, user = kein Admin-Zugang
// WICHTIG: NIEMALS `new URL(..., request.url)` für Redirects!
// In Docker/Proxy Umgebungen enthält request.url interne URLs.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

/**
 * Prüft ob die Rolle admin oder moderator ist
 */
function isAdminOrModerator(role: string | undefined): boolean {
  return role === "admin" || role === "moderator";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const baseUrl = getBaseUrl();

  // Protect admin routes
  if (pathname.startsWith("/admin")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Not logged in → redirect to login
    if (!token) {
      const loginUrl = new URL("/login", baseUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // /admin/users/* = admin ODER moderator
    if (pathname.startsWith("/admin/users")) {
      if (!isAdminOrModerator(token.role as string)) {
        return NextResponse.redirect(new URL("/dashboard", baseUrl));
      }
    } else {
      // Alle anderen /admin/* = nur admin
      if (token.role !== "admin") {
        return NextResponse.redirect(new URL("/dashboard", baseUrl));
      }
    }
  }

  // Protect dashboard routes
  if (pathname.startsWith("/dashboard")) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const loginUrl = new URL("/login", baseUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
