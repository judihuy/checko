// Admin Subscriptions — Overview of all subscriptions
"use client";

import { useEffect, useState, useCallback } from "react";

interface Subscription {
  id: string;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
  user: { name: string | null; email: string };
  module: { name: string; slug: string; priceMonthly: number };
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/subscriptions");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setSubscriptions(data.subscriptions);
    } catch {
      setError("Abonnements konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const totalRevenue = subscriptions
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + s.module.priceMonthly, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Abo-Uebersicht</h1>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2">
          <span className="text-sm text-emerald-700 font-medium">
            Monatl. Umsatz: CHF {(totalRevenue / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Benutzer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Preis</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Erstellt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Naechste Abr.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {sub.user.name || "–"}
                    </div>
                    <div className="text-gray-500 text-xs">{sub.user.email}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-900">{sub.module.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    CHF {(sub.module.priceMonthly / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        sub.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : sub.status === "canceled"
                          ? "bg-red-100 text-red-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {sub.status === "active"
                        ? "Aktiv"
                        : sub.status === "canceled"
                        ? "Gekuendigt"
                        : sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(sub.createdAt).toLocaleDateString("de-CH")}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {sub.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString("de-CH")
                      : "–"}
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Keine Abonnements vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
