// Module card component for the landing page grid and dashboard
"use client";

import Link from "next/link";

interface ModuleCardProps {
  slug: string;
  name: string;
  description: string;
  priceMonthly?: number; // Legacy — nicht mehr angezeigt
  icon?: string | null;
  isActive: boolean;
  showPrice?: boolean;
  linkTo?: string;
}

export function ModuleCard({
  slug,
  name,
  description,
  icon,
  isActive,
  showPrice = true,
  linkTo,
}: ModuleCardProps) {
  const href = linkTo || `/module/${slug}`;

  return (
    <Link href={href} className="group block">
      <div
        className={`bg-white rounded-xl border border-gray-200 p-6 h-full transition-all duration-200 hover:shadow-lg hover:border-emerald-300 ${
          !isActive ? "opacity-60" : ""
        }`}
      >
        {/* Icon */}
        <div className="text-3xl mb-3">{icon || "🔧"}</div>

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
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-sm">
                🦎 Ab 2 Checkos pro Nutzung
              </span>
            ) : (
              <span className="text-gray-400 text-sm italic">Demnächst verfügbar</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
