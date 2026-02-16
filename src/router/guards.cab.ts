// src/router/guards.cab.ts
import type { Router } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}
function isCabFixeModel(model: any) {
  return norm(model).includes("cab fixe");
}
function isCabFixeExistante(model: any) {
  return norm(model).includes("cab fixe - existante");
}

export function installCabGuards(router: Router) {
  router.beforeEach((to) => {
    const store: any = usePnlStore();
    const model = store?.activePnl?.model ?? "";
    const hasActiveVariant = !!String(store?.activeVariantId ?? "").trim();

    const cabFixe = isCabFixeModel(model);
    const cabFixeExist = isCabFixeExistante(model);

    // Pages à verrouiller
    const rn = String(to.name ?? "");

    // Devis interdit pour CAB FIXE (donc aussi multi-variantes)
    const devisAllowed = hasActiveVariant && !cabFixe;

    // CAB + Couts occasionnels verrouillés uniquement pour CAB fixe - existante
    const cabSectionAllowed = hasActiveVariant && !cabFixeExist;
    const coutsOccAllowed = hasActiveVariant && !cabFixeExist;

    // Si pas de variante active, on force sur Détails
    if (!hasActiveVariant) {
      const forbiddenWithoutVariant = new Set([
        "CAB",
        "CoutsOccasionnels",
        "Devis",
        "Majorations",
        "MultiVarianteDevis",
      ]);
      if (forbiddenWithoutVariant.has(rn)) return { name: "Details" };
      return true;
    }

    // Devis + majorations + multi-variantes
    if ((rn === "Devis" || rn === "Majorations" || rn === "MultiVarianteDevis") && !devisAllowed) {
      return { name: "Details" };
    }

    // CAB
    if (rn === "CAB" && !cabSectionAllowed) {
      return { name: "Details" };
    }

    // Couts occasionnels
    if (rn === "CoutsOccasionnels" && !coutsOccAllowed) {
      return { name: "Details" };
    }

    return true;
  });
}
