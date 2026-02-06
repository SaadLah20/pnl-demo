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
      msg = `Formule utilisée dans des variantes (${Number(
        d.usedInVariants ?? 0
      )}). Supprime d'abord les références.`;
    }
    if (j?.error === "MP_IN_USE") {
      const d = j?.details ?? {};
      msg = `MP utilisée (formules: ${Number(d.usedInFormules ?? 0)}, variantes: ${Number(
        d.usedInVariants ?? 0
      )}).`;
    }

    throw new Error(msg);
  }

  // tolerate empty 204
  if (res.status === 204) return null;

  return res.json();
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
    // preview devis surcharges (temporaire) : n’impacte que les KPIs du header
    headerDevisSurchargesPreview: null as Record<string, number> | null,
  }),

  getters: {
    activePnl(): any | null {
      return this.pnls.find((p) => p.id === this.activePnlId) ?? null;
    },
    activeContract(): any | null {
      const pnl = this.activePnl;
      if (!pnl) return null;

      for (const c of pnl.contracts ?? []) {
        if ((c.variants ?? []).some((v: any) => v.id === this.activeVariantId)) return c;
      }
      return null;
    },
    activeVariant(): any | null {
      const pnl = this.activePnl;
      if (!pnl) return null;

      for (const c of pnl.contracts ?? []) {
        const v = (c.variants ?? []).find((x: any) => x.id === this.activeVariantId);
        if (v) return v;
      }
      return null;
    },

activeHeaderKPIs(): any {
  const variant = (this as any).activeVariant;
  if (!variant) return null;

  const dureeMois = (this as any).activeContract?.dureeMois ?? 0;

  const useMaj = Boolean((this as any).headerUseMajorations);
  const majPreview = (this as any).headerMajorationsPreview as Record<string, number> | null;

  // ✅ Si "Avec majoration" est OFF → calcul BASE garanti
  const vForCalc = useMaj
    ? variant
    : {
        ...variant,
        autresCouts: {
          ...(variant.autresCouts ?? {}),
          majorations: null,
        },
      };

  // ✅ Signature correcte (2 ou 3 args max)
  return computeHeaderKpis(
    vForCalc,
    dureeMois,
    useMaj ? majPreview : null
  );
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
        const idx = (c.variants ?? []).findIndex((x: any) => x.id === this.activeVariantId);
        if (idx >= 0) {
          c.variants[idx] = updatedVariant;
          this.activeVariantId = updatedVariant.id;
          return;
        }
      }
    },

    // -------------------------
    // Load hierarchy
    // -------------------------
    async loadPnls() {
      this.loading = true;
      this.error = null;

      try {
        const data = await jsonFetch("/pnls");
        this.pnls = data ?? [];

        // keep selection valid
        if (this.activePnlId && !this.pnls.some((p) => p.id === this.activePnlId)) {
          this.activePnlId = this.pnls[0]?.id ?? null;
        }
      } catch (e: any) {
        this.error = e?.message ?? String(e);
      } finally {
        this.loading = false;
      }
    },

    // -------------------------
    // Catalogues
    // -------------------------
    async loadMpCatalogue() {
      const data = await jsonFetch("/mp-catalogue");
      this.mpCatalogue = data ?? [];
    },
    async loadFormulesCatalogue() {
      const data = await jsonFetch("/formules-catalogue");
      this.formulesCatalogue = data ?? [];
    },

    // -------------------------
    // Header toggles / preview
    // -------------------------
    setHeaderMajorationsPreview(map: Record<string, number> | null) {
      this.headerMajorationsPreview = map;
    },
    setHeaderDevisSurchargesPreview(v: Record<string, number> | null) {
      this.headerDevisSurchargesPreview = v;
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

    // -------------------------
    // Majorations
    // -------------------------
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
    // Devis
    // -------------------------
    async saveDevis(variantId: string, devis: any) {
      const updated = await jsonFetch(`/variants/${variantId}/devis`, {
        method: "PUT",
        body: JSON.stringify(devis),
      });

      if (updated?.id) this.replaceActiveVariantInState(updated);

      // après save: preview OFF (le header relit la valeur persistée)
      this.headerDevisSurchargesPreview = null;

      return updated;
    },

    // -------------------------
    // ✅ Variant (UPDATE sections)
    // -------------------------
    // Fix: tes pages sections appellent store.updateVariant(...)
    // Sans cette action => "store.updateVariant is not a function"
async updateVariant(variantId: string, patch: Record<string, any>) {
  const p = patch ?? {};

  // 1) ✅ Optimistic UI: merge local immédiat pour que pages + header s’actualisent sans attendre l’API
  const current = (this as any).activeVariant;
  if (current?.id === variantId) {
    const optimistic = {
      ...current,
      ...p,
      // merge shallow des sous-objets sections si présents
      transport: p.transport ? { ...(current.transport ?? {}), ...(p.transport ?? {}) } : current.transport,
      autresCouts: p.autresCouts ? { ...(current.autresCouts ?? {}), ...(p.autresCouts ?? {}) } : current.autresCouts,
      coutM3: p.coutM3 ? { ...(current.coutM3 ?? {}), ...(p.coutM3 ?? {}) } : current.coutM3,
      coutMensuel: p.coutMensuel ? { ...(current.coutMensuel ?? {}), ...(p.coutMensuel ?? {}) } : current.coutMensuel,
      maintenance: p.maintenance ? { ...(current.maintenance ?? {}), ...(p.maintenance ?? {}) } : current.maintenance,
      coutEmployes: p.coutEmployes ? { ...(current.coutEmployes ?? {}), ...(p.coutEmployes ?? {}) } : current.coutEmployes,
      coutsOccasionnels: p.coutsOccasionnels
        ? { ...(current.coutsOccasionnels ?? {}), ...(p.coutsOccasionnels ?? {}) }
        : current.coutsOccasionnels,
      details: p.details ? { ...(current.details ?? {}), ...(p.details ?? {}) } : current.details,
      cab: p.cab ? { ...(current.cab ?? {}), ...(p.cab ?? {}) } : current.cab,
    };

    this.replaceActiveVariantInState(optimistic);
  }

  // 2) ✅ Call API
  const resp = await jsonFetch(`/variants/${variantId}`, {
    method: "PUT",
    body: JSON.stringify(p),
  });

  // 3) ✅ Normalise: parfois backend renvoie { variant }, parfois renvoie la variante directement
  const updated = (resp as any)?.variant ?? resp;

  // 4) ✅ Replace final server version
  if (updated?.id) this.replaceActiveVariantInState(updated);

  return updated;
},


    // -------------------------
    // ✅ Variant MP (override MP) - optionnel mais utile
    // -------------------------
    async updateVariantMp(variantMpId: string, payload: AnyObj) {
      const id = encodeURIComponent(String(variantMpId ?? ""));
      const body = JSON.stringify(payload ?? {});

      const candidates = [`/variant-mp/${id}`, `/variants-mp/${id}`, `/variants/mp/${id}`];

      let lastErr: any = null;
      for (const path of candidates) {
        try {
          const resp = await jsonFetch(path, { method: "PUT", body });
          const updatedVariant = (resp as any)?.variant ?? resp;
          if (updatedVariant?.id) this.replaceActiveVariantInState(updatedVariant);
          return resp;
        } catch (e: any) {
          lastErr = e;
        }
      }

      throw lastErr ?? new Error("Impossible de mettre à jour la MP de variante.");
    },

    // -------------------------
    // Variant / Formules
    // -------------------------
    async addFormuleToVariant(variantId: string, formuleId: string) {
      const resp = await jsonFetch(`/variants/${variantId}/formules`, {
        method: "POST",
        body: JSON.stringify({ formuleId }),
      });

      if (resp?.variant?.id) this.replaceActiveVariantInState(resp.variant);
      return resp;
    },

    async updateVariantFormule(variantId: string, variantFormuleId: string, payload: AnyObj) {
      const resp = await jsonFetch(`/variants/${variantId}/formules/${variantFormuleId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (resp?.variant?.id) this.replaceActiveVariantInState(resp.variant);
      return resp;
    },

    async deleteVariantFormule(variantId: string, variantFormuleId: string) {
      const resp = await jsonFetch(`/variants/${variantId}/formules/${variantFormuleId}`, {
        method: "DELETE",
      });

      if (resp?.variant?.id) this.replaceActiveVariantInState(resp.variant);
      return resp;
    },
  },
});
