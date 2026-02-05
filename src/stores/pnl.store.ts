// src/stores/pnl.store.ts
import { defineStore } from "pinia";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";

const API = "http://localhost:3001";

async function jsonFetch(url: string, opts?: RequestInit) {
  const res = await fetch(API + url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });

  if (!res.ok) {
    let j: any = null;
    let txt = "";

    try {
      j = await res.clone().json();
    } catch {
      // ignore
    }

    if (!j) {
      try {
        txt = await res.text();
      } catch {
        txt = "";
      }
    }

    let msg =
      (typeof j?.error === "string" && j.error) ||
      (typeof txt === "string" && txt) ||
      `API error: ${res.status}`;

    // patches métier
    if (j?.error === "FORMULE_IN_USE") {
      const d = j?.details ?? {};
      msg = `Formule utilisée dans des variantes (${Number(d.usedInVariants ?? 0)}). Supprime d'abord les références.`;
    }
    if (j?.error === "MP_IN_USE") {
      const d = j?.details ?? {};
      msg = `MP utilisée (formules: ${Number(d.usedInFormules ?? 0)}, variantes: ${Number(d.usedInVariants ?? 0)}). Supprime d'abord les références.`;
    }

    throw new Error(msg);
  }

  return res.json().catch(() => null);
}

type AnyObj = Record<string, any>;

export const usePnlStore = defineStore("pnl", {
  state: () => ({
    pnls: [] as any[],
    activePnlId: null as string | null,
    activeVariantId: null as string | null,


    // catalogues
    mpCatalogue: [] as any[],
    formulesCatalogue: [] as any[],

    loading: false,
    error: null as string | null,
    headerUseMajorations: false,
    headerUseDevisSurcharge: false,
    // preview majorations (temporaire) : n’impacte que les KPIs du header
    headerMajorationsPreview: null as Record<string, number> | null,
  }),

  getters: {
    activePnl(state) {
      return state.pnls.find((p) => p.id === state.activePnlId) ?? null;
    },

    activeContract(state) {
      const pnl = state.pnls.find((p) => p.id === state.activePnlId);
      if (!pnl) return null;

      const vId = state.activeVariantId;
      if (!vId) return pnl.contracts?.[0] ?? null;

      return (
        (pnl.contracts ?? []).find((c: any) =>
          (c.variants ?? []).some((v: any) => v.id === vId)
        ) ?? pnl.contracts?.[0] ?? null
      );
    },

    activeVariant(state) {
      const pnl = state.pnls.find((p) => p.id === state.activePnlId);
      if (!pnl) return null;

      for (const c of pnl.contracts ?? []) {
        const v = (c.variants ?? []).find((x: any) => x.id === state.activeVariantId);
        if (v) return v;
      }
      return null;
    },

activeHeaderKPIs(): any {
  const variant = (this as any).activeVariant;
  if (!variant) return null;

  const dureeMois = (this as any).activeContract?.dureeMois ?? 0;

  const useMaj = Boolean((this as any).headerUseMajorations);
  const preview = (this as any).headerMajorationsPreview as Record<string, number> | null;

  // ✅ Si "Avec majoration" n'est PAS coché => calcul BASE garanti
  // - ignore les majorations persistées
  // - ignore le preview (même si "Appliquer" a été cliqué)
  const vForCalc = useMaj
    ? variant
    : {
        ...variant,
        autresCouts: {
          ...(variant.autresCouts ?? {}),
          majorations: null, // force "pas de majorations" dans computeHeaderKpis
        },
      };

  // ✅ Placeholder: surcharge devis (ne fait rien pour l'instant)
  if (Boolean((this as any).headerUseDevisSurcharge)) {
    // TODO: appliquer surcharge devis (bloc volontairement vide)
  }

  // ✅ Si useMaj = true, on passe le preview si ton computeHeaderKpis le supporte.
  // Si computeHeaderKpis ne supporte PAS le 3e paramètre, garde la ligne sans preview.
  if (useMaj && preview) {
    return computeHeaderKpis(vForCalc, dureeMois, preview);
  }

  return computeHeaderKpis(vForCalc, dureeMois);
},


  },

  actions: {
    // -------------------------
    // internal helper
    // -------------------------
    replaceActiveVariantInState(updatedVariant: AnyObj) {
      const pnl = this.pnls.find((p) => p.id === this.activePnlId);
      if (!pnl) return;

      for (const c of pnl.contracts ?? []) {
        const idx = (c.variants ?? []).findIndex((x: any) => x.id === updatedVariant.id);
        if (idx >= 0) {
          c.variants[idx] = updatedVariant;
          return;
        }
      }
    },

    setHeaderMajorationsPreview(map: Record<string, number> | null) {
  this.headerMajorationsPreview = map;
},
clearHeaderMajorationsPreview() {
  this.headerMajorationsPreview = null;
},
setHeaderUseMajorations(v: boolean) {
  (this as any).headerUseMajorations = Boolean(v);
},
setHeaderUseDevisSurcharge(v: boolean) {
  (this as any).headerUseDevisSurcharge = Boolean(v);
},

async saveMajorations(variantId: string, majorations: Record<string, number>) {
  const updated = await jsonFetch(`/variants/${variantId}/majorations`, {
    method: "PUT",
    body: JSON.stringify({ majorations }),
  });

  if (updated?.id) this.replaceActiveVariantInState(updated);

  // après enregistrement, on coupe le preview : le header doit lire la valeur persistée
  this.headerMajorationsPreview = null;

  return updated;
},


    // -------------------------
    // LOAD HIERARCHY
    // -------------------------
    async loadPnls() {
      this.loading = true;
      this.error = null;

      try {
        const data = await jsonFetch("/pnls");
        this.pnls = data ?? [];

        // init active
        if (!this.activePnlId && this.pnls[0]) this.activePnlId = this.pnls[0].id;
        if (!this.activeVariantId && this.pnls[0]) {
          this.activeVariantId = this.pnls[0]?.contracts?.[0]?.variants?.[0]?.id ?? null;
        }

        // if invalid active -> reset
        if (this.activePnlId && !this.pnls.find((p) => p.id === this.activePnlId)) {
          this.activePnlId = this.pnls[0]?.id ?? null;
          this.activeVariantId = this.pnls[0]?.contracts?.[0]?.variants?.[0]?.id ?? null;
        }
      } catch (e: any) {
        this.error = e?.message ?? String(e);
      } finally {
        this.loading = false;
      }
    },

    setActivePnl(pnlId: string) {
      this.activePnlId = pnlId;
      const pnl = this.pnls.find((p) => p.id === pnlId);
      this.activeVariantId = pnl?.contracts?.[0]?.variants?.[0]?.id ?? null;
    },

    setActiveVariant(variantId: string) {
      this.activeVariantId = variantId;
    },

    // -------------------------
    // CATALOGUES
    // -------------------------
    async loadMpCatalogue() {
      const data = await jsonFetch("/mp-catalogue");
      this.mpCatalogue = data ?? [];
    },

    async loadFormulesCatalogue() {
      const data = await jsonFetch("/formules-catalogue");
      this.formulesCatalogue = data ?? [];
    },

    async ensureCataloguesLoaded() {
      if (!this.mpCatalogue?.length) await this.loadMpCatalogue();
      if (!this.formulesCatalogue?.length) await this.loadFormulesCatalogue();
    },

    // -------------------------
    // MP CATALOGUE CRUD
    // -------------------------
    async createMpCatalogue(payload: {
      categorie: string;
      label: string;
      unite: string;
      prix: number;
      fournisseur: string;
      city: string;
      region: string;
      comment?: string | null;
    }) {
      await jsonFetch("/mp-catalogue", { method: "POST", body: JSON.stringify(payload) });
      await this.loadMpCatalogue();
    },

    async updateMpCatalogue(
      id: string,
      payload: Partial<{
        categorie: string;
        label: string;
        unite: string;
        prix: number;
        fournisseur: string;
        city: string;
        region: string;
        comment?: string | null;
      }>
    ) {
      await jsonFetch(`/mp-catalogue/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadMpCatalogue();
    },

    async deleteMpCatalogue(id: string) {
      await jsonFetch(`/mp-catalogue/${id}`, { method: "DELETE" });
      await this.loadMpCatalogue();
    },

    // -------------------------
    // FORMULES CATALOGUE CRUD
    // -------------------------
    async createFormuleCatalogue(payload: {
      label: string;
      resistance: string;
      city: string;
      region: string;
      comment?: string | null;
    }) {
      await jsonFetch("/formules-catalogue", { method: "POST", body: JSON.stringify(payload) });
      await this.loadFormulesCatalogue();
    },

    async updateFormuleCatalogue(
      id: string,
      payload: Partial<{
        label: string;
        resistance: string;
        city: string;
        region: string;
        comment?: string | null;
      }>
    ) {
      await jsonFetch(`/formules-catalogue/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadFormulesCatalogue();
    },

    async deleteFormuleCatalogue(id: string) {
      await jsonFetch(`/formules-catalogue/${id}`, { method: "DELETE" });
      await this.loadFormulesCatalogue();
    },

    async updateFormuleCatalogueItems(formuleId: string, items: Array<{ mpId: string; qty: number }>) {
      await jsonFetch(`/formules-catalogue/${formuleId}/items`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      await this.loadFormulesCatalogue();
    },

    // -------------------------
    // VARIANT MP
    // -------------------------
    async addMpToActiveVariant(mpId: string) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/mps`, {
        method: "POST",
        body: JSON.stringify({ mpId }),
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    // prix: number | null (null => restore catalogue côté backend)
    async updateVariantMp(variantMpId: string, payload: { prix?: number | null; comment?: string }) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/mps/${variantMpId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    async removeVariantMp(variantMpId: string) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/mps/${variantMpId}`, {
        method: "DELETE",
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    // -------------------------
    // VARIANT FORMULE
    // -------------------------
    async addFormuleToActiveVariant(formuleId: string) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/formules`, {
        method: "POST",
        body: JSON.stringify({ formuleId }),
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    async updateVariantFormule(
      variantFormuleId: string,
      payload: { volumeM3?: number; momd?: number; cmpOverride?: number | null }
    ) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/formules/${variantFormuleId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    async removeVariantFormule(variantFormuleId: string) {
      const variant = (this as any).activeVariant;
      if (!variant) throw new Error("No active variant");

      const res = await jsonFetch(`/variants/${variant.id}/formules/${variantFormuleId}`, {
        method: "DELETE",
      });

      if (res?.variant) this.replaceActiveVariantInState(res.variant);
      return res;
    },

    // -------------------------
    // UPDATE VARIANT (full sections)
    // -------------------------
    async updateVariant(id: string, payload: any) {
      await jsonFetch(`/variants/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls(); // simple et sûr
    },

    // -------------------------
    // ✅ META EDIT (popups MesPnlPage)
    // -------------------------
    async updatePnl(pnlId: string, payload: { title?: string; client?: string | null; city?: string; region?: string; status?: string }) {
      await jsonFetch(`/pnls/${pnlId}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async updateContract(contractId: string, payload: { ref?: string; dureeMois?: number | null; terrain?: string | null; installation?: string | null; status?: string }) {
      await jsonFetch(`/contracts/${contractId}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async updateVariantMeta(variantId: string, payload: { title?: string; status?: string; description?: string | null }) {
      await jsonFetch(`/variants/${variantId}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },
  },
});
