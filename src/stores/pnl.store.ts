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
      msg = `MP utilisée (formules: ${Number(d.usedInFormules ?? 0)}, variantes: ${Number(d.usedInVariants ?? 0)}).`;
    }

    throw new Error(msg);
  }

  // tolerate empty 204
  if (res.status === 204) return null;

  return res.json();
}

async function blobFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(API + url, { ...opts });
  if (!res.ok) {
    let txt = "";
    try {
      txt = await res.text();
    } catch {}
    throw new Error(txt || `API error: ${res.status}`);
  }
  return res;
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

      const useDevis = Boolean((this as any).headerUseDevisSurcharge);
      const devisPreview = (this as any).headerDevisSurchargesPreview as Record<string, number> | null;

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

      // ✅ surcharge devis (persistée + preview) uniquement si toggle ON
      return computeHeaderKpis(
        vForCalc,
        Number(dureeMois ?? 0),
        useMaj ? majPreview : null,
        useDevis ? devisPreview : null,
        useDevis
      );
    },
  },

  actions: {
    /* =========================
       ACTIVE SELECTION (UI)
    ========================= */
    setActivePnl(id: string | null) {
      this.activePnlId = id ? String(id) : null;

      // Si on change de P&L, on garde la variante seulement si elle appartient encore à ce P&L
      if (this.activeVariantId && this.activePnlId) {
        const pnl = this.pnls.find((p: any) => String(p?.id ?? "") === String(this.activePnlId));
        const stillThere =
          !!pnl &&
          (pnl.contracts ?? []).some((c: any) =>
            (c.variants ?? []).some((v: any) => String(v?.id ?? "") === String(this.activeVariantId))
          );
        if (!stillThere) this.activeVariantId = null;
      }
    },

    setActiveVariant(id: string | null) {
      this.activeVariantId = id ? String(id) : null;

      // Si une variante est sélectionnée, on force le bon P&L actif (robuste)
      if (this.activeVariantId) {
        for (const p of this.pnls ?? []) {
          for (const c of (p as any)?.contracts ?? []) {
            const hit = (c?.variants ?? []).some((v: any) => String(v?.id ?? "") === String(this.activeVariantId));
            if (hit) {
              this.activePnlId = String((p as any)?.id ?? null);
              return;
            }
          }
        }
      }
    },

    setActiveContract(_id: string | null) {
      /* no-op */
    },

    // =========================================================
    // internal helper (robuste + merge sections)
    // =========================================================
    replaceActiveVariantInState(next: AnyObj) {
      if (!next?.id) return;

      // ✅ 1) essaie d'abord dans le pnl actif
      const pools: any[] = [];
      const active = this.pnls.find((p) => p.id === this.activePnlId);
      if (active) pools.push(active);

      // ✅ 2) fallback: chercher partout (si activePnlId pas synchro)
      for (const p of this.pnls) {
        if (p?.id !== active?.id) pools.push(p);
      }

      for (const pnl of pools) {
        for (const c of pnl.contracts ?? []) {
          const i = (c.variants ?? []).findIndex((v: any) => v.id === next.id);
          if (i < 0) continue;

          const prev = c.variants[i] ?? {};

          // ✅ merge shallow (empêche "formules only" d'écraser le reste)
          const merged: AnyObj = { ...prev, ...next };

          // ✅ merge shallow des sections (évite perte de sous-champs)
          // NOTE: on garde aussi tes anciens alias pour compatibilité.
          const sectionKeys = [
            // ✅ noms "backend"
            "cab",
            "transport",
            "mp",
            "formules",
            "maintenance",
            "coutM3",
            "coutMensuel",
            "coutOccasionnel", // ✅ IMPORTANT (singulier)
            "employes",
            "autresCouts",
            "majorations",
            "devis",
            "details",

            // ⚠️ anciens alias observés dans ton front (compat)
            "momd",
            "coutEmployes",
            "coutsOccasionnels",
          ];

          for (const k of sectionKeys) {
            const p = (prev as any)?.[k];
            const n = (next as any)?.[k];
            if (p && n && typeof p === "object" && typeof n === "object" && !Array.isArray(p) && !Array.isArray(n)) {
              merged[k] = { ...p, ...n };
            }
          }

          // ✅ petite compat: si backend renvoie coutOccasionnel, mais une page lit coutsOccasionnels
          if ((merged as any).coutOccasionnel && !(merged as any).coutsOccasionnels) {
            (merged as any).coutsOccasionnels = (merged as any).coutOccasionnel;
          }
          // ✅ compat inverse (si une page patch coutsOccasionnels)
          if ((merged as any).coutsOccasionnels && !(merged as any).coutOccasionnel) {
            (merged as any).coutOccasionnel = (merged as any).coutsOccasionnels;
          }

          // idem employes/coutEmployes si tu as encore des pages qui utilisent coutEmployes
          if ((merged as any).employes && !(merged as any).coutEmployes) {
            (merged as any).coutEmployes = (merged as any).employes;
          }
          if ((merged as any).coutEmployes && !(merged as any).employes) {
            (merged as any).employes = (merged as any).coutEmployes;
          }

          c.variants[i] = merged;

          // ✅ garde activeVariantId cohérent
          this.activeVariantId = merged.id;

          // ✅ si on a trouvé dans un autre pnl, on synchronise aussi activePnlId
          this.activePnlId = String((pnl as any)?.id ?? this.activePnlId);

          return;
        }
      }
    },

    // =========================================================
    // Load hierarchy
    // =========================================================
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

        // si variant active mais pnl pas set, on resync
        if (this.activeVariantId && !this.activePnlId) {
          this.setActiveVariant(this.activeVariantId);
        }
      } catch (e: any) {
        this.error = e?.message ?? String(e);
      } finally {
        this.loading = false;
      }
    },

    // =========================================================
    // Catalogues
    // =========================================================
    async loadMpCatalogue() {
      const data = await jsonFetch("/mp-catalogue");
      this.mpCatalogue = data ?? [];
    },

    async updateMpCatalogue(mpId: string, patch: Record<string, any>) {
      const id = encodeURIComponent(String(mpId ?? ""));
      const updated = await jsonFetch(`/mp-catalogue/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch ?? {}),
      });

      // 1) met à jour le catalogue en mémoire
      const i = (this.mpCatalogue ?? []).findIndex((m: any) => m.id === updated?.id);
      if (i >= 0) this.mpCatalogue[i] = { ...this.mpCatalogue[i], ...updated };
      else if (updated?.id) this.mpCatalogue.unshift(updated);

      // 2) patch aussi les MP déjà embarquées dans les variantes
      if (updated?.id) {
        for (const p of this.pnls ?? []) {
          for (const c of p.contracts ?? []) {
            for (const v of c.variants ?? []) {
              const items = v?.mp?.items ?? [];
              for (const it of items) {
                if (it?.mpId === updated.id && it?.mp) {
                  it.mp = { ...it.mp, ...updated };
                }
              }
            }
          }
        }
      }

      return updated;
    },

    async createMpCatalogue(payload: Record<string, any>) {
      const created = await jsonFetch("/mp-catalogue", {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      });

      if (created?.id) {
        const i = (this.mpCatalogue ?? []).findIndex((m: any) => m.id === created.id);
        if (i >= 0) this.mpCatalogue[i] = { ...this.mpCatalogue[i], ...created };
        else this.mpCatalogue.unshift(created);
      }

      return created;
    },

    async deleteMpCatalogue(mpId: string) {
      const id = encodeURIComponent(String(mpId ?? ""));
      const resp = await jsonFetch(`/mp-catalogue/${id}`, { method: "DELETE" });

      this.mpCatalogue = (this.mpCatalogue ?? []).filter((m: any) => m.id !== mpId);
      return resp;
    },

    async loadFormulesCatalogue() {
      const data = await jsonFetch("/formules-catalogue");
      this.formulesCatalogue = data ?? [];
    },

    async updateFormuleCatalogue(formuleId: string, patch: Record<string, any>) {
      const id = encodeURIComponent(String(formuleId ?? ""));
      const updated = await jsonFetch(`/formules-catalogue/${id}`, {
        method: "PUT",
        body: JSON.stringify(patch ?? {}),
      });

      const i = (this.formulesCatalogue ?? []).findIndex((f: any) => f.id === updated?.id);
      if (i >= 0) this.formulesCatalogue[i] = { ...this.formulesCatalogue[i], ...updated };
      else if (updated?.id) this.formulesCatalogue.unshift(updated);

      return updated;
    },

    async updateFormuleCatalogueItems(formuleId: string, items: Array<{ mpId: string; qty: number }>) {
      const id = encodeURIComponent(String(formuleId ?? ""));

      const resp = await jsonFetch(`/formules-catalogue/${id}/items`, {
        method: "PUT",
        body: JSON.stringify({ items: items ?? [] }),
      });

      const updated = (resp as any)?.updated ?? null;

      if (updated?.id) {
        const i = (this.formulesCatalogue ?? []).findIndex((f: any) => f.id === updated.id);
        if (i >= 0) this.formulesCatalogue[i] = { ...this.formulesCatalogue[i], ...updated };
        else this.formulesCatalogue.unshift(updated);
      }

      return resp;
    },

    async createFormuleCatalogue(payload: Record<string, any>) {
      const created = await jsonFetch(`/formules-catalogue`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      });

      if (created?.id) {
        const i = (this.formulesCatalogue ?? []).findIndex((f: any) => f.id === created.id);
        if (i >= 0) this.formulesCatalogue[i] = { ...this.formulesCatalogue[i], ...created };
        else this.formulesCatalogue.unshift(created);
      }

      return created;
    },

    async deleteFormuleCatalogue(formuleId: string) {
      const id = encodeURIComponent(String(formuleId ?? ""));

      try {
        const resp = await jsonFetch(`/formules-catalogue/${id}`, { method: "DELETE" });
        this.formulesCatalogue = (this.formulesCatalogue ?? []).filter((f: any) => f.id !== formuleId);
        return resp;
      } catch (e: any) {
        const msg =
          e?.error === "FORMULE_IN_USE"
            ? "Impossible : cette formule est utilisée dans au moins une variante."
            : e?.message ?? String(e);
        throw new Error(msg);
      }
    },

    // =========================================================
    // Header toggles / preview
    // =========================================================
    setHeaderMajorationsPreview(map: Record<string, number> | null) {
      this.headerMajorationsPreview = map;
    },
    setHeaderDevisSurchargesPreview(v: Record<string, number> | null) {
      this.headerDevisSurchargesPreview = v;
    },

    clearHeaderMajorationsPreview() {
      this.headerMajorationsPreview = null;
    },
    clearHeaderDevisSurchargesPreview() {
      this.headerDevisSurchargesPreview = null;
    },

    setHeaderUseMajorations(v: boolean) {
      (this as any).headerUseMajorations = Boolean(v);
    },
    setHeaderUseDevisSurcharge(v: boolean) {
      (this as any).headerUseDevisSurcharge = Boolean(v);
    },

    // =========================================================
    // Majorations
    // =========================================================
    async saveMajorations(variantId: string, majorations: Record<string, number>) {
      const resp = await jsonFetch(`/variants/${variantId}/majorations`, {
        method: "PUT",
        body: JSON.stringify({ majorations }),
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);

      this.headerMajorationsPreview = null;
      return updated;
    },

    // =========================================================
    // ✅ Appliquer réellement les majorations (persistées) sur la variante
    // =========================================================
    async applyMajorationsReal(variantId?: string, addMomdM3?: number) {
      const vid = String(variantId ?? this.activeVariant?.id ?? "").trim();
      if (!vid) throw new Error("Aucune variante active (variantId manquant)");

      const resp = await jsonFetch(`/variants/${vid}/majorations/apply`, {
        method: "POST",
        body: JSON.stringify({ addMomdM3: Number(addMomdM3 ?? 0) }),
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);

      this.headerMajorationsPreview = null;
      return updated;
    },

    // =========================================================
    // Devis
    // =========================================================
    async saveDevis(variantId: string, devis: any) {
      const resp = await jsonFetch(`/variants/${variantId}/devis`, {
        method: "PUT",
        body: JSON.stringify(devis ?? {}),
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);

      this.headerDevisSurchargesPreview = null;
      return updated;
    },

    // =========================================================
    // ✅ Export Devis Word (DOCX)
    // =========================================================
    async exportDevisWord(variantId?: string) {
      const vid = String(variantId ?? this.activeVariant?.id ?? "");
      if (!vid) throw new Error("Aucune variante active (variantId manquant)");

      const useMajorations = !!this.headerUseMajorations;
      const useDevisSurcharges = !!this.headerUseDevisSurcharge;

      const qs = new URLSearchParams({
        useMajorations: useMajorations ? "1" : "0",
        useDevisSurcharges: useDevisSurcharges ? "1" : "0",
      });

      const url = `${API}/variants/${vid}/devis/word?${qs.toString()}`;

      const res = await fetch(url);
      if (!res.ok) {
        let msg = `Export devis Word échoué: ${res.status}`;
        try {
          const j = await res.clone().json();
          if (typeof j?.error === "string") msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      // ✅ download browser
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Devis-${vid}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    },

    // =========================================================
    // ✅ Export Devis MULTI (DOCX)
    // =========================================================
    async exportDevisMultiWord(payload: {
      variantIds: string[];
      options?: { useMajorations?: boolean; useDevisSurcharges?: boolean };
      meta?: any;
    }) {
      const variantIds = (payload?.variantIds ?? []).map((x) => String(x)).filter(Boolean);
      if (!variantIds.length) throw new Error("Aucune variante sélectionnée.");

      const useMajorations = payload?.options?.useMajorations !== undefined ? !!payload.options.useMajorations : true;
      const useDevisSurcharges =
        payload?.options?.useDevisSurcharges !== undefined ? !!payload.options.useDevisSurcharges : true;

      const res = await fetch(`${API}/devis/multi/word`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantIds,
          useMajorations,
          useDevisSurcharges,
          meta: payload?.meta ?? null,
        }),
      });

      if (!res.ok) {
        let msg = `Export devis multi Word échoué: ${res.status}`;
        try {
          const j = await res.clone().json();
          if (typeof j?.error === "string") msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `Devis-Multi-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    },

    // =========================================================
    // Variant update (optimistic + normalisation réponse)
    // =========================================================
    async updateVariant(variantId: string, patch: Record<string, any>) {
      const p = patch ?? {};

      // 1) optimistic UI
      const current = (this as any).activeVariant;
      if (current?.id === variantId) {
        const optimistic = {
          ...current,
          ...p,

          cab: p.cab ? { ...(current.cab ?? {}), ...(p.cab ?? {}) } : current.cab,
          transport: p.transport ? { ...(current.transport ?? {}), ...(p.transport ?? {}) } : current.transport,
          coutM3: p.coutM3 ? { ...(current.coutM3 ?? {}), ...(p.coutM3 ?? {}) } : current.coutM3,
          coutMensuel: p.coutMensuel ? { ...(current.coutMensuel ?? {}), ...(p.coutMensuel ?? {}) } : current.coutMensuel,
          maintenance: p.maintenance ? { ...(current.maintenance ?? {}), ...(p.maintenance ?? {}) } : current.maintenance,
          autresCouts: p.autresCouts ? { ...(current.autresCouts ?? {}), ...(p.autresCouts ?? {}) } : current.autresCouts,
          devis: p.devis ? { ...(current.devis ?? {}), ...(p.devis ?? {}) } : current.devis,
          details: p.details ? { ...(current.details ?? {}), ...(p.details ?? {}) } : current.details,

          // ✅ vrais noms backend
          employes: p.employes ? { ...(current.employes ?? {}), ...(p.employes ?? {}) } : current.employes,
          coutOccasionnel: p.coutOccasionnel
            ? { ...(current.coutOccasionnel ?? {}), ...(p.coutOccasionnel ?? {}) }
            : current.coutOccasionnel,

          // ⚠️ compat anciens alias
          coutEmployes: p.coutEmployes ? { ...(current.coutEmployes ?? {}), ...(p.coutEmployes ?? {}) } : current.coutEmployes,
          coutsOccasionnels: p.coutsOccasionnels
            ? { ...(current.coutsOccasionnels ?? {}), ...(p.coutsOccasionnels ?? {}) }
            : current.coutsOccasionnels,
        };

        // ✅ compat croisée
        if ((optimistic as any).coutOccasionnel && !(optimistic as any).coutsOccasionnels) {
          (optimistic as any).coutsOccasionnels = (optimistic as any).coutOccasionnel;
        }
        if ((optimistic as any).coutsOccasionnels && !(optimistic as any).coutOccasionnel) {
          (optimistic as any).coutOccasionnel = (optimistic as any).coutsOccasionnels;
        }

        if ((optimistic as any).employes && !(optimistic as any).coutEmployes) {
          (optimistic as any).coutEmployes = (optimistic as any).employes;
        }
        if ((optimistic as any).coutEmployes && !(optimistic as any).employes) {
          (optimistic as any).employes = (optimistic as any).coutEmployes;
        }

        this.replaceActiveVariantInState(optimistic);
      }

      // 2) api
      const resp = await jsonFetch(`/variants/${variantId}`, {
        method: "PUT",
        body: JSON.stringify(p),
      });

      // 3) normalise
      const updated = (resp as any)?.variant ?? resp;

      // 4) apply final
      if (updated?.id) this.replaceActiveVariantInState(updated);

      return updated;
    },

    async loadVariantDeep(variantId: string) {
      const resp = await jsonFetch(`/variants/${variantId}`);
      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);
      return resp;
    },

    // =========================================================
    // Variant MP override (route correcte backend)
    // =========================================================
    async updateVariantMp(variantMpId: string, payload: AnyObj) {
      const variantId = String((this as any).activeVariant?.id ?? "");
      if (!variantId) throw new Error("Aucune variante active (activeVariant.id introuvable).");

      const id = encodeURIComponent(String(variantMpId ?? ""));
      const body = JSON.stringify(payload ?? {});

      const resp = await jsonFetch(`/variants/${encodeURIComponent(variantId)}/mps/${id}`, {
        method: "PUT",
        body,
      });

      // backend: { ok: true, variant }
      const updatedVariant = (resp as any)?.variant ?? resp;
      if (updatedVariant?.id) this.replaceActiveVariantInState(updatedVariant);

      return resp;
    },

    // =========================================================
    // Variant / Formules
    // =========================================================
    async addFormuleToVariant(variantId: string, formuleId: string) {
      const resp = await jsonFetch(`/variants/${variantId}/formules`, {
        method: "POST",
        body: JSON.stringify({ formuleId }),
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);
      return resp;
    },

    async updateVariantFormule(variantId: string, variantFormuleId: string, payload: AnyObj) {
      const resp = await jsonFetch(`/variants/${variantId}/formules/${variantFormuleId}`, {
        method: "PUT",
        body: JSON.stringify(payload ?? {}),
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);
      return resp;
    },

    async deleteVariantFormule(variantId: string, variantFormuleId: string) {
      const resp = await jsonFetch(`/variants/${variantId}/formules/${variantFormuleId}`, {
        method: "DELETE",
      });

      const updated = (resp as any)?.variant ?? resp;
      if (updated?.id) this.replaceActiveVariantInState(updated);
      return resp;
    },
  },
});
