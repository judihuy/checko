// Admin Dashboard — KPIs: User count, Checkos im Umlauf, Käufe, Umsatz
// Plus Glücksrad-Statistik und recent audit log entries
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

interface WheelStats {
  totalSpins: number;
  totalCheckosGiven: number;
  avgPrizePerSpin: number;
  spinsThisWeek: number;
  checkosThisWeek: number;
  spinsThisMonth: number;
  checkosThisMonth: number;
  registrationSpins: number;
  dailySpins: number;
  registrationCheckos: number;
  dailyCheckos: number;
  newUsersThisMonth: number;
}

async function getKPIs(): Promise<KPI[]> {
  try {
    const [userCount, totalCheckosInCirculation, totalPurchases, moduleCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.aggregate({ _sum: { checkosBalance: true } }).then((r) => r._sum.checkosBalance ?? 0),
        prisma.checkoPurchase.aggregate({ _sum: { priceCHF: true } }).then((r) => r._sum.priceCHF ?? 0),
        prisma.module.count({ where: { isActive: true } }),
      ]);

    return [
      { label: "Benutzer", value: userCount.toString(), icon: "👥" },
      {
        label: "Checkos im Umlauf",
        value: totalCheckosInCirculation.toString(),
        icon: "🦎",
      },
      {
        label: "Umsatz (Checkos)",
        value: `CHF ${(totalPurchases / 100).toFixed(2)}`,
        icon: "💰",
      },
      { label: "Aktive Module", value: moduleCount.toString(), icon: "📦" },
    ];
  } catch {
    return [
      { label: "Benutzer", value: "–", icon: "👥" },
      { label: "Checkos im Umlauf", value: "–", icon: "🦎" },
      { label: "Umsatz (Checkos)", value: "–", icon: "💰" },
      { label: "Aktive Module", value: "–", icon: "📦" },
    ];
  }
}

async function getWheelStats(): Promise<WheelStats | null> {
  try {
    const now = new Date();

    // Start der aktuellen Woche (Montag)
    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start des aktuellen Monats
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalSpinsResult,
      totalCheckosResult,
      spinsThisWeekResult,
      checkosThisWeekResult,
      spinsThisMonthResult,
      checkosThisMonthResult,
      registrationSpinsResult,
      dailySpinsResult,
      registrationCheckosResult,
      dailyCheckosResult,
      newUsersThisMonth,
    ] = await Promise.all([
      prisma.wheelSpin.count(),
      prisma.wheelSpin.aggregate({ _sum: { amount: true } }),
      prisma.wheelSpin.count({ where: { createdAt: { gte: startOfWeek } } }),
      prisma.wheelSpin.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: startOfWeek } } }),
      prisma.wheelSpin.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.wheelSpin.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: startOfMonth } } }),
      prisma.wheelSpin.count({ where: { type: "registration" } }),
      prisma.wheelSpin.count({ where: { type: "daily" } }),
      prisma.wheelSpin.aggregate({ _sum: { amount: true }, where: { type: "registration" } }),
      prisma.wheelSpin.aggregate({ _sum: { amount: true }, where: { type: "daily" } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const totalSpins = totalSpinsResult;
    const totalCheckosGiven = totalCheckosResult._sum.amount ?? 0;

    return {
      totalSpins,
      totalCheckosGiven,
      avgPrizePerSpin: totalSpins > 0
        ? Math.round((totalCheckosGiven / totalSpins) * 10) / 10
        : 0,
      spinsThisWeek: spinsThisWeekResult,
      checkosThisWeek: checkosThisWeekResult._sum.amount ?? 0,
      spinsThisMonth: spinsThisMonthResult,
      checkosThisMonth: checkosThisMonthResult._sum.amount ?? 0,
      registrationSpins: registrationSpinsResult,
      dailySpins: dailySpinsResult,
      registrationCheckos: registrationCheckosResult._sum.amount ?? 0,
      dailyCheckos: dailyCheckosResult._sum.amount ?? 0,
      newUsersThisMonth,
    };
  } catch {
    return null;
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
  const [kpis, wheelStats, recentLogs] = await Promise.all([
    getKPIs(),
    getWheelStats(),
    getRecentAuditLogs(),
  ]);

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

      {/* Glücksrad Statistik */}
      {wheelStats && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            🎰 Glücksrad Statistik
          </h2>

          {/* Haupt-KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <p className="text-xs text-purple-600 font-medium">Total Drehungen</p>
              <p className="text-2xl font-bold text-purple-900">{wheelStats.totalSpins}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4">
              <p className="text-xs text-emerald-600 font-medium">Total verschenkt</p>
              <p className="text-2xl font-bold text-emerald-900">{wheelStats.totalCheckosGiven} 🦎</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <p className="text-xs text-blue-600 font-medium">Ø Gewinn / Drehung</p>
              <p className="text-2xl font-bold text-blue-900">{wheelStats.avgPrizePerSpin}</p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
              <p className="text-xs text-orange-600 font-medium">Neue User (Monat)</p>
              <p className="text-2xl font-bold text-orange-900">{wheelStats.newUsersThisMonth}</p>
            </div>
          </div>

          {/* Zeitraum-Statistiken */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-gray-100 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">📅 Diese Woche</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drehungen</span>
                <span className="font-semibold text-gray-900">{wheelStats.spinsThisWeek}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">Checkos verschenkt</span>
                <span className="font-semibold text-gray-900">{wheelStats.checkosThisWeek} 🦎</span>
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">📆 Diesen Monat</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drehungen</span>
                <span className="font-semibold text-gray-900">{wheelStats.spinsThisMonth}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">Checkos verschenkt</span>
                <span className="font-semibold text-gray-900">{wheelStats.checkosThisMonth} 🦎</span>
              </div>
            </div>
          </div>

          {/* Aufschlüsselung nach Typ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-gray-100 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">🎁 Registrierungs-Rad</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drehungen</span>
                <span className="font-semibold text-gray-900">{wheelStats.registrationSpins}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">Checkos verschenkt</span>
                <span className="font-semibold text-gray-900">{wheelStats.registrationCheckos} 🦎</span>
              </div>
            </div>
            <div className="border border-gray-100 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">🔄 Tägliches Rad</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Drehungen</span>
                <span className="font-semibold text-gray-900">{wheelStats.dailySpins}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-500">Checkos verschenkt</span>
                <span className="font-semibold text-gray-900">{wheelStats.dailyCheckos} 🦎</span>
              </div>
            </div>
          </div>

          {/* Kosten-Nutzen Vergleich */}
          {wheelStats.newUsersThisMonth > 0 && wheelStats.checkosThisMonth > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">💡 Kosten-Nutzen (Monat)</h3>
              <p className="text-sm text-yellow-700">
                <span className="font-semibold">{wheelStats.checkosThisMonth} Checkos</span> verschenkt →{" "}
                <span className="font-semibold">{wheelStats.newUsersThisMonth} neue Registrierungen</span>
                {" "}= Ø{" "}
                <span className="font-semibold">
                  {Math.round(wheelStats.checkosThisMonth / wheelStats.newUsersThisMonth)} Checkos
                </span>{" "}
                pro neuem User
              </p>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Letzte Aktivitäten
        </h2>
        {recentLogs.length > 0 ? (
          <div className="space-y-3">
            {recentLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 text-sm border-b border-gray-100 pb-3 last:border-0"
              >
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
