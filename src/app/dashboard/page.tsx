// User Dashboard — Shows subscribed modules and subscription status
// Force dynamic rendering (needs session + DB)
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let subscriptions: {
    id: string;
    status: string;
    currentPeriodEnd: Date | null;
    module: {
      slug: string;
      name: string;
      description: string;
      icon: string | null;
    };
  }[] = [];

  try {
    subscriptions = await prisma.subscription.findMany({
      where: {
        userId: session.user.id,
        status: "active",
      },
      include: {
        module: {
          select: {
            slug: true,
            name: true,
            description: true,
            icon: true,
          },
        },
      },
    });
  } catch {
    // DB not connected — show empty state
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              Hallo, {session.user.name || "Benutzer"} 👋
            </h1>
            <p className="text-gray-600 mt-1">Willkommen in deinem Checko Dashboard.</p>
          </div>

          {/* Subscribed Modules */}
          {subscriptions.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Deine aktiven Module
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {subscriptions.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`/dashboard/${sub.module.slug}`}
                    className="group block"
                  >
                    <div className="bg-white rounded-xl border border-gray-200 p-6 h-full transition-all hover:shadow-lg hover:border-emerald-300">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-3xl">{sub.module.icon || "🔧"}</span>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          Aktiv
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-emerald-700 transition mb-2">
                        {sub.module.name}
                      </h3>
                      <p className="text-gray-600 text-sm line-clamp-2">
                        {sub.module.description}
                      </p>
                      {sub.currentPeriodEnd && (
                        <p className="text-gray-400 text-xs mt-3">
                          Nächste Abrechnung:{" "}
                          {new Date(sub.currentPeriodEnd).toLocaleDateString("de-CH")}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl block mb-4">🦎</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                Noch keine Module gebucht
              </h2>
              <p className="text-gray-600 mb-6">
                Entdecke unsere Module und starte mit deinem ersten Tool.
              </p>
              <Link
                href="/#module"
                className="inline-block bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition"
              >
                Module entdecken
              </Link>
            </div>
          )}

          {/* Discover more modules button */}
          {subscriptions.length > 0 && (
            <div className="mt-8 text-center">
              <Link
                href="/#module"
                className="inline-block bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition"
              >
                Neues Modul entdecken
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
