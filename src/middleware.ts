// Middleware: Protect admin and dashboard routes
// Only users with role="admin" can access /admin/*
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

    // Not admin → redirect to dashboard
    if (token.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", baseUrl));
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
