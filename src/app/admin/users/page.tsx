// Admin Users — Benutzerverwaltung + Checkos schenken
"use client";

import { useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  checkosBalance: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Gift Modal State
  const [giftUserId, setGiftUserId] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState("");
  const [giftDescription, setGiftDescription] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftSuccess, setGiftSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setUsers(data.users);
    } catch {
      setError("Benutzer konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    if (!confirm(`Rolle auf "${newRole}" ändern?`)) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (!res.ok) throw new Error("Fehler beim Aktualisieren");
      fetchUsers();
    } catch {
      alert("Fehler beim Ändern der Rolle.");
    }
  };

  const handleGiftCheckos = async () => {
    if (!giftUserId) return;
    const amount = parseInt(giftAmount);
    if (!amount || amount <= 0 || amount > 10000) {
      alert("Bitte einen gültigen Betrag eingeben (1-10'000).");
      return;
    }

    setGiftLoading(true);
    setGiftSuccess("");

    try {
      const res = await fetch(`/api/admin/users/${giftUserId}/gift-checkos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: giftDescription || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setGiftSuccess(`${amount} Checkos geschenkt! Neuer Stand: ${data.newBalance}`);
      setGiftAmount("");
      setGiftDescription("");
      fetchUsers();

      // Modal nach 2s schliessen
      setTimeout(() => {
        setGiftUserId(null);
        setGiftSuccess("");
      }, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Verschenken");
    } finally {
      setGiftLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const giftUser = users.find((u) => u.id === giftUserId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Benutzer-Verwaltung</h1>

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">E-Mail</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rolle</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Checkos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Registriert</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.name || "–"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                      🦎 {user.checkosBalance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("de-CH")}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => {
                        setGiftUserId(user.id);
                        setGiftAmount("");
                        setGiftDescription("");
                        setGiftSuccess("");
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      🎁 Checkos schenken
                    </button>
                    <button
                      onClick={() => toggleRole(user.id, user.role)}
                      className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                    >
                      {user.role === "admin" ? "→ User" : "→ Admin"}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Keine Benutzer gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gift Checkos Modal */}
      {giftUserId && giftUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">🎁 Checkos schenken</h3>
            <p className="text-sm text-gray-500 mb-4">
              An: <strong>{giftUser.name || giftUser.email}</strong>
              <br />
              Aktueller Stand: {giftUser.checkosBalance} Checkos
            </p>

            {giftSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm text-center">
                ✅ {giftSuccess}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Anzahl Checkos
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(e.target.value)}
                      placeholder="z.B. 50"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grund (optional)
                    </label>
                    <input
                      type="text"
                      value={giftDescription}
                      onChange={(e) => setGiftDescription(e.target.value)}
                      placeholder="z.B. Willkommensgeschenk"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setGiftUserId(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleGiftCheckos}
                    disabled={giftLoading || !giftAmount}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {giftLoading ? "Wird geschenkt…" : "Schenken"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
