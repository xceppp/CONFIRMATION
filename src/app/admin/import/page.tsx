"use client";

import { FormEvent, useState } from "react";
import { FILIERES } from "@/lib/filieres";

export default function AdminImportPage() {
  const [filiereCode, setFiliereCode] = useState("FBA");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!file) {
      setError("Choisissez un fichier CSV.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filiereCode", filiereCode);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import impossible");
        return;
      }
      setMessage(data.message);
      setFile(null);
    } catch {
      setError("Erreur réseau pendant l'import.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Importation CSV
      </h2>
      <p className="mt-1 text-[var(--muted)]">
        Chaque filière a sa propre feuille Google Sheets, nommée avec le code
        (ex. <strong>FBA</strong>, <strong>GI</strong>, <strong>DWM</strong>).
      </p>

      <form
        onSubmit={onUpload}
        className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">
              Filière (= nom de la feuille)
            </span>
            <select
              value={filiereCode}
              onChange={(e) => setFiliereCode(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none ring-[var(--brand)] focus:ring-2"
            >
              {FILIERES.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Fichier CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </label>
        </div>

        <p className="mt-3 text-sm text-[var(--muted)]">
          Séparateur <code>;</code> — comme l&apos;export Massar. Les lignes
          iront dans la feuille <strong>{filiereCode}</strong>.
        </p>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={uploading}
          className="mt-5 rounded-xl bg-[var(--brand)] px-5 py-3 font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {uploading
            ? "Import en cours…"
            : `Importer → feuille ${filiereCode}`}
        </button>
      </form>
    </div>
  );
}
