// src/stores/pnl.store.ts
import { defineStore } from "pinia";
import { computeHeaderKpis } from "@/services/kpis/headerkpis"; // ✅ minuscule

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

export const usePnlStore = defineStore("pnl", {
  state: () => ({
    pnls: [] as any[],
    activePnlId: null as string | null,
    activeVariantId: null as string | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    activePnl(state) {
      return state.pnls.find((p) => p.id === state.activePnlId) ?? null;
    },

    // ✅ contrat qui contient la variante active
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

    // ✅ KPI header calculés depuis la variante active + durée contrat
    activeHeaderKPIs(): any {
      const variant = this.activeVariant;
      if (!variant) return null;

      const dureeMois = this.activeContract?.dureeMois ?? 0;

      // Debug utile (tu peux le retirer après)
      // console.log("[KPIs] variant:", variant?.title, "dureeMois:", dureeMois);

      return computeHeaderKpis(variant, dureeMois);
    },
  },

  actions: {
    async loadPnls() {
      this.loading = true;
      this.error = null;

      try {
        const data = await jsonFetch("/pnls");
        this.pnls = data ?? [];

        if (!this.activePnlId && this.pnls[0]) {
          this.activePnlId = this.pnls[0].id;
        }

        if (!this.activeVariantId && this.pnls[0]) {
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

    // ---------- CRUD PNL
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

    // ---------- CRUD CONTRACT
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

    // ---------- CRUD VARIANT
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
