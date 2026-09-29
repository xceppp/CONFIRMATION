"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EXPORT_KEYS,
  EXPORT_COLUMNS,
} from "@/lib/confirmations-export";

type Row = Record<string, string>;
type Group = { filiere: string; count: number; rows: Row[] };
type SortKey = "score" | "cne" | "nom" | "filiere" | "agent" | "date";

function nomOf(r: Row): string {
  return (
    String(r.NomComplet || "").trim() ||
    `${r.PrenomFr || ""} ${r.NomFr || ""}`.trim() ||
    ""
  );
}

function scoreOf(r: Row): number {
  const n = Number.parseFloat(String(r.Score || "").replace(",", "."));
  return Number.isFinite(n) ? n : -Infinity;
}

function sortRows(rows: Row[], key: SortKey, dir: "asc" | "desc"): Row[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "score") cmp = scoreOf(a) - scoreOf(b);
    else if (key === "cne")
      cmp = String(a.CNE || a.Code || "").localeCompare(
        String(b.CNE || b.Code || ""),
        "fr",
      );
    else if (key === "nom")
      cmp = nomOf(a).localeCompare(nomOf(b), "fr");
    else if (key === "filiere")
      cmp = String(a.Filiere || "").localeCompare(String(b.Filiere || ""), "fr");
    else if (key === "agent")
      cmp = String(a.Agent || "").localeCompare(String(b.Agent || ""), "fr");
    else
      cmp = String(a.DateConfirmation || "").localeCompare(
        String(b.DateConfirmation || ""),
        "fr",
      );
    if (cmp !== 0) return cmp * mul;
    return scoreOf(b) - scoreOf(a);
  });
}

export default function AdminConfirmationsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filiereFilter, setFiliereFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCols, setExportCols] = useState<string[]>([...DEFAULT_EXPORT_KEYS]);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyInfo, setVerifyInfo] = useState("");
  const [clearing, setClearing] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPassword, setClearPassword] = useState("");

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

  const allRows = useMemo(
    () => groups.flatMap((g) => g.rows),
    [groups],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = allRows;
    if (filiereFilter !== "all") {
      rows = rows.filter((r) => r.Filiere === filiereFilter);
    }
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.CNE,
          r.Code,
          r.NomComplet,
          r.PrenomFr,
          r.NomFr,
          r.Filiere,
          r.Score,
          r.Agent,
          r.DateConfirmation,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        return hay.includes(q);
      });
    }
    return sortRows(rows, sortKey, sortDir);
  }, [allRows, filiereFilter, search, sortKey, sortDir]);

  const total = visibleRows.length;

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "score" || key === "date" ? "desc" : "asc");
    }
  }

  function SortTh({
    k,
    label,
    className = "py-2 pr-3",
  }: {
    k: SortKey;
    label: string;
    className?: string;
  }) {
    const active = sortKey === k;
    return (
      <th className={className}>
        <button
          type="button"
          onClick={() => clickSort(k)}
          className={`font-medium hover:text-[var(--brand)] ${
            active ? "text-[var(--brand)]" : "text-[var(--muted)]"
          }`}
        >
          {label}
          {active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
        </button>
      </th>
    );
  }

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

  async function doExportPdf() {
    setExportingPdf(true);
    setError("");
    try {
      const res = await fetch("/api/admin/export/pdf", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export PDF impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "listes_confirmations.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erreur réseau pendant l'export PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  async function doVerifyFiliere() {
    setVerifying(true);
    setError("");
    setVerifyInfo("");
    try {
      const probe = await fetch("/api/admin/verify-filiere");
      const data = await probe.json().catch(() => ({}));
      if (!probe.ok) {
        setError(data.error || "Vérification impossible");
        return;
      }
      if (!data.mismatches) {
        setVerifyInfo(
          `OK — ${data.checked} confirmations. Chaque CNE existe bien dans la filière confirmée.`,
        );
        return;
      }
      setVerifyInfo(
        `${data.mismatches} anomalie(s) sur ${data.checked} confirmations. Excel téléchargé.`,
      );
      const res = await fetch("/api/admin/verify-filiere?format=excel");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Export des anomalies impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] || "anomalies_filiere.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erreur réseau pendant la vérification.");
    } finally {
      setVerifying(false);
    }
  }

  async function doClearLog() {
    if (!clearPassword.trim()) {
      setError("Mot de passe requis pour vider le journal.");
      return;
    }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: clearPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Impossible d'effacer le journal");
        return;
      }
      setGroups([]);
      setClearOpen(false);
      setClearPassword("");
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
            Cliquez une colonne pour trier.
            {loading ? "" : ` — ${total} affiché${total > 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={clearing || total === 0}
            onClick={() => {
              setClearOpen((v) => !v);
              setClearPassword("");
              setError("");
            }}
            className="rounded-xl border border-[var(--danger)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--danger)] hover:bg-red-50 disabled:opacity-50"
          >
            Vider le journal
          </button>
          <button
            type="button"
            onClick={() => setExportOpen((v) => !v)}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            Exporter Excel
          </button>
          <button
            type="button"
            disabled={exportingPdf || total === 0}
            onClick={() => void doExportPdf()}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {exportingPdf ? "PDF…" : "Exporter PDF"}
          </button>
          <button
            type="button"
            disabled={verifying || loading}
            onClick={() => void doVerifyFiliere()}
            className="rounded-xl border border-[var(--brand)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--bg)] disabled:opacity-50"
          >
            {verifying ? "Vérification…" : "Vérifier filières"}
          </button>
        </div>
      </div>

      {clearOpen ? (
        <section className="mt-4 rounded-2xl border border-[var(--danger)]/40 bg-red-50/50 p-5">
          <h3 className="text-lg font-semibold text-[var(--danger)]">
            Confirmer l&apos;effacement
          </h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Entrez le mot de passe de sécurité pour vider le journal. Sans ce
            mot de passe, rien n&apos;est effacé.
          </p>
          <label className="mt-4 block max-w-sm">
            <span className="mb-1.5 block text-sm font-medium">
              Mot de passe
            </span>
            <input
              type="password"
              value={clearPassword}
              onChange={(e) => setClearPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 outline-none ring-[var(--danger)] focus:ring-2"
              placeholder="Mot de passe requis"
              autoComplete="off"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={clearing || !clearPassword.trim()}
              onClick={doClearLog}
              className="rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {clearing ? "Effacement…" : "Confirmer et vider"}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => {
                setClearOpen(false);
                setClearPassword("");
              }}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold"
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="min-w-[220px] flex-1 text-sm font-medium sm:max-w-md">
          Recherche
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="CNE, nom, filière, agent, score…"
            className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
          />
        </label>
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
            Une feuille Excel par filière (score ↓). Cochez les colonnes
            voulues. Respecte le filtre filière ci-dessus.
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
      {verifyInfo ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
          {verifyInfo}
        </p>
      ) : null}

      <section className="mt-6">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        ) : visibleRows.length === 0 ? (
          <p className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 text-sm text-[var(--muted)]">
            Aucune confirmation pour le moment.
          </p>
        ) : (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)]">
                    <th className="py-2 pr-3 font-medium text-[var(--muted)]">
                      #
                    </th>
                    <SortTh k="score" label="Score" />
                    <SortTh k="cne" label="CNE" />
                    <SortTh k="nom" label="Nom complet" />
                    <SortTh k="filiere" label="Filière" />
                    <SortTh k="agent" label="Agent" />
                    <SortTh k="date" label="Date" className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, i) => (
                    <tr
                      key={`${r.CNE || r.Code}-${r.DateConfirmation}-${i}`}
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
                      <td className="py-2 pr-3">{nomOf(r) || "—"}</td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() =>
                            setFiliereFilter((prev) =>
                              prev === r.Filiere ? "all" : r.Filiere || "all",
                            )
                          }
                          className="text-left hover:text-[var(--brand)] hover:underline"
                        >
                          {r.Filiere || "—"}
                        </button>
                      </td>
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
        )}
      </section>
    </div>
  );
}
