// Module card component for the landing page grid and dashboard
"use client";

import Link from "next/link";

interface ModuleCardProps {
  slug: string;
  name: string;
  description: string;
  priceMonthly?: number;
  icon?: string | null;
  isActive: boolean;
  status?: string;
  showPrice?: boolean;
  linkTo?: string;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  active: {
    label: "Verfügbar",
    className: "bg-emerald-100 text-emerald-700",
  },
  coming_soon: {
    label: "Demnächst",
    className: "bg-amber-100 text-amber-700",
  },
  beta: {
    label: "Beta",
    className: "bg-blue-100 text-blue-700",
  },
  maintenance: {
    label: "Wartung",
    className: "bg-red-100 text-red-700",
  },
};

export function ModuleCard({
  slug,
  name,
  description,
  icon,
  isActive,
  status = isActive ? "active" : "coming_soon",
  showPrice = true,
  linkTo,
}: ModuleCardProps) {
  const isComingSoon = status === "coming_soon";
  const isMaintenance = status === "maintenance";
  // Aktive/Beta Module → Dashboard, Coming Soon/Maintenance → Detailseite
  const href = linkTo || (isComingSoon || isMaintenance ? `/module/${slug}` : `/dashboard/${slug}`);
  const badge = STATUS_BADGES[status] || STATUS_BADGES.coming_soon;

  return (
    <Link href={href} className="group block">
      <div
        className={`bg-white rounded-xl border border-gray-200 p-6 h-full transition-all duration-200 hover:shadow-lg hover:border-emerald-300 ${
          isComingSoon || isMaintenance ? "opacity-70 hover:opacity-90" : ""
        }`}
      >
        {/* Icon + Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="text-3xl">{icon || "🔧"}</div>
          {status !== "active" && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-emerald-700 transition mb-2">
          {name}
        </h3>

        {/* Description */}
        <p className="text-gray-600 text-sm leading-relaxed mb-4 line-clamp-3">
          {description}
        </p>

        {/* Status / Checkos Info */}
        {showPrice && (
          <div className="mt-auto">
            {status === "active" ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-sm">
                🦎 Ab 2 Checkos pro Nutzung
              </span>
            ) : status === "beta" ? (
              <span className="inline-flex items-center gap-1 text-blue-600 font-medium text-sm">
                🧪 Kostenlos in der Beta-Phase
              </span>
            ) : (
              <span className="text-gray-400 text-sm italic">
                Benachrichtigung verfügbar →
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
