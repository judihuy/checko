// Stripe Webhook Handler — Checkos gutschreiben bei erfolgreicher Zahlung
// Handles: checkout.session.completed (Einmalzahlung)

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { purchaseCheckos } from "@/lib/checkos";
import Stripe from "stripe";

export async function POST(request: Request) {
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
        const packageId = session.metadata?.packageId;
        const paymentIntentId = session.payment_intent as string | null;

        if (!userId || !packageId) {
          console.error("Missing metadata in checkout session:", {
            userId,
            packageId,
          });
          break;
        }

        // Checkos gutschreiben
        const result = await purchaseCheckos(
          userId,
          packageId,
          paymentIntentId || undefined
        );

        if (result.success) {
          console.log(
            `Checkos purchased: user=${userId}, package=${packageId}, newBalance=${result.newBalance}`
          );
        } else {
          console.error(
            `Failed to credit checkos: user=${userId}, package=${packageId}, error=${result.error}`
          );
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
