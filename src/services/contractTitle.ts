// src/services/contracts/contractTitle.ts

type AnyContract = Record<string, any>;

function norm(v: any): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // enlève accents
}

function isClientCharge(v: any): boolean {
  const s = norm(v);
  if (!s) return false;

  // valeurs possibles dans ton app: "CLIENT" / "LHM" / autres
  // on considère "client" si ça contient client/clt ou commence par c (fallback soft)
  if (s.includes("client") || s.includes("clt")) return true;

  // évite d'interpréter "lhm" comme client
  if (s === "lhm") return false;

  // optionnel: si tu utilises "C" ou "CLIENTE" etc.
  if (s === "c") return true;

  return false;
}

const CHARGE_FIELDS: Array<{ key: string; abbr: string }> = [
  { key: "cab", abbr: "CAB" },
  { key: "installation", abbr: "INST" },
  { key: "genieCivil", abbr: "GC" },
  { key: "transport", abbr: "TR" },
  { key: "terrain", abbr: "TER" },
  { key: "matierePremiere", abbr: "MP" },
  { key: "maintenance", abbr: "MAINT" },
  { key: "chargeuse", abbr: "CHG" },

  // Eau / Elec (si tu les utilises dans l’UI, même si Prisma les a en optionnel)
  { key: "branchementEau", abbr: "B.EAU" },
  { key: "consoEau", abbr: "C.EAU" },
  { key: "branchementElec", abbr: "B.ELEC" },
  { key: "consoElec", abbr: "C.ELEC" },
];

export function contractUiTitle(contract: AnyContract | null | undefined): string {
  if (!contract) return "—";

  const parts = CHARGE_FIELDS
    .filter(({ key }) => isClientCharge((contract as any)[key]))
    .map(({ abbr }) => abbr);

  // si aucune charge client
  if (parts.length === 0) return "Client: —";

  return `Client: ${parts.join(" / ")}`;
}
