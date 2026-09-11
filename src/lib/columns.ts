/** Colonnes du fichier CSV d'export (séparateur ;) */
export const STUDENT_COLUMNS = [
  "Code",
  "NomFr",
  "NomAr",
  "PrenomFr",
  "PrenomAr",
  "Cin",
  "Genre",
  "DateNaissance",
  "LieuNaissance",
  "serieBac",
  "Annee",
  "region",
  "province",
  "commune",
  "Telephone",
  "Email",
  "TypeBac",
  "Score",
  "MoyenneNationale",
  "MoyenneRegionale",
] as const;

export type StudentColumn = (typeof STUDENT_COLUMNS)[number];

/** En-têtes de la feuille Etudiants */
export const ETUDIANTS_HEADERS = [
  "FiliereCode",
  "Filiere",
  ...STUDENT_COLUMNS,
] as const;

/** En-têtes de la feuille Confirmations = ligne complète + date */
export const CONFIRMATIONS_HEADERS = [
  ...ETUDIANTS_HEADERS,
  "DateConfirmation",
] as const;

export type StudentRow = Record<string, string>;
