// Stripe Webhook Handler — Checkos gutschreiben bei erfolgreicher Zahlung
// Handles: checkout.session.completed (Einmalzahlung)
// metadata: { userId, checkos }
// WICHTIG: Raw body parsing! request.text() NICHT request.json()

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";
import { processAffiliateEarnings } from "@/lib/referral";
import Stripe from "stripe";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // Moderates Rate-Limiting als DDoS-Schutz (Stripe sendet nicht so viele)
  const rl = checkRateLimit(request, "stripe-webhook", 60, 60 * 1000);
  if (rl) return rl;
  // Raw body für Signatur-Verifizierung
  const body = await request.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 }
      );
    }

    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const checkosStr = session.metadata?.checkos;
        const paymentIntentId = session.payment_intent as string | null;

        if (!userId || !checkosStr) {
          console.error("Missing metadata in checkout session:", {
            userId,
            checkos: checkosStr,
          });
          break;
        }

        const checkosAmount = parseInt(checkosStr, 10);
        if (isNaN(checkosAmount) || checkosAmount <= 0) {
          console.error("Invalid checkos amount in metadata:", checkosStr);
          break;
        }

        // Alles in einer Transaction
        const result = await prisma.$transaction(async (tx) => {
          // CheckoPurchase erstellen
          await tx.checkoPurchase.create({
            data: {
              userId,
              amount: checkosAmount,
              priceCHF: session.amount_total || 0,
              stripePaymentId: paymentIntentId || `session_${session.id}`,
              status: "completed",
            },
          });

          // CheckoTransaction erstellen (Gutschrift)
          const totalCHF = session.amount_total
            ? (session.amount_total / 100).toFixed(2)
            : "?";
          await tx.checkoTransaction.create({
            data: {
              userId,
              amount: checkosAmount,
              type: "purchase",
              description: `${checkosAmount} Checkos gekauft (CHF ${totalCHF})`,
            },
          });

          // Balance erhöhen
          const updatedUser = await tx.user.update({
            where: { id: userId },
            data: { checkosBalance: { increment: checkosAmount } },
            select: { checkosBalance: true },
          });

          return updatedUser.checkosBalance;
        });

        // Notification erstellen (ausserhalb der Transaction)
        await createNotification(
          userId,
          "purchase",
          "✅ Checkos gekauft!",
          `${checkosAmount} Checkos wurden deinem Konto gutgeschrieben. Neuer Stand: ${result} Checkos.`,
          "/dashboard/checkos"
        );

        console.log(
          `Checkos purchased: user=${userId}, amount=${checkosAmount}, newBalance=${result}`
        );

        // Affiliate-Provision verarbeiten (10% an Werber)
        try {
          const affiliateResult = await processAffiliateEarnings(userId, checkosAmount);
          if (affiliateResult.affiliateAmount) {
            console.log(
              `Affiliate commission: ${affiliateResult.affiliateAmount} Checkos for referrer of user=${userId}`
            );
          }
        } catch (affiliateError) {
          // Affiliate-Fehler soll den Kauf nicht blockieren
          console.error("Affiliate processing error:", affiliateError);
        }

        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
