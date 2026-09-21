export type Filiere = {
  code: string;
  name: string;
};

/** Codes courts + noms complets (tels qu'ils apparaissent dans les exports) */
export const FILIERES: Filiere[] = [
  { code: "DWM", name: "Développement Web Et Multimédia" },
  { code: "FBA", name: "Finance, Banque et Assurance" },
  { code: "GC", name: "Génie Civil" },
  {
    code: "GETE",
    name: "Génie Electrique et Technologie Emergentes",
  },
  { code: "GI", name: "Génie Informatique" },
  { code: "GTE", name: "Génie Thermique et Energétique" },
  {
    code: "IATE",
    name: "Intelligence Artificielle et technologies émergentes",
  },
  { code: "PMD", name: "Publicité et Marketing Digital" },
  {
    code: "TCC",
    name: "Techniques de Commercialisation et de Communication",
  },
  { code: "TM", name: "Techniques de Management" },
];

export function getFiliereByCode(code: string): Filiere | undefined {
  return FILIERES.find((f) => f.code.toUpperCase() === code.toUpperCase());
}

/** Strip accents / case for fuzzy filière name compare. */
export function normalizeFiliereText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a Confirmations "Filiere" cell (code or full name) to a known filière.
 * Uses whole-token code match (longest first) — never naive includes("GI")
 * which falsely matched "IntelliGIence…" as GI instead of IATE.
 */
export function resolveFiliereFromLabel(label: string): Filiere | undefined {
  const raw = String(label || "").trim();
  if (!raw || raw === "—") return undefined;

  const upper = raw.toUpperCase();
  const exactCode = FILIERES.find((f) => f.code === upper);
  if (exactCode) return exactCode;

  const byLen = [...FILIERES].sort((a, b) => b.code.length - a.code.length);
  for (const f of byLen) {
    const re = new RegExp(`(^|[^A-Z0-9])${f.code}([^A-Z0-9]|$)`, "i");
    if (re.test(raw)) return f;
  }

  const norm = normalizeFiliereText(raw);
  for (const f of FILIERES) {
    if (normalizeFiliereText(f.name) === norm) return f;
  }
  for (const f of FILIERES) {
    const nn = normalizeFiliereText(f.name);
    if (nn && (norm.includes(nn) || nn.includes(norm))) return f;
  }
  return undefined;
}

/**
 * Détecte le code filière dans le nom du fichier
 * (ex: "liste-attente-selection FBA.csv" → FBA).
 * Les codes longs sont testés en premier (GETE avant GTE, etc.).
 */
export function detectFiliereFromFilename(
  filename: string,
): Filiere | undefined {
  const base = filename.replace(/\.csv$/i, "").toUpperCase();
  const sorted = [...FILIERES].sort((a, b) => b.code.length - a.code.length);

  for (const f of sorted) {
    const re = new RegExp(`(^|[^A-Z0-9])${f.code}([^A-Z0-9]|$)`, "i");
    if (re.test(base)) return f;
  }

  return undefined;
}
