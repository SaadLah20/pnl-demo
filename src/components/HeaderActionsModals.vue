<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

/* =========================
   STATE
========================= */

const showVariantModal = ref(false);
const mode = ref<"create" | "edit">("create");

const form = reactive({
  title: "",
});

/* =========================
   ACTIVE DATA
========================= */

const activeContract = computed(() => store.activeContract);
const activeVariant = computed(() => store.activeVariant);

/* =========================
   OPEN METHODS (EXPOSED)
========================= */

function openNewVariant() {
  if (!activeContract.value) return;

  mode.value = "create";
  form.title = "";
  showVariantModal.value = true;
}

function openEditVariant() {
  if (!activeVariant.value) return;

  mode.value = "edit";
  form.title = activeVariant.value.title ?? "";
  showVariantModal.value = true;
}

defineExpose({
  openNewVariant,
  openEditVariant,
});

/* =========================
   SAVE
========================= */

async function save() {
  if (!activeContract.value) return;

  if (mode.value === "create") {
    const resp = await fetch(
      `http://localhost:3001/contracts/${activeContract.value.id}/variants`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
        }),
      }
    );

    const data = await resp.json();

    if (data?.variant?.id) {
      await store.loadPnls();
      store.setActiveVariant(data.variant.id);
    }
  } else {
    if (!activeVariant.value) return;

    await store.updateVariant(activeVariant.value.id, {
      title: form.title,
    });
  }

  showVariantModal.value = false;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="showVariantModal" class="modalOverlay">
      <div class="modalCard">
        <div class="modalHeader">
          <h3>
            {{ mode === "create" ? "Nouvelle variante" : "Éditer la variante" }}
          </h3>
        </div>

        <div class="modalBody">
          <label class="field">
            <span>Titre</span>
            <input v-model="form.title" type="text" />
          </label>
        </div>

        <div class="modalFooter">
          <button class="btn ghost" @click="showVariantModal = false">
            Annuler
          </button>
          <button class="btn primary" @click="save">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000000; /* 🔥 toujours au-dessus du header */
}

.modalCard {
  width: 420px;
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
}

.modalHeader h3 {
  font-size: 18px;
  font-weight: 800;
  margin-bottom: 16px;
}

.modalBody {
  margin-bottom: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field span {
  font-size: 12px;
  font-weight: 700;
}

.field input {
  border: 1px solid #d0d5dd;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
}

.modalFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  border: none;
}

.btn.ghost {
  background: #f2f4f7;
}

.btn.primary {
  background: #184070;
  color: white;
}
</style>
