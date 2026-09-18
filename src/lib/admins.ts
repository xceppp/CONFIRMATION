/**
 * Comptes administrateurs (nom + mot de passe).
 * APP_PASSWORD reste valide comme admin « Admin ».
 */
export type AdminAccount = {
  name: string;
  password: string;
};

export const ADMIN_ACCOUNTS: AdminAccount[] = [
  { name: "amine", password: "localdev" },
  { name: "saida", password: "saida" },
];

/** Mot de passe obligatoire pour vider le journal Confirmations */
export const CLEAR_JOURNAL_PASSWORD = "1955";

function normName(name: string) {
  return name.trim().toLowerCase();
}

export function findAdminAccount(
  name: string,
  password: string,
): AdminAccount | null {
  const n = normName(name);
  if (!n || !password) return null;
  return (
    ADMIN_ACCOUNTS.find(
      (a) => normName(a.name) === n && a.password === password,
    ) || null
  );
}
