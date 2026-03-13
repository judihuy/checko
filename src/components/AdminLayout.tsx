// Admin layout wrapper with sidebar navigation
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const adminLinks = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/users", label: "Benutzer", icon: "👥" },
  { href: "/admin/modules", label: "Module", icon: "📦" },
  { href: "/admin/transactions", label: "Transaktionen", icon: "🦎" },
  { href: "/admin/content", label: "Inhalte", icon: "📝" },
  { href: "/admin/audit-log", label: "Audit-Log", icon: "📋" },
  { href: "/admin/settings", label: "Einstellungen", icon: "⚙️" },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Top bar */}
      <div className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 items-center">
            <Link href="/admin" className="flex items-center gap-2 font-bold">
              <span>🦎</span>
              <span>Checko Admin</span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-400 hover:text-white text-sm transition"
              >
                Zur Webseite
              </Link>
              <span className="text-gray-500 text-sm">
                {session?.user?.name || session?.user?.email}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-56 shrink-0">
            <nav className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {adminLinks.map((link) => {
                const isActive =
                  link.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-4 py-3 text-sm transition border-b border-gray-100 last:border-0 ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
