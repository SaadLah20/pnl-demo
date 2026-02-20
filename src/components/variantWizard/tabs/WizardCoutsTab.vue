<script setup lang="ts">
import { computed, onMounted, toRaw } from "vue";
import type { WizardCoutsState } from "../composables/useInitieeWizardState";

const props = defineProps<{
  modelValue: WizardCoutsState;
  /** locks par path ex: "coutMensuel.electricite": true */
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
   - terrain: 45 000
   - chargeur: 22 000
   - 3G: 500 (autres 0)
   - maintenance: 3000 sauf bassins & chargeur = 0
========================= */
onMounted(() => {
  const mv = props.modelValue;
  const next = deepClone(mv);

  // Mensuels defaults
  if (!isLocked("coutMensuel.locationTerrain") && n(next.coutMensuel.locationTerrain) === 0) next.coutMensuel.locationTerrain = 45000;
  if (!isLocked("coutMensuel.locationChargeur") && n(next.coutMensuel.locationChargeur) === 0) next.coutMensuel.locationChargeur = 22000;

  // 3G default 500
  if (!isLocked("coutMensuel.troisG") && n(next.coutMensuel.troisG) === 0) next.coutMensuel.troisG = 500;

  // Maintenance defaults: base 3000, but bassins & chargeur = 0
  // (On applique uniquement si valeur actuelle = 0 pour éviter de réécraser)
  const m = next.maintenance;
  if (!isLocked("maintenance.cab") && n(m.cab) === 0) m.cab = 3000;
  if (!isLocked("maintenance.elec") && n(m.elec) === 0) m.elec = 3000;
  if (!isLocked("maintenance.generale") && n(m.generale) === 0) m.generale = 3000;
  if (!isLocked("maintenance.preventive") && n(m.preventive) === 0) m.preventive = 3000;

  if (!isLocked("maintenance.chargeur")) m.chargeur = 0;
  if (!isLocked("maintenance.bassins")) m.bassins = 0;

  // Si quelque chose a changé, on patch
  const changed = JSON.stringify(mv) !== JSON.stringify(next);
  if (changed) emit("update:modelValue", next);
});

/* =========================
   Gasoil: auto vs manuel
   - Auto value depends on "groupe électrogène verrouillé" (ici: lock électricité)
     rate = 1.5 si locked, sinon 1.8
     auto = rate * volumeTotal * 12 / dureeMois
========================= */
const elecGroupLocked = computed(() => isLocked("coutMensuel.electricite") || isLocked("coutMensuel.location"));

const volTotal = computed(() => Math.max(0, n(props.volumeTotalM3)));
const duree = computed(() => Math.max(1, Math.trunc(n(props.dureeMois) || 1)));

const gasoilAutoRate = computed(() => (elecGroupLocked.value ? 1.5 : 1.8));
const gasoilAutoValue = computed(() => (gasoilAutoRate.value * volTotal.value * 12) / duree.value);

/* =========================
   Totaux (compact KPIs)
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
   RANGES (selon tes specs)
========================= */
const itemsM3 = [
  { label: "Eau", path: "coutM3.eau", min: 0, max: 10, step: 0.25, kind: "m3" },
  { label: "Qualité", path: "coutM3.qualite", min: 0, max: 10, step: 0.25, kind: "m3" },
  { label: "Déchets", path: "coutM3.dechets", min: 0, max: 10, step: 0.25, kind: "m3" },
] as const;

const itemsMensuels = [
  { label: "Électricité", path: "coutMensuel.electricite", min: 0, max: 80000, step: 100, kind: "dhm" },
  // ✅ Gasoil : case spéciale (auto/manu) => pas dans cette liste
  { label: "Location groupes", path: "coutMensuel.location", min: 0, max: 50000, step: 100, kind: "dhm" },
  { label: "Sécurité", path: "coutMensuel.securite", min: 0, max: 10000, step: 50, kind: "dhm" },
  { label: "Hébergements", path: "coutMensuel.hebergements", min: 0, max: 20000, step: 50, kind: "dhm" },
  { label: "Location terrain", path: "coutMensuel.locationTerrain", min: 0, max: 100000, step: 100, kind: "dhm" },

  { label: "Téléphone", path: "coutMensuel.telephone", min: 0, max: 5000, step: 10, kind: "dhm" },
  { label: "3G", path: "coutMensuel.troisG", min: 0, max: 5000, step: 10, kind: "dhm" },
  { label: "Taxe pro", path: "coutMensuel.taxeProfessionnelle", min: 0, max: 5000, step: 10, kind: "dhm" },

  { label: "Location véhicule", path: "coutMensuel.locationVehicule", min: 0, max: 40000, step: 100, kind: "dhm" },
  { label: "Location chargeur", path: "coutMensuel.locationChargeur", min: 0, max: 50000, step: 100, kind: "dhm" },
  { label: "Bungalows", path: "coutMensuel.locationBungalows", min: 0, max: 10000, step: 50, kind: "dhm" },
  { label: "EPI", path: "coutMensuel.epi", min: 0, max: 2000, step: 10, kind: "dhm" },
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
  const hasElec = o?.branchementElec !== undefined;
  const hasEau = o?.branchementEau !== undefined;

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

  if (hasEau) rows.push({ label: "Branchement eau", path: "coutOccasionnel.branchementEau", min: 0, max: 500_000, step: 500 });
  if (hasElec) rows.push({ label: "Branchement électricité", path: "coutOccasionnel.branchementElec", min: 0, max: 500_000, step: 500 });

  return rows;
});

/* =========================
   Handlers
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
  if (v) {
    // quand on réactive auto, on applique la valeur auto
    patchDeep(gasoilPath, gasoilAutoValue.value);
  }
}

const gasoilDisplay = computed(() => {
  if (gasoilIsAuto.value) return gasoilAutoValue.value;
  return getByPath(gasoilPath);
});

/**
 * Si auto actif: on force la valeur à suivre l’auto (volume/durée)
 * sans empêcher un passage en manuel.
 */
function syncGasoilAuto() {
  if (!gasoilIsAuto.value) return;
  if (isLocked(gasoilPath)) return;
  patchDeep(gasoilPath, gasoilAutoValue.value);
}
</script>

<template>
  <div class="wrap">
    <!-- ✅ Header ultra compact -->
    <div class="head">
      <div class="hTitle">Coûts</div>
      <div class="hKpis">
        <span class="pill">/m³ {{ fmt2(totalCoutM3) }}</span>
        <span class="pill">Mensuel {{ fmt0(totalMensuel) }}</span>
        <span class="pill">Maint. {{ fmt0(totalMaintenance) }}</span>
        <span class="pill">Occas. {{ fmt0(totalOccasionnel) }}</span>
      </div>
    </div>

    <!-- ✅ Grid 2 colonnes (compact) -->
    <div class="grid2">
      <!-- =======================
           Coûts /m3
      ======================== -->
      <section class="sec">
        <div class="secH">
          <div class="secT">Coûts / m³</div>
          <div class="secR mono">{{ fmt2(totalCoutM3) }}</div>
        </div>

        <div class="secB">
          <div v-for="it in itemsM3" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
            <div class="rowTop">
              <div class="lab">
                <span class="txt">{{ it.label }}</span>
                <span v-if="isLocked(it.path)" class="lk">contrat</span>
              </div>
              <div class="val mono">
                {{ fmt2(getByPath(it.path)) }}
              </div>
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

      <!-- =======================
           Coûts mensuels
      ======================== -->
      <section class="sec">
        <div class="secH">
          <div class="secT">Coûts mensuels</div>
          <div class="secR mono">{{ fmt0(totalMensuel) }}</div>
        </div>

        <div class="secB">
          <!-- ✅ Gasoil spécial: auto/manu -->
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
                  {{ elecGroupLocked ? "GE verrouillé" : "GE libre" }} · {{ gasoilAutoRate.toFixed(1) }}DH · vol {{ fmt0(volTotal) }} · {{ duree }}m
                </span>
              </div>

              <div class="val mono">
                {{ fmt0(gasoilDisplay) }}
              </div>
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
              <button
                v-if="gasoilIsAuto && !isLocked(gasoilPath)"
                class="miniBtn"
                type="button"
                @click="syncGasoilAuto()"
                title="Recalculer selon volume/durée"
              >
                ↻
              </button>
            </div>
          </div>

          <!-- ✅ autres mensuels -->
          <div v-for="it in itemsMensuels" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
            <div class="rowTop">
              <div class="lab">
                <span class="txt">{{ it.label }}</span>
                <span v-if="isLocked(it.path)" class="lk">contrat</span>
              </div>
              <div class="val mono">{{ fmt0(getByPath(it.path)) }}</div>
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

      <!-- =======================
           Maintenance
      ======================== -->
      <section class="sec">
        <div class="secH">
          <div class="secT">Maintenance</div>
          <div class="secR mono">{{ fmt0(totalMaintenance) }}</div>
        </div>

        <div class="secB">
          <div v-for="it in itemsMaintenance" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
            <div class="rowTop">
              <div class="lab">
                <span class="txt">{{ it.label }}</span>
                <span v-if="isLocked(it.path)" class="lk">contrat</span>
              </div>
              <div class="val mono">{{ fmt0(getByPath(it.path)) }}</div>
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

      <!-- =======================
           Occasionnels
      ======================== -->
      <section class="sec">
        <div class="secH">
          <div class="secT">Coûts occasionnels</div>
          <div class="secR mono">{{ fmt0(totalOccasionnel) }}</div>
        </div>

        <div class="secB">
          <div v-for="it in itemsOccasionnels" :key="it.path" class="row" :class="{ locked: isLocked(it.path) }">
            <div class="rowTop">
              <div class="lab">
                <span class="txt">{{ it.label }}</span>
                <span v-if="isLocked(it.path)" class="lk">contrat</span>
              </div>
              <div class="val mono">{{ fmt0(getByPath(it.path)) }}</div>
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
</template>

<style scoped>
/* =========================
   Ultra compact UX
========================= */
.wrap{display:flex;flex-direction:column;gap:8px}

.head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.hTitle{
  font-weight:950;
  color:#0f172a;
  font-size:13px;
  line-height:1;
}
.hKpis{
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  justify-content:flex-end;
}
.pill{
  border:1px solid rgba(16,24,40,.12);
  background:#fff;
  border-radius:999px;
  padding:2px 8px;
  font-weight:950;
  font-size:11px;
  color:rgba(15,23,42,.82);
}

.grid2{
  display:grid;
  grid-template-columns: 1fr 1fr;
  gap:8px;
}
@media (max-width: 980px){
  .grid2{grid-template-columns:1fr}
}

.sec{
  border:1px solid rgba(16,24,40,.10);
  background:#fff;
  border-radius:14px;
  overflow:hidden;
}
.secH{
  padding:7px 9px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  background: rgba(15,23,42,.02);
  border-bottom:1px solid rgba(16,24,40,.08);
}
.secT{
  font-weight:950;
  font-size:12px;
  color:rgba(15,23,42,.88);
}
.secR{
  font-weight:950;
  font-size:11px;
  color:rgba(15,23,42,.70);
}
.secB{
  padding:7px 9px;
  display:flex;
  flex-direction:column;
  gap:7px;
}

.row{
  border:1px solid rgba(16,24,40,.10);
  border-radius:12px;
  background:#fcfcfd;
  padding:7px 8px;
  display:flex;
  flex-direction:column;
  gap:6px;
}
.row.locked{opacity:.72}

.rowTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
}
.lab{
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0;
  flex-wrap:wrap;
}
.txt{
  font-weight:950;
  font-size:12px;
  color:rgba(15,23,42,.84);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width: 220px;
}
.lk{
  font-size:10px;
  font-weight:950;
  padding:2px 6px;
  border-radius:999px;
  border:1px solid rgba(2,132,199,.22);
  background:rgba(2,132,199,.08);
  color:rgba(2,132,199,.92);
  white-space:nowrap;
}
.hint{
  font-size:10px;
  font-weight:900;
  color:rgba(15,23,42,.55);
  white-space:nowrap;
}

.val{
  font-weight:950;
  font-size:12px;
  color:rgba(15,23,42,.92);
  white-space:nowrap;
}

.rowBot{
  display:flex;
  align-items:center;
  gap:8px;
}
.rng{flex:1; min-width: 120px;}
.num{
  width: 108px;
  height: 28px;
  border-radius:10px;
  border:1px solid rgba(16,24,40,.14);
  background:#fff;
  padding: 0 8px;
  font-weight:950;
  color:rgba(15,23,42,.92);
  outline:none;
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
  padding:2px 6px;
  border-radius:999px;
  border:1px solid rgba(16,24,40,.10);
  background: rgba(15,23,42,.02);
  white-space:nowrap;
}
.auto input{transform: translateY(1px);}

.miniBtn{
  height:28px;
  min-width: 32px;
  border-radius:10px;
  border:1px solid rgba(16,24,40,.14);
  background: rgba(15,23,42,.03);
  font-weight:950;
  cursor:pointer;
}
.miniBtn:hover{
  background: rgba(2,132,199,.08);
  border-color: rgba(2,132,199,.18);
}

.mono{font-variant-numeric:tabular-nums}
</style>