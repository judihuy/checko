// Stripe Checkout — Create checkout session for module subscription
// Applies volume discount based on total active subscriptions

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripe, calculateDiscountedPrice } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const { moduleId } = await request.json();

    if (!moduleId) {
      return NextResponse.json({ error: "moduleId erforderlich" }, { status: 400 });
    }

    // Get the module
    const module = await prisma.module.findUnique({ where: { id: moduleId } });
    if (!module || !module.isActive) {
      return NextResponse.json({ error: "Modul nicht gefunden oder nicht aktiv" }, { status: 404 });
    }

    // Check if user already has this subscription
    const existingSub = await prisma.subscription.findUnique({
      where: {
        userId_moduleId: {
          userId: session.user.id,
          moduleId: moduleId,
        },
      },
    });
    if (existingSub && existingSub.status === "active") {
      return NextResponse.json({ error: "Du hast dieses Modul bereits abonniert" }, { status: 409 });
    }

    // Count current active subscriptions for volume discount
    const activeSubCount = await prisma.subscription.count({
      where: { userId: session.user.id, status: "active" },
    });

    // Calculate discounted price (count includes the new module)
    const newTotalModules = activeSubCount + 1;
    const discountedPrice = calculateDiscountedPrice(module.priceMonthly, newTotalModules);

    // Create Stripe checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: session.user.email || undefined,
      metadata: {
        userId: session.user.id,
        moduleId: module.id,
        moduleSlug: module.slug,
      },
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: module.name,
              description: module.description.substring(0, 200),
            },
            unit_amount: discountedPrice,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/dashboard?checkout=success`,
      cancel_url: `${appUrl}/dashboard?checkout=canceled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json({ error: "Fehler beim Erstellen der Checkout-Session" }, { status: 500 });
  }
}
