// Admin Dashboard — KPIs: User count, subscription count, revenue
// Plus recent audit log entries
import { prisma } from "@/lib/prisma";

// Force dynamic rendering (needs DB access)
export const dynamic = "force-dynamic";

interface KPI {
  label: string;
  value: string;
  icon: string;
}

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: string | null;
  createdAt: Date;
}

async function getKPIs(): Promise<KPI[]> {
  try {
    const [userCount, activeSubCount, totalRevenue, moduleCount] = await Promise.all([
      prisma.user.count(),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "active" } }).then(async (count) => {
        if (count === 0) return 0;
        const subs = await prisma.subscription.findMany({
          where: { status: "active" },
          include: { module: { select: { priceMonthly: true } } },
        });
        return subs.reduce((sum, sub) => sum + sub.module.priceMonthly, 0);
      }),
      prisma.module.count({ where: { isActive: true } }),
    ]);

    return [
      { label: "Benutzer", value: userCount.toString(), icon: "👥" },
      { label: "Aktive Abos", value: activeSubCount.toString(), icon: "💳" },
      { label: "Monatl. Umsatz", value: `CHF ${(totalRevenue / 100).toFixed(2)}`, icon: "💰" },
      { label: "Aktive Module", value: moduleCount.toString(), icon: "📦" },
    ];
  } catch {
    return [
      { label: "Benutzer", value: "–", icon: "👥" },
      { label: "Aktive Abos", value: "–", icon: "💳" },
      { label: "Monatl. Umsatz", value: "–", icon: "💰" },
      { label: "Aktive Module", value: "–", icon: "📦" },
    ];
  }
}

async function getRecentAuditLogs(): Promise<AuditEntry[]> {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });
  } catch {
    return [];
  }
}

export default async function AdminDashboard() {
  const [kpis, recentLogs] = await Promise.all([getKPIs(), getRecentAuditLogs()]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{kpi.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-sm text-gray-500">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Letzte Aktivitäten
        </h2>
        {recentLogs.length > 0 ? (
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm border-b border-gray-100 pb-3 last:border-0">
                <span className="text-gray-400 shrink-0 w-36">
                  {new Date(log.createdAt).toLocaleString("de-CH")}
                </span>
                <span className="font-medium text-gray-700">{log.action}</span>
                {log.target && (
                  <span className="text-gray-500">→ {log.target}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Noch keine Aktivitäten vorhanden.
          </p>
        )}
      </div>
    </div>
  );
}
