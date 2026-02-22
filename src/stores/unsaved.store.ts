// src/stores/unsaved.store.ts
import { defineStore } from "pinia";

type NavJob = {
  label?: string;
  run: () => void | Promise<void>;
};

type PageHandlers = {
  pageKey: string; // ex: "CAB"
  save?: () => Promise<boolean> | boolean; // true => ok
  discard?: () => void | Promise<void>; // revert preview + reset flags
};

export const useUnsavedStore = defineStore("unsaved", {
  state: () => ({
    // dirty global (page courante)
    dirty: false,
    pageKey: "" as string,

    // modal
    modalOpen: false,
    modalTitle: "Modifications non enregistrées",
    modalMessage:
      "Tu as des modifications non enregistrées. Que veux-tu faire ?",

    // callbacks enregistrés par la page courante
    handlers: null as PageHandlers | null,

    // navigation en attente (page/selector)
    pending: null as NavJob | null,

    // anti double-run
    busy: false,
  }),

  actions: {
    registerPage(h: PageHandlers) {
      this.handlers = h;
      this.pageKey = h.pageKey;
    },
    unregisterPage(pageKey: string) {
      if (this.handlers?.pageKey === pageKey) {
        this.handlers = null;
        this.pageKey = "";
        this.dirty = false;
        this.pending = null;
        this.modalOpen = false;
        this.busy = false;
      }
    },

    setDirty(v: boolean) {
      this.dirty = Boolean(v);
    },

    // point d’entrée unique (Sidebar + HeaderDashboard)
    async requestNavigation(job: NavJob) {
      if (!this.dirty) {
        await job.run();
        return;
      }
      this.pending = job;
      this.openModal();
    },

    openModal() {
      this.modalOpen = true;
      this.busy = false;
    },
    closeModal() {
      if (this.busy) return;
      this.modalOpen = false;
      this.pending = null;
    },

    // Choix 1: rester
    stay() {
      // IMPORTANT: ne rien exécuter
      this.closeModal();
    },

// Choix 2: quitter sans enregistrer
async leaveWithoutSaving() {
  if (this.busy) return;
  this.busy = true;

  try {
    // revert preview header + reset local si besoin
    await this.handlers?.discard?.();

    // on considère que les changements sont abandonnés
    this.dirty = false;

    // go destination
    const job = this.pending;
    this.modalOpen = false;
    this.pending = null;
    if (job) await job.run();
  } catch (e) {
    // si discard échoue, on reste sur place (modal reste ouvert)
    console.error("[unsaved] discard failed:", e);
  } finally {
    this.busy = false;
  }
},

// Choix 3: enregistrer et quitter
async saveAndLeave() {
  if (this.busy) return;
  this.busy = true;

  try {
    // IMPORTANT:
    // - save() peut retourner void (undefined) => on considère OK
    // - seul "false" explicite bloque la navigation
    const res = await this.handlers?.save?.();
    const ok = res !== false;

    if (!ok) return;

    this.dirty = false;

    const job = this.pending;
    this.modalOpen = false;
    this.pending = null;
    if (job) await job.run();
  } catch (e) {
    // si save throw => on reste sur place (modal reste ouvert)
    console.error("[unsaved] save failed:", e);
  } finally {
    this.busy = false;
  }
},
  },
});