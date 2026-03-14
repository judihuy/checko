import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ProductJsonLd } from "@/components/JsonLd";

// Dynamic metadata per module
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const mod = await prisma.module.findUnique({ where: { slug: params.slug } }).catch(() => null);
  if (!mod) {
    return { title: "Modul nicht gefunden — Checko" };
  }

  const title = `${mod.name} — ${mod.description.substring(0, 60)} | checko.ch`;
  const description = mod.description;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://checko.ch/module/${mod.slug}`,
      siteName: "Checko",
      type: "website",
      locale: "de_CH",
    },
  };
}

export default async function ModuleDetailPage({ params }: { params: { slug: string } }) {
  const mod = await prisma.module.findUnique({ where: { slug: params.slug } }).catch(() => null);
  if (!mod) notFound();

  const isActive = mod.status === "active";
  const statusLabels: Record<string, string> = {
    active: "Verfügbar",
    coming_soon: "Demnächst verfügbar",
    beta: "Beta",
    maintenance: "Wartung",
  };
  const statusColors: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    coming_soon: "bg-blue-100 text-blue-800",
    beta: "bg-amber-100 text-amber-800",
    maintenance: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ProductJsonLd
        name={mod.name}
        description={mod.description}
        url={`https://checko.ch/module/${mod.slug}`}
      />
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link href="/" className="text-emerald-600 hover:underline mb-8 inline-block">← Zurück zur Übersicht</Link>

        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <div className="flex items-center gap-4 mb-6">
            <span className="text-5xl">{mod.icon || "📦"}</span>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{mod.name}</h1>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mt-2 ${statusColors[mod.status] || "bg-gray-100 text-gray-600"}`}>
                {statusLabels[mod.status] || mod.status}
              </span>
            </div>
          </div>

          <p className="text-gray-600 text-lg leading-relaxed mb-8">{mod.description}</p>

          <div className="bg-gray-50 rounded-xl p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Checkos pro Nutzung</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-white rounded-lg border">
                <div className="text-2xl font-bold text-gray-900">2</div>
                <div className="text-sm text-gray-500">Standard</div>
              </div>
              <div className="text-center p-4 bg-white rounded-lg border border-emerald-200">
                <div className="text-2xl font-bold text-emerald-600">4</div>
                <div className="text-sm text-gray-500">Premium</div>
              </div>
              <div className="text-center p-4 bg-white rounded-lg border border-purple-200">
                <div className="text-2xl font-bold text-purple-600">7</div>
                <div className="text-sm text-gray-500">Pro</div>
              </div>
            </div>
          </div>

          {isActive ? (
            <Link href={`/dashboard/${mod.slug}`} className="block w-full text-center bg-emerald-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-emerald-700 transition">
              Jetzt nutzen →
            </Link>
          ) : (
            <WaitlistForm moduleId={mod.id} moduleName={mod.name} />
          )}
        </div>
      </div>
    </div>
  );
}

function WaitlistForm({ moduleId, moduleName }: { moduleId: string; moduleName: string }) {
  return (
    <div className="bg-blue-50 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-2">Interesse an {moduleName}?</h3>
      <p className="text-gray-600 text-sm mb-4">Wir benachrichtigen dich, sobald dieses Modul verfügbar ist.</p>
      <form action={`/api/modules/${moduleId}/waitlist`} method="POST" className="flex gap-2">
        <input type="email" name="email" required placeholder="Deine E-Mail-Adresse" className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
        <button type="submit" className="bg-emerald-600 text-white font-medium px-6 py-2 rounded-lg hover:bg-emerald-700 transition">
          Benachrichtige mich
        </button>
      </form>
    </div>
  );
}
