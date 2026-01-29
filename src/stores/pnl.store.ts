import { defineStore } from "pinia";

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

    activeVariant(state) {
      const pnl = state.pnls.find((p) => p.id === state.activePnlId);
      if (!pnl) return null;

      for (const c of pnl.contracts ?? []) {
        const v = (c.variants ?? []).find((x: any) => x.id === state.activeVariantId);
        if (v) return v;
      }
      return null;
    },
  },

  actions: {
    async loadPnls() {
      this.loading = true;
      this.error = null;

      try {
        // ✅ IMPORTANT: ta route backend est /pnls (pas /api/pnls)
        const res = await fetch("http://localhost:3001/pnls");
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();
        this.pnls = data;

        // Auto-select au premier chargement
        if (!this.activePnlId && data[0]) {
          this.activePnlId = data[0].id;
        }
        if (!this.activeVariantId && data[0]) {
          this.activeVariantId = data[0]?.contracts?.[0]?.variants?.[0]?.id ?? null;
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
  },
});
