<template>
  <div class="app">
    <Sidebar />

    <div class="main-content">
      <HeaderDashboard />
      <div class="content-scroll">
        <router-view />
      </div>
    </div>

    <!-- ✅ Modal global "unsaved changes" -->
    <teleport to="body">
      <div
        v-if="unsaved.modalOpen"
        class="ovl"
        role="dialog"
        aria-modal="true"
        @mousedown.self="unsaved.stay()"
      >
        <div class="dlg">
          <div class="dlgHdr">
            <div class="dlgTtl">{{ unsaved.modalTitle }}</div>
            <button class="x" type="button" @click="unsaved.stay()" aria-label="Fermer">✕</button>
          </div>

          <div class="dlgBody">
            <div class="dlgMsg">{{ unsaved.modalMessage }}</div>
          </div>

          <div class="dlgFtr">
            <button class="btn2 pri" type="button" :disabled="unsaved.busy" @click="unsaved.stay()">
              Rester
            </button>

            <button class="btn2 danger" type="button" :disabled="unsaved.busy" @click="unsaved.leaveWithoutSaving()">
              Quitter sans enregistrer
            </button>

            <button class="btn2" type="button" :disabled="unsaved.busy" @click="unsaved.saveAndLeave()">
              Enregistrer & quitter
            </button>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import Sidebar from "@/components/Sidebar.vue";
import HeaderDashboard from "@/components/HeaderDashboard.vue";
import { usePnlStore } from "@/stores/pnl.store";
import { useUnsavedStore } from "@/stores/unsaved.store";

const pnlStore = usePnlStore();
const unsaved = useUnsavedStore();

onMounted(() => {
  pnlStore.loadPnls();
});

// ✅ blocage refresh/close tab si dirty
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!unsaved.dirty) return;
  e.preventDefault();
  // legacy
  e.returnValue = "";
}
onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<style>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.content-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
  padding: 12px;
  background: #f7f8fb;
}

/* ✅ modal global */
.ovl {
  position: fixed;
  inset: 0;
  background: rgba(2, 6, 23, 0.42);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 12px;
  padding-top: 82px;
  z-index: 200000;
}
.dlg {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 16px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  overflow: hidden;
}
.dlgHdr {
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.dlgTtl {
  font-weight: 950;
  color: #0f172a;
}
.x {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  cursor: pointer;
}
.dlgBody {
  padding: 12px;
}
.dlgMsg {
  font-weight: 800;
  color: rgba(15, 23, 42, 0.85);
  line-height: 1.45;
}
.dlgFtr {
  padding: 10px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  flex-wrap: wrap;
}
.btn2 {
  height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(15, 23, 42, 0.03);
  font-weight: 950;
  cursor: pointer;
}
.btn2.pri {
  background: rgba(2, 132, 199, 0.14);
  border-color: rgba(2, 132, 199, 0.32);
}
.btn2.danger {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.22);
}
.btn2:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>