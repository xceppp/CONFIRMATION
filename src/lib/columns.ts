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

/** Feuille Confirmations — slim + qui / quand */
export const CONFIRMATIONS_HEADERS = [
  "CNE",
  "NomComplet",
  "Filiere",
  "Score",
  "Agent",
  "DateConfirmation",
] as const;

export type StudentRow = Record<string, string>;

/** Feuille Agents — comptes créés par l'admin */
export const AGENTS_HEADERS = ["Nom", "MotDePasse"] as const;

export type AgentRow = {
  Nom: string;
  MotDePasse: string;
};
