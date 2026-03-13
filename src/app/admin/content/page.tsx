// Admin Content — CRUD for ContentBlocks (textarea for now, WYSIWYG later)
"use client";

import { useEffect, useState, useCallback } from "react";

interface ContentBlock {
  id: string;
  slug: string;
  title: string | null;
  content: string;
  updatedAt: string;
}

export default function AdminContentPage() {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ContentBlock | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: "", title: "", content: "" });

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content");
      if (!res.ok) throw new Error("Fehler");
      const data = await res.json();
      setBlocks(data.blocks);
    } catch {
      setError("Inhalte konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  const handleSave = async () => {
    const method = editing ? "PUT" : "POST";
    const body = editing
      ? { id: editing.id, ...form }
      : form;

    try {
      const res = await fetch("/api/admin/content", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }
      setEditing(null);
      setCreating(false);
      setForm({ slug: "", title: "", content: "" });
      fetchBlocks();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Speichern.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Inhalt wirklich löschen?")) return;
    try {
      const res = await fetch("/api/admin/content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Fehler");
      fetchBlocks();
    } catch {
      alert("Fehler beim Löschen.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  // Show form
  if (editing || creating) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {editing ? "Inhalt bearbeiten" : "Neuer Inhalt"}
        </h1>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug (eindeutig)
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              disabled={!!editing}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none disabled:bg-gray-100"
              placeholder="z.B. hero-text, faq, impressum"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Titel (optional)
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="Titel des Inhalts"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inhalt
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={12}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-mono text-sm"
              placeholder="HTML oder Markdown Inhalt..."
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 transition"
            >
              Speichern
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setCreating(false);
                setForm({ slug: "", title: "", content: "" });
              }}
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inhalte verwalten</h1>
        <button
          onClick={() => {
            setCreating(true);
            setForm({ slug: "", title: "", content: "" });
          }}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
        >
          + Neuer Inhalt
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {blocks.map((block) => (
          <div
            key={block.id}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {block.title || block.slug}
                </h3>
                <p className="text-gray-500 text-xs font-mono mt-1">{block.slug}</p>
                <p className="text-gray-600 text-sm mt-2 line-clamp-2">
                  {block.content.substring(0, 200)}
                  {block.content.length > 200 ? "..." : ""}
                </p>
                <p className="text-gray-400 text-xs mt-2">
                  Zuletzt aktualisiert: {new Date(block.updatedAt).toLocaleDateString("de-CH")}
                </p>
              </div>
              <div className="flex gap-2 ml-4 shrink-0">
                <button
                  onClick={() => {
                    setEditing(block);
                    setForm({
                      slug: block.slug,
                      title: block.title || "",
                      content: block.content,
                    });
                  }}
                  className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => handleDelete(block.id)}
                  className="text-red-600 hover:text-red-700 text-sm font-medium"
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        ))}
        {blocks.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
            Noch keine Inhalte vorhanden.
          </div>
        )}
      </div>
    </div>
  );
}
