<!-- ✅ src/components/variantWizard/tabs/WizardEmployesTab.vue
     FIX:
     - Slider NB lisible
     - Bulle au-dessus du curseur
     - AUCUN changement de couleur globale
-->

<script setup lang="ts">
import { computed } from "vue";
import type { WizardEmployesState } from "../composables/useInitieeWizardState";

const props = defineProps<{ modelValue: WizardEmployesState }>();
const emit = defineEmits<{ (e: "update:modelValue", v: WizardEmployesState): void }>();

function n(x: unknown) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function clamp(x: unknown, a: number, b: number) {
  return Math.min(b, Math.max(a, n(x)));
}
function patchDeep(path: keyof WizardEmployesState, value: unknown) {
  emit("update:modelValue", { ...props.modelValue, [path]: value } as any);
}
function pct(value: unknown, min: number, max: number) {
  const v = clamp(value, min, max);
  const d = Math.max(1, max - min);
  return ((v - min) / d) * 100;
}

const roles = computed(() => [
  { keyNb: "responsableNb", keyCout: "responsableCout", label: "Responsable", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "centralistesNb", keyCout: "centralistesCout", label: "Centralistes", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "manoeuvreNb", keyCout: "manoeuvreCout", label: "Manœuvre", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "technicienLaboNb", keyCout: "technicienLaboCout", label: "Technicien labo", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "femmeMenageNb", keyCout: "femmeMenageCout", label: "Femme de ménage", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "gardienNb", keyCout: "gardienCout", label: "Gardien de nuit", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "coordinateurExploitationNb", keyCout: "coordinateurExploitationCout", label: "Coordinateur exploitation", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "maintenancierNb", keyCout: "maintenancierCout", label: "Maintenancier", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
  { keyNb: "panierRepasNb", keyCout: "panierRepasCout", label: "Panier repas", nbMin: 0, nbMax: 5, coutMin: 0, coutMax: 50000 },
] as const);

const totalMensuel = computed(() => {
  const v = props.modelValue;
  const pairs: Array<[number, number]> = [
    [n(v.responsableNb), n(v.responsableCout)],
    [n(v.centralistesNb), n(v.centralistesCout)],
    [n(v.manoeuvreNb), n(v.manoeuvreCout)],
    [n(v.coordinateurExploitationNb), n(v.coordinateurExploitationCout)],
    [n(v.technicienLaboNb), n(v.technicienLaboCout)],
    [n(v.femmeMenageNb), n(v.femmeMenageCout)],
    [n(v.gardienNb), n(v.gardienCout)],
    [n(v.maintenancierNb), n(v.maintenancierCout)],
    [n(v.panierRepasNb), n(v.panierRepasCout)],
  ];
  return pairs.reduce((s, [nb, cout]) => s + nb * cout, 0);
});
</script>

<template>
  <div class="wrap">
    <div class="head">
      <div class="t">Employés</div>
      <div class="meta mono">Total: {{ totalMensuel.toLocaleString() }} MAD/mois</div>
    </div>

    <div class="card">
      <div class="rows">
        <div v-for="r in roles" :key="r.keyNb" class="row">
          <div class="lbl">{{ r.label }}</div>

          <div class="ctrl2">
            <!-- NB -->
            <div class="ctrl">
              <div class="k">Nb</div>

              <div
                class="rangeWrap"
                :style="{ '--p': pct((modelValue as any)[r.keyNb], r.nbMin, r.nbMax) + '%' } as any"
              >
                <input
                  class="rng"
                  type="range"
                  :min="r.nbMin"
                  :max="r.nbMax"
                  step="1"
                  :value="(modelValue as any)[r.keyNb]"
                  @input="patchDeep(
                    r.keyNb as any,
                    Math.round(clamp(($event.target as HTMLInputElement).value, r.nbMin, r.nbMax))
                  )"
                />

                <div class="bubble mono">
                  {{ Math.round(n((modelValue as any)[r.keyNb])) }}
                </div>
              </div>

              <div class="val mono">
                {{ Math.round(n((modelValue as any)[r.keyNb])) }}
              </div>
            </div>

            <!-- Salaire -->
            <div class="ctrl">
              <div class="k">Salaire</div>
              <input
                class="rng"
                type="range"
                :min="r.coutMin"
                :max="r.coutMax"
                step="500"
                :value="(modelValue as any)[r.keyCout]"
                @input="patchDeep(r.keyCout as any, clamp(($event.target as HTMLInputElement).value, r.coutMin, r.coutMax))"
              />
              <div class="val mono">
                {{ Number((modelValue as any)[r.keyCout]).toLocaleString() }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="hint">
        Limites : salaires 0..50k, nb 0..5.
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap{display:flex;flex-direction:column;gap:10px}
.head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.t{font-weight:800;font-size:13px}
.meta{font-size:12px;opacity:.9;white-space:nowrap}
.card{background:var(--card,#0b1220);border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:10px}
.rows{display:flex;flex-direction:column;gap:10px}
.row{display:grid;grid-template-columns:170px 1fr;gap:10px;align-items:start}
@media (max-width: 720px){.row{grid-template-columns:1fr}}
.lbl{font-size:12.5px;padding-top:4px}
.ctrl2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width: 520px){.ctrl2{grid-template-columns:1fr}}
.ctrl{display:grid;grid-template-columns:40px 1fr 70px;gap:8px;align-items:center}
.k{font-size:12px;font-weight:700;opacity:.9}
.rng{width:100%}
.val{font-size:12px;text-align:right;white-space:nowrap}
.mono{font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
.hint{margin-top:8px;font-size:12px;opacity:.8}

/* --- Ajout neutre pour bulle --- */
.rangeWrap{position:relative}
.bubble{
  position:absolute;
  top:-18px;
  left:var(--p);
  transform:translateX(-50%);
  font-size:11px;
  padding:2px 6px;
  border-radius:6px;
  background:currentColor;
  color:#fff;
  pointer-events:none;
}
</style>