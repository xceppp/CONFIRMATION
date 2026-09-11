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
