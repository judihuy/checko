// Stripe Checkout — Einmalzahlung für Checko-Pakete (KEIN Abo!)

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { getPackageById } from "@/lib/checkos";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { packageId } = await request.json();

    if (!packageId || typeof packageId !== "string") {
      return NextResponse.json({ error: "packageId erforderlich" }, { status: 400 });
    }

    // Paket validieren
    const pkg = getPackageById(packageId);
    if (!pkg) {
      return NextResponse.json({ error: "Ungültiges Paket" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Einmalzahlung — KEIN Abo!
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: session.user.email || undefined,
      metadata: {
        userId: session.user.id,
        packageId: pkg.id,
        checkosAmount: pkg.amount.toString(),
      },
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: `${pkg.amount} Checkos`,
              description: `${pkg.amount} Checkos für dein Checko-Konto`,
            },
            unit_amount: pkg.priceCHF,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard/checkos?checkout=canceled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Checkout-Session" },
      { status: 500 }
    );
  }
}
