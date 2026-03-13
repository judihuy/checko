// Admin Users — List users, change roles
"use client";

import { useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  _count: { subscriptions: number };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Abos</th>
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
                  <td className="px-4 py-3 text-gray-600">{user._count.subscriptions}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("de-CH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleRole(user.id, user.role)}
                      className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                    >
                      {user.role === "admin" ? "Zum User machen" : "Zum Admin machen"}
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
    </div>
  );
}
