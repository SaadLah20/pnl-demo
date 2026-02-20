<!-- src/components/VariantWizard/tabs/WizardGeneralTab.vue -->
<script setup lang="ts">
import { computed } from "vue";

export type WizardGeneralState = {
  amortMois: number;       // DH/mois
  fraisGenPct: number;     // %CA
  transportM3: number;     // DH/m3

  includePompage: boolean;
  volumePompePct: number;  // %
  prixAchatPompe: number;  // DH
  prixVentePompe: number;  // DH

  hydrofugePu: number;     // DH
  hydrofugeVolume: number; // m3

  ebitCiblePct: number;    // %
};

const props = defineProps<{
  modelValue: WizardGeneralState;
  cabChargeClient: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: WizardGeneralState): void;
}>();

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function clamp(x: number, a: number, b: number) {
  return Math.min(b, Math.max(a, x));
}
function patch(p: Partial<WizardGeneralState>) {
  emit("update:modelValue", { ...props.modelValue, ...p });
}

const amortLocked = computed(() => !!props.cabChargeClient);

const amortDisplay = computed({
  get() {
    return amortLocked.value ? 0 : n(props.modelValue.amortMois);
  },
  set(v: any) {
    if (amortLocked.value) return;
    patch({ amortMois: clamp(n(v), 0, 150000) });
  },
});

const fgDisplay = computed({
  get: () => clamp(n(props.modelValue.fraisGenPct), 0, 10),
  set: (v: any) => patch({ fraisGenPct: clamp(n(v), 0, 10) }),
});

const transportDisplay = computed({
  get: () => clamp(n(props.modelValue.transportM3), 0, 500),
  set: (v: any) => patch({ transportM3: clamp(n(v), 0, 500) }),
});

const ebitDisplay = computed({
  get: () => clamp(n(props.modelValue.ebitCiblePct), 1, 15),
  set: (v: any) => patch({ ebitCiblePct: clamp(n(v), 1, 15) }),
});

const pompagePctDisplay = computed({
  get: () => clamp(n(props.modelValue.volumePompePct), 0, 100),
  set: (v: any) => patch({ volumePompePct: clamp(n(v), 0, 100) }),
});
const pompageAchatDisplay = computed({
  get: () => clamp(n(props.modelValue.prixAchatPompe), 30, 80),
  set: (v: any) => patch({ prixAchatPompe: clamp(n(v), 30, 80) }),
});
const pompageVenteDisplay = computed({
  get: () => clamp(n(props.modelValue.prixVentePompe), 40, 80),
  set: (v: any) => patch({ prixVentePompe: clamp(n(v), 40, 80) }),
});

const hydroPuDisplay = computed({
  get: () => clamp(n(props.modelValue.hydrofugePu), 30, 60),
  set: (v: any) => patch({ hydrofugePu: clamp(n(v), 30, 60) }),
});
const hydroVolDisplay = computed({
  get: () => clamp(n(props.modelValue.hydrofugeVolume), 0, 1e9),
  set: (v: any) => patch({ hydrofugeVolume: Math.max(0, n(v)) }),
});

function togglePompage(v: boolean) {
  if (v) {
    patch({
      includePompage: true,
      volumePompePct: props.modelValue.volumePompePct || 50,
      prixAchatPompe: props.modelValue.prixAchatPompe || 50,
      prixVentePompe: props.modelValue.prixVentePompe || 55,
    });
  } else {
    patch({ includePompage: false });
  }
}
</script>

<template>
  <div class="g">
    <div class="card">
      <div class="cardH">
        <div class="t">Centrale & objectifs</div>
        <div v-if="cabChargeClient" class="pill pill--lock">CAB charge client · amortissement = 0</div>
      </div>

      <div class="row">
        <div class="lbl">Amortissement</div>
        <div class="ctrl">
          <input class="rng" type="range" min="0" max="150000" step="500" :disabled="amortLocked" v-model.number="amortDisplay" />
          <div class="val mono" :class="{ muted: amortLocked }">{{ amortDisplay.toLocaleString() }} DH/mois</div>
        </div>
      </div>

      <div class="row">
        <div class="lbl">EBIT cible</div>
        <div class="ctrl">
          <input class="rng" type="range" min="1" max="15" step="0.1" v-model.number="ebitDisplay" />
          <div class="val mono">{{ ebitDisplay.toFixed(1) }}%</div>
        </div>
      </div>

      <div class="sep" />

      <div class="row">
        <div class="lbl">Frais généraux</div>
        <div class="ctrl">
          <input class="rng" type="range" min="0" max="10" step="0.1" v-model.number="fgDisplay" />
          <div class="val mono">{{ fgDisplay.toFixed(1) }}% CA</div>
        </div>
      </div>

      <div class="row">
        <div class="lbl">Transport (moyenne)</div>
        <div class="ctrl">
          <input class="rng" type="range" min="0" max="200" step="0.5" v-model.number="transportDisplay" />
          <div class="val mono">{{ transportDisplay.toFixed(1) }} DH/m³</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="cardH">
        <div class="t">Options commerciales</div>
        <div class="mini">Tout est facultatif · non saisi ⇒ 0</div>
      </div>

      <div class="row row--toggle">
        <div>
          <div class="lbl">Pompage</div>
          <div class="mini">Inclure la prestation (si activé : % volume + prix achat/vente)</div>
        </div>
        <label class="sw">
          <input type="checkbox" :checked="modelValue.includePompage" @change="togglePompage(($event.target as any).checked)" />
          <span class="swTrack" aria-hidden="true"></span>
        </label>
      </div>

      <div class="sub" :class="{ off: !modelValue.includePompage }">
        <div class="row">
          <div class="lbl">% volume pompé</div>
          <div class="ctrl">
            <input class="rng" type="range" min="0" max="100" step="1" :disabled="!modelValue.includePompage" v-model.number="pompagePctDisplay" />
            <div class="val mono">{{ pompagePctDisplay.toFixed(0) }}%</div>
          </div>
        </div>

        <div class="row">
          <div class="lbl">Prix achat</div>
          <div class="ctrl">
            <input class="rng" type="range" min="30" max="80" step="1" :disabled="!modelValue.includePompage" v-model.number="pompageAchatDisplay" />
            <div class="val mono">{{ pompageAchatDisplay.toFixed(0) }} DH</div>
          </div>
        </div>

        <div class="row">
          <div class="lbl">Prix vente</div>
          <div class="ctrl">
            <input class="rng" type="range" min="40" max="80" step="1" :disabled="!modelValue.includePompage" v-model.number="pompageVenteDisplay" />
            <div class="val mono">{{ pompageVenteDisplay.toFixed(0) }} DH</div>
          </div>
        </div>
      </div>

      <div class="sep" />

      <div class="row">
        <div class="lbl">Plus-value hydrofuge</div>
        <div class="ctrl">
          <input class="rng" type="range" min="30" max="60" step="1" v-model.number="hydroPuDisplay" />
          <div class="val mono">{{ hydroPuDisplay.toFixed(0) }} DH</div>
        </div>
      </div>

      <div class="row">
        <div class="lbl">Volume hydrofuge</div>
        <div class="ctrl">
          <input class="in mono" type="number" min="0" step="1" v-model.number="hydroVolDisplay" />
          <div class="val mono">m³</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.g{display:grid; grid-template-columns:1fr 1fr; gap:12px; align-items:start}
.card{background:#fcfcfd; border:1px solid rgba(15,23,42,.10); border-radius:14px; padding:10px}
.cardH{display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px}
.t{font-size:12px; font-weight:950; color:#0f172a}
.mini{font-size:11px; color:rgba(15,23,42,.55)}
.pill{font-size:10.5px; font-weight:950; padding:4px 8px; border-radius:999px; border:1px solid rgba(15,23,42,.14); background:#fff; color:rgba(15,23,42,.8)}
.pill--lock{border-color:rgba(245,158,11,.30); background:rgba(245,158,11,.10)}

.row{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 0}
.row--toggle{align-items:flex-start}
.lbl{font-size:11px; font-weight:900; color:rgba(15,23,42,.70)}
.ctrl{display:flex; align-items:center; gap:10px; min-width:340px; justify-content:flex-end}
.rng{width:240px}
.val{font-size:12px; font-weight:900; color:#0f172a; width:110px; text-align:right}
.mono{font-variant-numeric:tabular-nums; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace}
.muted{color:rgba(15,23,42,.45)}
.in{width:140px; text-align:right; border:1px solid rgba(15,23,42,.14); border-radius:12px; padding:7px 10px; background:#fff; outline:none}
.in:focus{border-color:rgba(2,132,199,.35); box-shadow:0 0 0 3px rgba(2,132,199,.12)}

.sep{height:1px; background:rgba(15,23,42,.08); margin:6px 0}

.sub{margin-top:4px; padding:8px 10px; border-radius:12px; border:1px dashed rgba(15,23,42,.14); background:rgba(15,23,42,.02)}
.sub.off{opacity:.55}

/* switch */
.sw{position:relative; display:inline-flex; align-items:center; cursor:pointer; user-select:none}
.sw input{position:absolute; opacity:0; pointer-events:none}
.swTrack{width:44px; height:24px; background:rgba(15,23,42,.18); border-radius:999px; position:relative; transition:all .15s ease}
.swTrack:after{content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:999px; background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.12); transition:all .15s ease}
.sw input:checked + .swTrack{background:rgba(2,132,199,.50)}
.sw input:checked + .swTrack:after{transform:translateX(20px)}

@media (max-width: 900px){
  .g{grid-template-columns:1fr}
  .ctrl{min-width:0}
  .rng{width:100%}
}
</style>