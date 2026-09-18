"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EXPORT_KEYS,
  EXPORT_COLUMNS,
} from "@/lib/confirmations-export";

type Row = Record<string, string>;
type Group = { filiere: string; count: number; rows: Row[] };

export default function AdminConfirmationsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filiereFilter, setFiliereFilter] = useState("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCols, setExportCols] = useState<string[]>([...DEFAULT_EXPORT_KEYS]);
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger");
        return;
      }
      setGroups(data.groups || []);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleGroups = useMemo(() => {
    if (filiereFilter === "all") return groups;
    return groups.filter((g) => g.filiere === filiereFilter);
  }, [groups, filiereFilter]);

  const total = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.count, 0),
    [visibleGroups],
  );

  function toggleCol(key: string) {
    setExportCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  async function doExport() {
    if (exportCols.length === 0) {
      setError("Sélectionnez au moins une colonne à exporter.");
      return;
    }
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filiere: filiereFilter,
          columns: exportCols,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "confirmations.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch {
      setError("Erreur réseau pendant l'export.");
    } finally {
      setExporting(false);
    }
  }

  async function doClearLog() {
    if (
      !window.confirm(
        "Effacer TOUT le journal des confirmations ?\n\nLes agents et la base étudiants (filières) seront conservés.",
      )
    ) {
      return;
    }
    setClearing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations/clear", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Impossible d'effacer le journal");
        return;
      }
      setGroups([]);
      await load();
    } catch {
      setError("Erreur réseau pendant l'effacement.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Confirmations
          </h2>
          <p className="mt-1 text-[var(--muted)]">
            Classées par filière, score du plus élevé au plus bas.
            {loading ? "" : ` — ${total} affiché${total > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={clearing || total === 0}
            onClick={doClearLog}
            className="rounded-xl border border-[var(--danger)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-red-50 disabled:opacity-50"
          >
            {clearing ? "Effacement…" : "Vider le journal"}
          </button>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            Exporter Excel
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">
          Filière{" "}
          <select
            value={filiereFilter}
            onChange={(e) => setFiliereFilter(e.target.value)}
            className="ml-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
          >
            <option value="all">Toutes</option>
            {groups.map((g) => (
              <option key={g.filiere} value={g.filiere}>
                {g.filiere} ({g.count})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
        >
          Actualiser
        </button>
      </div>

      {exportOpen ? (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
          <h3 className="text-lg font-semibold">Options d&apos;export</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Cochez uniquement les colonnes voulues (ex. CNE, nom, filière,
            score). Respecte le filtre filière ci-dessus. Fichier .xlsx.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {EXPORT_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={exportCols.includes(col.key)}
                  onChange={() => toggleCol(col.key)}
                />
                <span>{col.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setExportCols([...DEFAULT_EXPORT_KEYS])}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold"
            >
              Défaut (CNE, nom, filière, score)
            </button>
            <button
              type="button"
              onClick={() => setExportCols(EXPORT_COLUMNS.map((c) => c.key))}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold"
            >
              Tout sélectionner
            </button>
            <button
              type="button"
              onClick={() => setExportCols([])}
              className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold"
            >
              Tout décocher
            </button>
            <button
              type="button"
              disabled={exporting || exportCols.length === 0}
              onClick={doExport}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {exporting ? "Export…" : "Télécharger Excel"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <section className="mt-6 space-y-6">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        ) : visibleGroups.length === 0 ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 text-sm text-[var(--muted)]">
            Aucune confirmation pour le moment.
          </p>
        ) : (
          visibleGroups.map((g) => (
            <div
              key={g.filiere}
              className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{g.filiere}</h3>
                <span className="text-sm text-[var(--muted)]">
                  {g.count} étudiant{g.count > 1 ? "s" : ""} — score ↓
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Score</th>
                      <th className="py-2 pr-3 font-medium">CNE</th>
                      <th className="py-2 pr-3 font-medium">Nom complet</th>
                      <th className="py-2 pr-3 font-medium">Filière</th>
                      <th className="py-2 pr-3 font-medium">Agent</th>
                      <th className="py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr
                        key={`${r.CNE || r.Code}-${i}`}
                        className="border-b border-[var(--line)]/70"
                      >
                        <td className="py-2 pr-3 text-[var(--muted)]">
                          {i + 1}
                        </td>
                        <td className="py-2 pr-3 font-semibold">
                          {r.Score || "—"}
                        </td>
                        <td className="py-2 pr-3 font-medium">
                          {r.CNE || r.Code}
                        </td>
                        <td className="py-2 pr-3">
                          {r.NomComplet ||
                            `${r.PrenomFr || ""} ${r.NomFr || ""}`.trim() ||
                            "—"}
                        </td>
                        <td className="py-2 pr-3">{r.Filiere || "—"}</td>
                        <td className="py-2 pr-3 font-medium">
                          {r.Agent || "—"}
                        </td>
                        <td className="py-2 text-[var(--muted)]">
                          {r.DateConfirmation || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
