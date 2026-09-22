"use client";

import { useState } from "react";

export default function AdminExportPage() {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function download(kind: "excel" | "pdf") {
    setBusy(kind);
    setError("");
    setInfo("");
    try {
      const res = await fetch(`/api/admin/export/${kind}`, { method: "POST" });
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
        (kind === "excel"
          ? "confirmations_par_filiere.xlsx"
          : "listes_confirmations.pdf");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo(
        kind === "excel"
          ? "Excel téléchargé — une feuille par filière (usage local)."
          : "PDF téléchargé — prêt pour publication web (en-tête EST, titres filière, pages numérotées).",
      );
    } catch {
      setError("Erreur réseau pendant l'export.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div>
        <h2
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Export
        </h2>
        <p className="mt-1 max-w-2xl text-[var(--muted)]">
          Exportez les listes de confirmations : Excel pour le travail local,
          PDF officiel pour la publication sur le site (logo EST, nom de chaque
          filière, numérotation des pages).
        </p>
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

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6">
          <p className="text-xs font-semibold tracking-wide text-[var(--brand)] uppercase">
            Usage local
          </p>
          <h3 className="mt-1 text-xl font-semibold">Excel</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Un classeur avec une feuille par filière (CNE, nom, score, agent,
            date), plus un onglet Résumé.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void download("excel")}
            className="mt-5 w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
          >
            {busy === "excel" ? "Génération…" : "Télécharger Excel"}
          </button>
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-6">
          <p className="text-xs font-semibold tracking-wide text-[var(--brand)] uppercase">
            Publication site
          </p>
          <h3 className="mt-1 text-xl font-semibold">PDF</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            En-tête EST / UMI, titre de filière en tête de chaque liste, tableau
            classé par score, pagination Page X / Y.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void download("pdf")}
            className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
          >
            {busy === "pdf" ? "Génération…" : "Télécharger PDF"}
          </button>
        </section>
      </div>
    </div>
  );
}
