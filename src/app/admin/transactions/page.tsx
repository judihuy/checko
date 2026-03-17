// Admin Transactions — Übersicht aller Checko-Transaktionen
"use client";

import { useEffect, useState, useCallback } from "react";

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  moduleSlug: string | null;
  qualityTier: string | null;
  createdAt: string;
  user: { name: string | null; email: string };
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "purchase":
      return "Kauf";
    case "usage":
      return "Verbrauch";
    case "gift":
      return "Geschenk";
    case "referral":
      return "Empfehlung";
    case "welcome":
      return "Willkommen";
    case "wheel":
      return "Glücksrad";
    case "daily_wheel":
      return "Tägliches Rad";
    default:
      return type;
  }
}

function getTypeBadgeColor(type: string): string {
  switch (type) {
    case "purchase":
      return "bg-blue-100 text-blue-700";
    case "usage":
      return "bg-red-100 text-red-700";
    case "gift":
      return "bg-purple-100 text-purple-700";
    case "referral":
      return "bg-orange-100 text-orange-700";
    case "welcome":
      return "bg-emerald-100 text-emerald-700";
    case "wheel":
    case "daily_wheel":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/transactions");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setTransactions(data.transactions);
    } catch {
      setError("Transaktionen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const totalPurchased = transactions
    .filter((t) => t.type === "purchase")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalUsed = transactions
    .filter((t) => t.type === "usage")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Checko-Transaktionen</h1>
        <div className="flex gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span className="text-xs text-emerald-600">Gekauft</span>
            <span className="block text-sm font-bold text-emerald-700">
              {totalPurchased} Checkos
            </span>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="text-xs text-red-600">Verbraucht</span>
            <span className="block text-sm font-bold text-red-700">
              {totalUsed} Checkos
            </span>
          </div>
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Typ</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Betrag</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Beschreibung</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {tx.user.name || "–"}
                    </div>
                    <div className="text-gray-500 text-xs">{tx.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeBadgeColor(
                        tx.type
                      )}`}
                    >
                      {getTypeLabel(tx.type)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold ${
                        tx.amount >= 0 ? "text-emerald-600" : "text-red-500"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                    {tx.description || "–"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {tx.moduleSlug || "–"}
                    {tx.qualityTier && (
                      <span className="text-xs text-gray-400 ml-1">
                        ({tx.qualityTier})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tx.createdAt).toLocaleDateString("de-CH", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Keine Transaktionen vorhanden.
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
