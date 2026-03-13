// Stripe Webhook Handler
// Handles: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

// Helper to extract period end from subscription items
function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items?.data?.[0];
  if (item && "current_period_end" in item && typeof item.current_period_end === "number") {
    return new Date(item.current_period_end * 1000);
  }
  return null;
}

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

    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      webhookSecret
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const moduleId = session.metadata?.moduleId;
        const subscriptionId = session.subscription as string;

        if (!userId || !moduleId) {
          console.error("Missing metadata in checkout session");
          break;
        }

        // Create or update subscription record
        await prisma.subscription.upsert({
          where: {
            userId_moduleId: { userId, moduleId },
          },
          update: {
            stripeSubId: subscriptionId,
            status: "active",
          },
          create: {
            userId,
            moduleId,
            stripeSubId: subscriptionId,
            status: "active",
          },
        });

        console.log(`Subscription created: user=${userId}, module=${moduleId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;

        const existingSub = await prisma.subscription.findUnique({
          where: { stripeSubId },
        });

        if (existingSub) {
          const periodEnd = getSubscriptionPeriodEnd(subscription);
          await prisma.subscription.update({
            where: { stripeSubId },
            data: {
              status: subscription.status === "active" ? "active" : subscription.status,
              ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
            },
          });
          console.log(`Subscription updated: ${stripeSubId} → ${subscription.status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubId = subscription.id;

        const existingSub = await prisma.subscription.findUnique({
          where: { stripeSubId },
        });

        if (existingSub) {
          await prisma.subscription.update({
            where: { stripeSubId },
            data: { status: "canceled" },
          });
          console.log(`Subscription canceled: ${stripeSubId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
