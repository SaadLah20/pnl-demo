<!-- src/components/EntityDetailsModal.vue -->
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  entity: any | null;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

function fmt(v: any) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return new Intl.NumberFormat("fr-FR").format(v);
  return String(v);
}

function fmtDate(v: any) {
  try {
    if (!v) return "—";
    const d = new Date(v);
    return new Intl.DateTimeFormat("fr-FR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

const rows = computed(() => {
  const e = props.entity ?? {};
  return Object.entries(e)
    .filter(([k, v]) => {
      if (typeof v === "function") return false;
      if (k === "contracts" || k === "variants" || k === "items") return false; // on gère à part
      if (typeof v === "object" && v !== null) return false;
      return true;
    })
    .map(([k, v]) => ({
      k,
      v: k.toLowerCase().includes("date") || k.toLowerCase().includes("createdat") ? fmtDate(v) : fmt(v),
    }));
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="overlay" @click.self="emit('close')">
      <div class="modal">
        <!-- Header -->
        <div class="head">
          <div class="title">
            <div class="h">{{ title }}</div>
            <div v-if="subtitle" class="sub">{{ subtitle }}</div>
          </div>

          <button class="x" @click="emit('close')" title="Fermer">✕</button>
        </div>

        <!-- Body -->
        <div class="body">
          <div v-if="!entity" class="empty">Aucune donnée.</div>

          <div v-else class="grid">
            <div v-for="r in rows" :key="r.k" class="row">
              <div class="k">{{ r.k }}</div>
              <div class="v">{{ r.v }}</div>
            </div>
          </div>

          <!-- Nested objects preview -->
          <div v-if="entity?.contracts?.length" class="block">
            <div class="blockTitle">Contrats</div>
            <div class="miniList">
              <div v-for="c in entity.contracts" :key="c.id" class="miniCard">
                <b>{{ c.title ?? "Contrat" }}</b>
                <span class="muted">— {{ c.dureeMois ?? 0 }} mois</span>
              </div>
            </div>
          </div>

          <div v-if="entity?.variants?.length" class="block">
            <div class="blockTitle">Variantes</div>
            <div class="miniList">
              <div v-for="v in entity.variants" :key="v.id" class="miniCard">
                <b>{{ v.title ?? "Variante" }}</b>
                <span class="muted">— {{ v.status ?? "—" }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="foot">
          <button class="btn" @click="emit('close')">Fermer</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.modal {
  width: min(860px, 100%);
  max-height: 85vh;
  overflow: auto;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e5e7eb;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid #eef2f7;
}

.title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.h {
  font-size: 15px;
  font-weight: 900;
  color: #111827;
}
.sub {
  font-size: 12px;
  color: #6b7280;
}

.x {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
}
.x:hover {
  background: #f9fafb;
}

.body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.empty {
  color: #6b7280;
  font-size: 13px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 8px 12px;
}
.row {
  display: contents;
}
.k {
  font-size: 12px;
  color: #6b7280;
  font-weight: 700;
}
.v {
  font-size: 12px;
  color: #111827;
  word-break: break-word;
}

.block {
  border-top: 1px dashed #e5e7eb;
  padding-top: 12px;
}
.blockTitle {
  font-size: 12px;
  font-weight: 900;
  color: #111827;
  margin-bottom: 8px;
}

.miniList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.miniCard {
  padding: 10px;
  border: 1px solid #eef2f7;
  border-radius: 14px;
  background: #fafbfc;
  font-size: 12px;
}
.muted {
  color: #6b7280;
  margin-left: 6px;
}

.foot {
  padding: 10px 14px 14px;
  border-top: 1px solid #eef2f7;
  display: flex;
  justify-content: flex-end;
}

.btn {
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 13px;
  border: 1px solid #e6e8ee;
  background: #fff;
  cursor: pointer;
}
.btn:hover {
  background: #f9fafb;
}

@media (max-width: 700px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
