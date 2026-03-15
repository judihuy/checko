// Stripe Checkout — Einmalzahlung für Checko-Pakete (KEIN Abo!)
// Body: { checkos: number, priceId?: string }
// - priceId vorhanden: Festes Paket (20/50/100/250)
// - priceId fehlt: Dynamischer Preis via price_data (Slider-Kauf)
// Minimum: 10 Checkos

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getStripe,
  getFixedPackageByPriceId,
  calculatePrice,
  STRIPE_PRODUCT_ID,
} from "@/lib/stripe";
import { getBaseUrl } from "@/lib/utils";
import { checkRateLimit, RATE_LIMIT_STRIPE } from "@/lib/rate-limit";

const MIN_CHECKOS = 10;
const MAX_CHECKOS = 500;

export async function POST(request: Request) {
  // Rate-Limiting: 10 pro 15 Minuten
  const rl = checkRateLimit(request, "stripe-checkout", RATE_LIMIT_STRIPE.max, RATE_LIMIT_STRIPE.windowMs);
  if (rl) return rl;

  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const body = await request.json();
    const { checkos, priceId } = body as { checkos?: number; priceId?: string };

    // Validierung: checkos muss vorhanden und gültig sein
    if (!checkos || typeof checkos !== "number" || !Number.isInteger(checkos)) {
      return NextResponse.json(
        { error: "Ungültige Checko-Menge" },
        { status: 400 }
      );
    }

    if (checkos < MIN_CHECKOS || checkos > MAX_CHECKOS) {
      return NextResponse.json(
        { error: `Checko-Menge muss zwischen ${MIN_CHECKOS} und ${MAX_CHECKOS} liegen` },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl();
    const stripe = getStripe();

    // Gemeinsame Session-Optionen
    const metadata = {
      userId: session.user.id,
      checkos: checkos.toString(),
    };

    let checkoutSession;

    if (priceId) {
      // ==================== FESTES PAKET ====================
      const pkg = getFixedPackageByPriceId(priceId);
      if (!pkg || pkg.checkos !== checkos) {
        return NextResponse.json(
          { error: "Ungültiges Paket" },
          { status: 400 }
        );
      }

      checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: session.user.email || undefined,
        metadata,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: `${baseUrl}/dashboard/checkos?success=true`,
        cancel_url: `${baseUrl}/dashboard/checkos?canceled=true`,
      });
    } else {
      // ==================== DYNAMISCHER PREIS (Slider) ====================
      const pricing = calculatePrice(checkos);

      checkoutSession = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: session.user.email || undefined,
        metadata,
        line_items: [
          {
            price_data: {
              currency: "chf",
              product: STRIPE_PRODUCT_ID,
              unit_amount: pricing.unitAmountRappen,
            },
            quantity: checkos,
          },
        ],
        success_url: `${baseUrl}/dashboard/checkos?success=true`,
        cancel_url: `${baseUrl}/dashboard/checkos?canceled=true`,
      });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Fehler beim Erstellen der Checkout-Session" },
      { status: 500 }
    );
  }
}
