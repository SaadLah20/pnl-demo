<script setup lang="ts">
import { computed, onMounted, toRaw, ref, watchEffect } from "vue";
import type { WizardCoutsState } from "../composables/useInitieeWizardState";

const props = defineProps<{
  modelValue: WizardCoutsState;
  locks?: Record<string, boolean>;
  volumeTotalM3?: number;
  dureeMois?: number;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: WizardCoutsState): void;
}>();

/* =========================
   HELPERS
========================= */
function n(x: any) {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function clamp(x: any, a: number, b: number) {
  const v = n(x);
  return Math.min(b, Math.max(a, v));
}
function deepClone<T>(v: T): T {
  const raw = toRaw(v as any);
  try {
    return structuredClone(raw);
  } catch {
    return JSON.parse(JSON.stringify(raw));
  }
}
function isLocked(path: string) {
  return !!props.locks?.[path];
}
function setPath(obj: Record<string, any>, path: string, value: any) {
  const parts = path.split(".");
  if (!parts.length) return;

  let cur: Record<string, any> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i] ?? "";
    if (!k) return;
    const nextVal = cur[k];
    if (!nextVal || typeof nextVal !== "object") cur[k] = {};
    cur = cur[k] as Record<string, any>;
  }
  const last = parts[parts.length - 1] ?? "";
  if (!last) return;
  cur[last] = value;
}
function getByPath(path: string): number {
  const parts = path.split(".");
  let cur: any = props.modelValue as any;
  for (const p of parts) {
    const k = p ?? "";
    if (!k) return 0;
    cur = cur?.[k];
  }
  return n(cur);
}
function patchDeep(path: string, value: any) {
  const next: WizardCoutsState = deepClone(props.modelValue);
  setPath(next as any, path, value);
  emit("update:modelValue", next);
}

function fmt0(x: number) {
  return Math.round(n(x)).toLocaleString("fr-FR");
}
function fmt2(x: number) {
  const v = Math.round(n(x) * 100) / 100;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* =========================
   DEFAULTS (one-shot init)
========================= */
onMounted(() => {
  const mv = props.modelValue;
  const next = deepClone(mv);

  if (!isLocked("coutMensuel.locationTerrain") && n(next.coutMensuel.locationTerrain) === 0)
    next.coutMensuel.locationTerrain = 45000;
  if (!isLocked("coutMensuel.locationChargeur") && n(next.coutMensuel.locationChargeur) === 0)
    next.coutMensuel.locationChargeur = 22000;
  if (!isLocked("coutMensuel.troisG") && n(next.coutMensuel.troisG) === 0) next.coutMensuel.troisG = 500;

  const m = next.maintenance;
  if (!isLocked("maintenance.cab") && n(m.cab) === 0) m.cab = 3000;
  if (!isLocked("maintenance.elec") && n(m.elec) === 0) m.elec = 3000;
  if (!isLocked("maintenance.generale") && n(m.generale) === 0) m.generale = 3000;
  if (!isLocked("maintenance.preventive") && n(m.preventive) === 0) m.preventive = 3000;

  if (!isLocked("maintenance.chargeur")) m.chargeur = 0;
  if (!isLocked("maintenance.bassins")) m.bassins = 0;

  const changed = JSON.stringify(mv) !== JSON.stringify(next);
  if (changed) emit("update:modelValue", next);
});

/* =========================
   Gasoil auto
========================= */
const elecGroupLocked = computed(
  () => isLocked("coutMensuel.electricite") || isLocked("coutMensuel.location")
);
const volTotal = computed(() => Math.max(0, n(props.volumeTotalM3)));
const duree = computed(() => Math.max(1, Math.trunc(n(props.dureeMois) || 1)));
const gasoilAutoRate = computed(() => (elecGroupLocked.value ? 1.5 : 1.8));
const gasoilAutoValue = computed(() => (gasoilAutoRate.value * volTotal.value * 12) / duree.value);

/* =========================
   Totaux
========================= */
const totalCoutM3 = computed(() => {
  const c = props.modelValue.coutM3;
  return n(c.eau) + n(c.qualite) + n(c.dechets);
});
const totalMensuel = computed(() => {
  const m = props.modelValue.coutMensuel;
  return (
    n(m.electricite) +
    n(m.gasoil) +
    n(m.location) +
    n(m.securite) +
    n(m.hebergements) +
    n(m.locationTerrain) +
    n(m.telephone) +
    n(m.troisG) +
    n(m.taxeProfessionnelle) +
    n(m.locationVehicule) +
    n(m.locationChargeur) +
    n(m.locationBungalows) +
    n(m.epi)
  );
});
const totalMaintenance = computed(() => {
  const m = props.modelValue.maintenance;
  return n(m.cab) + n(m.elec) + n(m.chargeur) + n(m.generale) + n(m.bassins) + n(m.preventive);
});
const totalOccasionnel = computed(() => {
  const o: any = props.modelValue.coutOccasionnel as any;
  return (
    n(o.genieCivil) +
    n(o.installation) +
    n(o.transport) +
    n(o.demontage) +
    n(o.remisePointCentrale) +
    n(o.silots) +
    n(o.localAdjuvant) +
    n(o.bungalows) +
    n(o.branchementElec) +
    n(o.branchementEau)
  );
});

/* =========================
   RANGES
========================= */
const itemsM3 = [
  { label: "Eau", path: "coutM3.eau", min: 0, max: 10, step: 0.25 },
  { label: "Qualité", path: "coutM3.qualite", min: 0, max: 10, step: 0.25 },
  { label: "Déchets", path: "coutM3.dechets", min: 0, max: 10, step: 0.25 },
] as const;

const itemsMensuels = [
  { label: "Électricité", path: "coutMensuel.electricite", min: 0, max: 80000, step: 100 },
  { label: "Location groupes", path: "coutMensuel.location", min: 0, max: 50000, step: 100 },
  { label: "Sécurité", path: "coutMensuel.securite", min: 0, max: 10000, step: 50 },
  { label: "Hébergements", path: "coutMensuel.hebergements", min: 0, max: 20000, step: 50 },
  { label: "Location terrain", path: "coutMensuel.locationTerrain", min: 0, max: 100000, step: 100 },
  { label: "Téléphone", path: "coutMensuel.telephone", min: 0, max: 5000, step: 10 },
  { label: "3G", path: "coutMensuel.troisG", min: 0, max: 5000, step: 10 },
  { label: "Taxe pro", path: "coutMensuel.taxeProfessionnelle", min: 0, max: 5000, step: 10 },
  { label: "Location véhicule", path: "coutMensuel.locationVehicule", min: 0, max: 40000, step: 100 },
  { label: "Location chargeur", path: "coutMensuel.locationChargeur", min: 0, max: 50000, step: 100 },
  { label: "Bungalows", path: "coutMensuel.locationBungalows", min: 0, max: 10000, step: 50 },
  { label: "EPI", path: "coutMensuel.epi", min: 0, max: 2000, step: 10 },
] as const;

const itemsMaintenance = [
  { label: "CAB", path: "maintenance.cab", min: 0, max: 10000, step: 50 },
  { label: "Élec", path: "maintenance.elec", min: 0, max: 10000, step: 50 },
  { label: "Chargeur", path: "maintenance.chargeur", min: 0, max: 10000, step: 50 },
  { label: "Générale", path: "maintenance.generale", min: 0, max: 10000, step: 50 },
  { label: "Bassins", path: "maintenance.bassins", min: 0, max: 10000, step: 50 },
  { label: "Préventive", path: "maintenance.preventive", min: 0, max: 10000, step: 50 },
] as const;

const itemsOccasionnels = computed(() => {
  const o: any = props.modelValue.coutOccasionnel as any;
  const rows: Array<{ label: string; path: string; min: number; max: number; step: number }> = [
    { label: "Génie civil", path: "coutOccasionnel.genieCivil", min: 0, max: 2_000_000, step: 1000 },
    { label: "Installation", path: "coutOccasionnel.installation", min: 0, max: 2_000_000, step: 1000 },
    { label: "Transport", path: "coutOccasionnel.transport", min: 0, max: 500_000, step: 500 },
    { label: "Démontage", path: "coutOccasionnel.demontage", min: 0, max: 500_000, step: 500 },
    { label: "Remise point centrale", path: "coutOccasionnel.remisePointCentrale", min: 0, max: 500_000, step: 500 },
    { label: "Silots", path: "coutOccasionnel.silots", min: 0, max: 500_000, step: 500 },
    { label: "Local adjuvant", path: "coutOccasionnel.localAdjuvant", min: 0, max: 500_000, step: 500 },
    { label: "Bungalows", path: "coutOccasionnel.bungalows", min: 0, max: 500_000, step: 500 },
  ];
  if (o?.branchementEau !== undefined)
    rows.push({ label: "Branchement eau", path: "coutOccasionnel.branchementEau", min: 0, max: 500_000, step: 500 });
  if (o?.branchementElec !== undefined)
    rows.push({ label: "Branchement électricité", path: "coutOccasionnel.branchementElec", min: 0, max: 500_000, step: 500 });
  return rows;
});

/* =========================
   Events
========================= */
function onSlide(path: string, min: number, max: number, raw: any) {
  if (isLocked(path)) return;
  patchDeep(path, clamp(raw, min, max));
}
function onInput(path: string, min: number, max: number, raw: any) {
  if (isLocked(path)) return;
  patchDeep(path, clamp(raw, min, max));
}

/* =========================
   Gasoil control
========================= */
const gasoilPath = "coutMensuel.gasoil";
const gasoilLinkedPath = "coutMensuel.gasoilLinked";
const gasoilIsAuto = computed(() => !!(props.modelValue as any)?.coutMensuel?.gasoilLinked);

function toggleGasoilAuto(v: boolean) {
  patchDeep(gasoilLinkedPath, !!v);
  if (v) patchDeep(gasoilPath, gasoilAutoValue.value);
}
const gasoilDisplay = computed(() => (gasoilIsAuto.value ? gasoilAutoValue.value : getByPath(gasoilPath)));

watchEffect(() => {
  if (!gasoilIsAuto.value) return;
  if (isLocked(gasoilPath)) return;
  const target = gasoilAutoValue.value;
  const cur = getByPath(gasoilPath);
  if (Math.abs(cur - target) > 0.5) patchDeep(gasoilPath, target);
});

/* =========================
   UI: pliable (tu peux garder)
========================= */
const openMens = ref(true);
const openMaint = ref(true);
const openM3 = ref(true);
const openOcc = ref(true);

function valFmt(path: string, mode: "0" | "2") {
  const v = getByPath(path);
  return mode === "2" ? fmt2(v) : fmt0(v);
}
</script>

<template>
  <div class="wrap">
    <!-- Header -->
    <div class="head">
      <div class="hLeft">
        <div class="hTitle">Coûts</div>
        <div class="hSub">Blocs distingués · compact · focus valeurs</div>
      </div>

      <div class="kpis">
        <div class="kpi">
          <div class="kLab">/m³</div>
          <div class="kVal mono">{{ fmt2(totalCoutM3) }}</div>
        </div>
        <div class="kpi">
          <div class="kLab">Mensuel</div>
          <div class="kVal mono">{{ fmt0(totalMensuel) }}</div>
        </div>
        <div class="kpi">
          <div class="kLab">Maint.</div>
          <div class="kVal mono">{{ fmt0(totalMaintenance) }}</div>
        </div>
        <div class="kpi">
          <div class="kLab">Occas.</div>
          <div class="kVal mono">{{ fmt0(totalOccasionnel) }}</div>
        </div>
      </div>
    </div>

    <!-- ✅ Layout demandé -->
    <div class="grid2">
      <!-- LEFT COLUMN: Mensuel then Maintenance (no vertical gap) -->
      <div class="col">
        <!-- Mensuels -->
        <section class="sec sec--mens sec--top">
          <button class="secH" type="button" @click="openMens = !openMens" :aria-expanded="openMens">
            <div class="secT">Coûts mensuels</div>
            <div class="secR mono">{{ fmt0(totalMensuel) }}</div>
            <div class="chev">{{ openMens ? "▾" : "▸" }}</div>
          </button>

          <div v-show="openMens" class="secB">
            <!-- Gasoil -->
            <div class="row" :class="{ locked: isLocked(gasoilPath) }">
              <div class="rowTop">
                <div class="lab">
                  <span class="txt">Gasoil</span>
                  <span v-if="isLocked(gasoilPath)" class="lk">contrat</span>

                  <label class="auto">
                    <input
                      type="checkbox"
                      :checked="gasoilIsAuto"
                      :disabled="isLocked(gasoilPath)"
                      @change="toggleGasoilAuto(($event.target as HTMLInputElement).checked)"
                    />
                    <span>Auto</span>
                  </label>

                  <span v-if="gasoilIsAuto" class="hint">
                    {{ elecGroupLocked ? "GE verrouillé" : "GE libre" }} · {{ gasoilAutoRate.toFixed(1) }}DH · vol
                    {{ fmt0(volTotal) }} · {{ duree }}m
                  </span>
                </div>

                <div class="badge mono">{{ fmt0(gasoilDisplay) }}</div>
              </div>

              <div class="rowBot">
                <input
                  class="rng"
                  type="range"
                  min="0"
                  max="200000"
                  step="100"
                  :disabled="isLocked(gasoilPath) || gasoilIsAuto"
                  :value="gasoilDisplay"
                  @input="onSlide(gasoilPath, 0, 200000, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="num"
                  type="number"
                  min="0"
                  max="200000"
                  step="1"
                  :disabled="isLocked(gasoilPath) || gasoilIsAuto"
                  :value="gasoilDisplay"
                  @input="onInput(gasoilPath, 0, 200000, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>

            <div v-for="it in itemsMensuels" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
              <div class="rowTop">
                <div class="lab">
                  <span class="txt">{{ it.label }}</span>
                  <span v-if="isLocked(it.path)" class="lk">contrat</span>
                </div>
                <div class="badge mono">{{ valFmt(it.path, "0") }}</div>
              </div>

              <div class="rowBot">
                <input
                  class="rng"
                  type="range"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onSlide(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="num"
                  type="number"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onInput(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Maintenance -->
        <section class="sec sec--maint sec--bottom">
          <button class="secH" type="button" @click="openMaint = !openMaint" :aria-expanded="openMaint">
            <div class="secT">Maintenance</div>
            <div class="secR mono">{{ fmt0(totalMaintenance) }}</div>
            <div class="chev">{{ openMaint ? "▾" : "▸" }}</div>
          </button>

          <div v-show="openMaint" class="secB">
            <div v-for="it in itemsMaintenance" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
              <div class="rowTop">
                <div class="lab">
                  <span class="txt">{{ it.label }}</span>
                  <span v-if="isLocked(it.path)" class="lk">contrat</span>
                </div>
                <div class="badge mono">{{ valFmt(it.path, "0") }}</div>
              </div>

              <div class="rowBot">
                <input
                  class="rng"
                  type="range"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onSlide(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="num"
                  type="number"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onInput(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- RIGHT COLUMN: /m3 then Occasionnels (no vertical gap) -->
      <div class="col">
        <!-- /m3 -->
        <section class="sec sec--m3 sec--top">
          <button class="secH" type="button" @click="openM3 = !openM3" :aria-expanded="openM3">
            <div class="secT">Coûts / m³</div>
            <div class="secR mono">{{ fmt2(totalCoutM3) }}</div>
            <div class="chev">{{ openM3 ? "▾" : "▸" }}</div>
          </button>

          <div v-show="openM3" class="secB">
            <div v-for="it in itemsM3" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
              <div class="rowTop">
                <div class="lab">
                  <span class="txt">{{ it.label }}</span>
                  <span v-if="isLocked(it.path)" class="lk">contrat</span>
                </div>
                <div class="badge mono">{{ valFmt(it.path, "2") }}</div>
              </div>

              <div class="rowBot">
                <input
                  class="rng"
                  type="range"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onSlide(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="num"
                  type="number"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onInput(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Occasionnels -->
        <section class="sec sec--occ sec--bottom">
          <button class="secH" type="button" @click="openOcc = !openOcc" :aria-expanded="openOcc">
            <div class="secT">Coûts occasionnels</div>
            <div class="secR mono">{{ fmt0(totalOccasionnel) }}</div>
            <div class="chev">{{ openOcc ? "▾" : "▸" }}</div>
          </button>

          <div v-show="openOcc" class="secB">
            <div v-for="it in itemsOccasionnels" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
              <div class="rowTop">
                <div class="lab">
                  <span class="txt">{{ it.label }}</span>
                  <span v-if="isLocked(it.path)" class="lk">contrat</span>
                </div>
                <div class="badge mono">{{ valFmt(it.path, "0") }}</div>
              </div>

              <div class="rowBot">
                <input
                  class="rng"
                  type="range"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onSlide(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
                <input
                  class="num"
                  type="number"
                  :min="it.min"
                  :max="it.max"
                  :step="it.step"
                  :disabled="isLocked(it.path)"
                  :value="getByPath(it.path)"
                  @input="onInput(it.path, it.min, it.max, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wrap{display:flex;flex-direction:column;gap:10px}

/* header */
.head{
  position: sticky;
  top: 0;
  z-index: 5;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(6px);
  border:1px solid rgba(16,24,40,.10);
  border-radius:14px;
  padding:10px 10px;
  display:flex;
  gap:10px;
  align-items:center;
  justify-content:space-between;
}
.hLeft{display:flex;flex-direction:column;gap:2px}
.hTitle{font-weight:1000;font-size:13px;color:#0f172a;line-height:1}
.hSub{font-weight:800;font-size:11px;color:rgba(15,23,42,.55)}
.kpis{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.kpi{
  border:1px solid rgba(16,24,40,.10);
  background:#fff;
  border-radius:12px;
  padding:6px 8px;
  display:flex;
  flex-direction:column;
  gap:2px;
  min-width:92px;
}
.kLab{font-size:10px;font-weight:900;color:rgba(15,23,42,.55)}
.kVal{font-size:12px;font-weight:1000;color:rgba(15,23,42,.92)}
.mono{font-variant-numeric:tabular-nums}

/* ✅ two columns, but each column stacks blocks with NO vertical gap */
.grid2{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:10px; /* only horizontal separation effectively; vertical handled by .col */
}
@media (max-width: 980px){
  .grid2{grid-template-columns:1fr}
}
.col{
  display:flex;
  flex-direction:column;
  gap:0; /* ✅ NO vertical gap between blocks */
}

/* blocks */
.sec{
  border:1px solid rgba(16,24,40,.10);
  background:#fff;
  overflow:hidden;
}

/* ✅ make top/bottom stack like one card */
.sec--top{border-radius:14px 14px 0 0}
.sec--bottom{
  border-radius:0 0 14px 14px;
  border-top:0; /* ✅ no double border line */
}
/* in case col has only one block (rare) */
.col > .sec:only-child{border-radius:14px}

/* section header clickable */
.secH{
  width:100%;
  border:0;
  border-bottom:1px solid rgba(16,24,40,.08);
  padding:9px 10px;
  display:grid;
  grid-template-columns: 1fr auto auto;
  gap:8px;
  align-items:center;
  cursor:pointer;
}
.secT{font-weight:1000;font-size:12px;color:rgba(15,23,42,.88);text-align:left}
.secR{font-weight:1000;font-size:11px;color:rgba(15,23,42,.65)}
.chev{font-weight:1000;color:rgba(15,23,42,.55)}
.secB{padding:10px;display:flex;flex-direction:column;gap:8px}

/* ✅ subtle professional differentiation per block (light tint + accent bar) */
.sec--mens .secH{background: rgba(24,64,112,.045)}
.sec--maint .secH{background: rgba(101,129,77,.055)}
.sec--m3 .secH{background: rgba(32,184,232,.050)}
.sec--occ .secH{background: rgba(148,163,184,.060)}

.sec--mens{box-shadow: inset 4px 0 0 rgba(24,64,112,.18)}
.sec--maint{box-shadow: inset 4px 0 0 rgba(101,129,77,.20)}
.sec--m3{box-shadow: inset 4px 0 0 rgba(32,184,232,.22)}
.sec--occ{box-shadow: inset 4px 0 0 rgba(148,163,184,.22)}

/* rows */
.row{
  border:1px solid rgba(16,24,40,.10);
  border-radius:12px;
  background:#fcfcfd;
  padding:8px 8px;
  display:flex;
  flex-direction:column;
  gap:7px;
}
.row:hover{background:#fff}
.row.locked{opacity:.70}

.rowTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.lab{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.txt{
  font-weight:1000;font-size:12px;color:rgba(15,23,42,.86);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px;
}
.lk{
  font-size:10px;font-weight:1000;
  padding:2px 7px;border-radius:999px;
  border:1px solid rgba(2,132,199,.22);
  background:rgba(2,132,199,.08);
  color:rgba(2,132,199,.92);
}
.hint{font-size:10px;font-weight:900;color:rgba(15,23,42,.55);white-space:nowrap}

/* value badge */
.badge{
  font-weight:1000;
  font-size:12px;
  padding:4px 10px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,.12);
  background:#fff;
  color:rgba(15,23,42,.92);
  white-space:nowrap;
}

/* inputs */
.rowBot{display:flex;align-items:center;gap:10px}
.rng{flex:1;min-width:120px;height:16px}
.num{
  width:112px;
  height:30px;
  border-radius:10px;
  border:1px solid rgba(16,24,40,.14);
  background:#fff;
  padding:0 10px;
  font-weight:1000;
  color:rgba(15,23,42,.92);
  outline:none;
  text-align:right;
}
.num:focus{
  border-color: rgba(32,184,232,.45);
  box-shadow: 0 0 0 3px rgba(32,184,232,.14);
}
.num:disabled{
  background: rgba(15,23,42,.03);
  border-color: rgba(16,24,40,.10);
  cursor:not-allowed;
}

.auto{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-size:10.5px;
  font-weight:950;
  color:rgba(15,23,42,.70);
  padding:2px 7px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,.10);
  background: rgba(15,23,42,.02);
  white-space:nowrap;
}
.auto input{transform: translateY(1px);}
</style>