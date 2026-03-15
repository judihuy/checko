// Admin API: Preisradar Scan-Intervall-Einstellungen
// GET — aktuelle Intervalle lesen
// PUT — Intervalle aktualisieren (nur Admin)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";
import { logAdminAction } from "@/lib/audit";
import { checkRateLimit, RATE_LIMIT_DEFAULT } from "@/lib/rate-limit";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "admin") return null;
  return session;
}

// GET: Aktuelle Intervall-Settings lesen
export async function GET(request: Request) {
  const rl = checkRateLimit(request, "admin-settings-intervals", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const [standardStr, premiumStr, proStr] = await Promise.all([
      getSetting("preisradar_standard_interval", "30"),
      getSetting("preisradar_premium_interval", "15"),
      getSetting("preisradar_pro_interval", "5"),
    ]);

    return NextResponse.json({
      settings: {
        standardInterval: parseInt(standardStr, 10) || 30,
        premiumInterval: parseInt(premiumStr, 10) || 15,
        proInterval: parseInt(proStr, 10) || 5,
      },
    });
  } catch (error) {
    console.error("Error fetching interval settings:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}

// PUT: Intervalle aktualisieren
const intervalSchema = z.object({
  standardInterval: z.number().int().min(5).max(120),
  premiumInterval: z.number().int().min(5).max(120),
  proInterval: z.number().int().min(1).max(120),
});

export async function PUT(request: Request) {
  const rl = checkRateLimit(request, "admin-settings-intervals", RATE_LIMIT_DEFAULT.max, RATE_LIMIT_DEFAULT.windowMs);
  if (rl) return rl;

  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = intervalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ungültige Eingabe", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { standardInterval, premiumInterval, proInterval } = parsed.data;

    await Promise.all([
      setSetting("preisradar_standard_interval", String(standardInterval)),
      setSetting("preisradar_premium_interval", String(premiumInterval)),
      setSetting("preisradar_pro_interval", String(proInterval)),
    ]);

    await logAdminAction(
      session.user.id,
      "interval_settings_updated",
      "system_settings",
      JSON.stringify({ standardInterval, premiumInterval, proInterval })
    );

    return NextResponse.json({
      success: true,
      settings: { standardInterval, premiumInterval, proInterval },
    });
  } catch (error) {
    console.error("Error updating interval settings:", error);
    return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
  }
}
