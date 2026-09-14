"use client";

import { FormEvent, useState } from "react";
import { FILIERES, detectFiliereFromFilename } from "@/lib/filieres";

type BulkFileResult = {
  file: string;
  ok: boolean;
  filiereCode?: string;
  imported?: number;
  error?: string;
};

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (data.error) return data.error;
  } catch {
    /* not JSON — often a Vercel timeout / HTML page */
  }
  if (res.status === 413) {
    return "Fichier trop volumineux pour le serveur.";
  }
  if (res.status === 504 || res.status === 502) {
    return "Délai dépassé (timeout). Réessayez fichier par fichier.";
  }
  if (!text) return `Erreur serveur (${res.status}).`;
  return text.slice(0, 180);
}

export default function AdminImportPage() {
  const [filiereCode, setFiliereCode] = useState("FBA");
  const [file, setFile] = useState<File | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkFileResult[]>([]);

  async function uploadOneFile(
    csv: File,
    code: string,
  ): Promise<{ ok: boolean; imported?: number; error?: string; message?: string }> {
    const form = new FormData();
    form.append("file", csv);
    form.append("filiereCode", code);
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      return { ok: false, error: await readApiError(res) };
    }
    try {
      const data = (await res.json()) as {
        imported?: number;
        message?: string;
      };
      return {
        ok: true,
        imported: data.imported,
        message: data.message,
      };
    } catch {
      return { ok: false, error: "Réponse serveur invalide." };
    }
  }

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
      const result = await uploadOneFile(file, filiereCode);
      if (!result.ok) {
        setError(result.error || "Import impossible");
        return;
      }
      setMessage(result.message || "Import terminé.");
      setFile(null);
    } catch {
      setError("Erreur réseau pendant l'import.");
    } finally {
      setUploading(false);
    }
  }

  async function onBulkUpload(e: FormEvent) {
    e.preventDefault();
    setBulkError("");
    setBulkMessage("");
    setBulkResults([]);
    setBulkProgress("");

    if (bulkFiles.length === 0) {
      setBulkError("Choisissez un ou plusieurs fichiers CSV.");
      return;
    }

    setBulkUploading(true);
    const results: BulkFileResult[] = [];
    let totalImported = 0;
    let failed = 0;

    try {
      // One file = one request (évite timeout Vercel sur un gros lot).
      for (let i = 0; i < bulkFiles.length; i++) {
        const csv = bulkFiles[i];
        setBulkProgress(
          `Fichier ${i + 1}/${bulkFiles.length} : ${csv.name}…`,
        );

        const filiere = detectFiliereFromFilename(csv.name);
        if (!filiere) {
          failed += 1;
          results.push({
            file: csv.name,
            ok: false,
            error:
              "Code filière introuvable dans le nom (ex: … FBA.csv).",
          });
          setBulkResults([...results]);
          continue;
        }

        try {
          const result = await uploadOneFile(csv, filiere.code);
          if (!result.ok) {
            failed += 1;
            results.push({
              file: csv.name,
              ok: false,
              filiereCode: filiere.code,
              error: result.error,
            });
          } else {
            totalImported += result.imported || 0;
            results.push({
              file: csv.name,
              ok: true,
              filiereCode: filiere.code,
              imported: result.imported,
            });
          }
        } catch {
          failed += 1;
          results.push({
            file: csv.name,
            ok: false,
            filiereCode: filiere.code,
            error: "Erreur réseau sur ce fichier.",
          });
        }

        setBulkResults([...results]);
      }

      const okCount = results.filter((r) => r.ok).length;
      if (okCount === 0) {
        setBulkError("Aucun fichier n'a pu être importé.");
      } else if (failed > 0) {
        setBulkMessage(
          `${totalImported} étudiants importés (${okCount} OK, ${failed} échec(s)).`,
        );
      } else {
        setBulkMessage(
          `${totalImported} étudiants importés depuis ${okCount} fichier(s).`,
        );
        setBulkFiles([]);
      }
    } finally {
      setBulkProgress("");
      setBulkUploading(false);
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
        onSubmit={onBulkUpload}
        className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <h3 className="text-lg font-semibold">Import groupé</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Sélectionnez plusieurs CSV. Chaque fichier est importé un par un
          (plus fiable). Le code filière doit figurer dans le nom — ex.{" "}
          <code className="rounded bg-white px-1 py-0.5">
            liste-attente-selection FBA.csv
          </code>
          , <code className="rounded bg-white px-1 py-0.5">DWM.csv</code>.
        </p>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-sm font-medium">
            Fichiers CSV (plusieurs)
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(e) => setBulkFiles(Array.from(e.target.files || []))}
            className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
          />
        </label>

        {bulkFiles.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {bulkFiles.map((f) => {
              const detected = detectFiliereFromFilename(f.name);
              return (
                <li
                  key={f.name + f.size}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2"
                >
                  <span className="font-medium break-all">{f.name}</span>
                  <span
                    className={
                      detected
                        ? "rounded-md bg-emerald-50 px-2 py-0.5 text-[var(--ok)]"
                        : "rounded-md bg-red-50 px-2 py-0.5 text-[var(--danger)]"
                    }
                  >
                    {detected ? `→ feuille ${detected.code}` : "code manquant"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {bulkProgress ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {bulkProgress}
          </p>
        ) : null}

        {bulkError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
            {bulkError}
          </p>
        ) : null}
        {bulkMessage ? (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
            {bulkMessage}
          </p>
        ) : null}

        {bulkResults.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm">
            {bulkResults.map((r) => (
              <li
                key={r.file}
                className={`rounded-lg border px-3 py-2 ${
                  r.ok
                    ? "border-emerald-200 bg-emerald-50 text-[var(--ok)]"
                    : "border-red-200 bg-red-50 text-[var(--danger)]"
                }`}
              >
                <strong>{r.file}</strong>
                {r.ok
                  ? ` — ${r.filiereCode} — ${r.imported} lignes`
                  : ` — ${r.error}`}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="submit"
          disabled={bulkUploading}
          className="mt-5 rounded-xl bg-[var(--accent)] px-5 py-3 font-semibold text-white hover:brightness-95 disabled:opacity-60"
        >
          {bulkUploading
            ? "Import groupé en cours…"
            : "Importer tous les fichiers"}
        </button>
      </form>

      <form
        onSubmit={onUpload}
        className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <h3 className="text-lg font-semibold">Import individuel</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Un fichier + choix manuel de la filière.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
