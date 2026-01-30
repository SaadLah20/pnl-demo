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
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `API error: ${res.status}`);
  }

  return res.json().catch(() => null);
}

type AnyObj = Record<string, any>;

export const usePnlStore = defineStore("pnl", {
  state: () => ({
    pnls: [] as any[],
    activePnlId: null as string | null,
    activeVariantId: null as string | null,

    mpCatalogue: [] as any[],
    formulesCatalogue: [] as any[],

    loading: false,
    error: null as string | null,
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
      return computeHeaderKpis(variant, dureeMois);
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

    // -------------------------
    // load
    // -------------------------
    async loadPnls() {
      this.loading = true;
      this.error = null;

      try {
        const data = await jsonFetch("/pnls");
        this.pnls = data ?? [];

        if (!this.activePnlId && this.pnls[0]) this.activePnlId = this.pnls[0].id;
        if (!this.activeVariantId && this.pnls[0]) {
          this.activeVariantId = this.pnls[0]?.contracts?.[0]?.variants?.[0]?.id ?? null;
        }

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
    // catalogues
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
    // VARIANT MP actions
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

    async updateVariantMp(variantMpId: string, payload: { prix?: number; comment?: string }) {
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
    // ✅ VARIANT FORMULE actions
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
    // CRUD PNL/CONTRACT/VARIANT
    // -------------------------
    async createPnl(payload: any) {
      await jsonFetch("/pnls", { method: "POST", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async updatePnl(id: string, payload: any) {
      await jsonFetch(`/pnls/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async deletePnl(id: string) {
      await jsonFetch(`/pnls/${id}`, { method: "DELETE" });
      if (this.activePnlId === id) {
        this.activePnlId = null;
        this.activeVariantId = null;
      }
      await this.loadPnls();
    },

    async createContract(payload: any) {
      await jsonFetch("/contracts", { method: "POST", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async updateContract(id: string, payload: any) {
      await jsonFetch(`/contracts/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async deleteContract(id: string) {
      await jsonFetch(`/contracts/${id}`, { method: "DELETE" });
      if (this.activeVariantId) this.activeVariantId = null;
      await this.loadPnls();
    },

    async createVariant(payload: any) {
      await jsonFetch("/variants", { method: "POST", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async updateVariant(id: string, payload: any) {
      await jsonFetch(`/variants/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      await this.loadPnls();
    },

    async deleteVariant(id: string) {
      await jsonFetch(`/variants/${id}`, { method: "DELETE" });
      if (this.activeVariantId === id) this.activeVariantId = null;
      await this.loadPnls();
    },
  },
});
