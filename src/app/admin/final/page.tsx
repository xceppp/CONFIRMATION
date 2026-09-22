"use client";

import { useEffect, useMemo, useState } from "react";
import { FILIERES, resolveFiliereFromLabel } from "@/lib/filieres";

type ConfCounts = Record<string, number>;

export default function AdminFinalPage() {
  const [places, setPlaces] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of FILIERES) init[f.code] = "";
    return init;
  });
  const [confirmedByCode, setConfirmedByCode] = useState<ConfCounts>({});
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function loadCounts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger les confirmations");
        return;
      }
      const counts: ConfCounts = {};
      for (const f of FILIERES) counts[f.code] = 0;

      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (rows.length > 0) {
        for (const row of rows) {
          const label = String(row.Filiere || row.FiliereCode || "");
          const match = resolveFiliereFromLabel(label);
          if (match) counts[match.code] = (counts[match.code] || 0) + 1;
        }
      } else {
        for (const g of data.groups || []) {
          const match = resolveFiliereFromLabel(String(g.filiere || ""));
          if (match) {
            counts[match.code] =
              (counts[match.code] || 0) + Number(g.count || 0);
          }
        }
      }
      setConfirmedByCode(counts);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCounts();
  }, []);

  const filledCount = useMemo(
    () =>
      FILIERES.filter((f) => {
        const n = Number.parseInt(places[f.code] || "", 10);
        return Number.isFinite(n) && n > 0;
      }).length,
    [places],
  );

  async function doExport(format: "excel" | "pdf") {
    setExporting(format);
    setError("");
    setInfo("");
    try {
      const bodyPlaces: Record<string, number> = {};
      for (const f of FILIERES) {
        const n = Number.parseInt(String(places[f.code] || "").trim(), 10);
        if (Number.isFinite(n) && n > 0) bodyPlaces[f.code] = n;
      }
      if (Object.keys(bodyPlaces).length === 0) {
        setError("Indiquez au moins un nombre de places (> 0).");
        return;
      }

      const res = await fetch("/api/admin/final/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places: bodyPlaces, format }),
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
          ?.match(/filename="(.+)"/)?.[1] ||
        (format === "pdf"
          ? "admis_inscription.pdf"
          : "admis_inscription.xlsx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo(
        format === "pdf"
          ? "PDF des admis téléchargé — listes pour inscription / publication."
          : "Excel des admis téléchargé — top scores selon les places (usage local).",
      );
    } catch {
      setError("Erreur réseau pendant l'export.");
    } finally {
      setExporting(null);
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
            Final
          </h2>
          <p className="mt-1 max-w-2xl text-[var(--muted)]">
            Indiquez le nombre de places par filière. L&apos;export prend les
            confirmés classés par score (du plus élevé) — ce sont les{" "}
            <strong className="font-semibold text-[var(--ink)]">admis</strong>{" "}
            à procéder à l&apos;inscription. Excel pour le local, PDF pour la
            publication.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadCounts()}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[var(--bg)]"
          >
            Actualiser
          </button>
          <button
            type="button"
            disabled={exporting !== null || filledCount === 0}
            onClick={() => void doExport("excel")}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
          >
            {exporting === "excel" ? "Excel…" : "Exporter Excel"}
          </button>
          <button
            type="button"
            disabled={exporting !== null || filledCount === 0}
            onClick={() => void doExport("pdf")}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {exporting === "pdf" ? "PDF…" : "Exporter PDF"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
          {info}
        </p>
      ) : null}

      <section className="mt-6 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Filière</th>
                <th className="py-2 pr-3 font-medium">Confirmés</th>
                <th className="py-2 font-medium">Places (N)</th>
              </tr>
            </thead>
            <tbody>
              {FILIERES.map((f) => {
                const confirmed = confirmedByCode[f.code] || 0;
                const n = Number.parseInt(places[f.code] || "", 10);
                const short =
                  Number.isFinite(n) && n > 0 && confirmed < n
                    ? confirmed
                    : null;
                return (
                  <tr
                    key={f.code}
                    className="border-b border-[var(--line)]/70"
                  >
                    <td className="py-3 pr-3 font-semibold">{f.code}</td>
                    <td className="py-3 pr-3">{f.name}</td>
                    <td className="py-3 pr-3 text-[var(--muted)]">
                      {confirmed}
                      {short != null ? (
                        <span className="ml-2 text-xs text-[var(--danger)]">
                          (moins que N)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="ex. 90"
                        value={places[f.code]}
                        onChange={(e) =>
                          setPlaces((prev) => ({
                            ...prev,
                            [f.code]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
