// POST /api/referral/apply — Referral-Code anwenden (bei Registrierung)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processReferral } from "@/lib/referral";
import { z } from "zod";
import { checkRateLimit, RATE_LIMIT_SENSITIVE } from "@/lib/rate-limit";

const applySchema = z.object({
  referralCode: z.string().min(1, "Referral-Code fehlt.").max(20),
});

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "referral-apply", RATE_LIMIT_SENSITIVE.max, RATE_LIMIT_SENSITIVE.windowMs);
  if (rl) return rl;

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });
    }

    const body = await request.json();
    const validation = applySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0].message },
        { status: 400 }
      );
    }

    const { referralCode } = validation.data;

    const result = await processReferral(session.user.id, referralCode.toUpperCase());

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      message: "Empfehlungscode angewendet! Du und dein Freund haben je 10 Checkos erhalten.",
    });
  } catch (error) {
    console.error("Referral apply error:", error);
    return NextResponse.json(
      { error: "Fehler beim Anwenden des Empfehlungscodes." },
      { status: 500 }
    );
  }
}
