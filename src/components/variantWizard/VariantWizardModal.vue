<!-- ✅ src/components/variantWizard/VariantWizardModal.vue
     Wizard Variantes
     - INITIEE: wizard multi-onglets (sliders only) selon doc
     - COMPOSEE: UI existante conservée
-->
<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";

import WizardGeneralTab from "@/components/variantWizard/tabs/WizardGeneralTab.vue";
import WizardFormulesTab from "@/components/variantWizard/tabs/WizardFormulesTab.vue";
import WizardCoutsTab from "@/components/variantWizard/tabs/WizardCoutsTab.vue";
import WizardEmployesTab from "@/components/variantWizard/tabs/WizardEmployesTab.vue";

import {
  createDefaultInitieeWizardState,
  type InitieeWizardState,
} from "@/components/variantWizard/composables/useInitieeWizardState";

export type VariantCreateMode = "INITIEE" | "COMPOSEE";

/** Payload INITIEE */
export type InitieePayload = {
  wizard: InitieeWizardState;
};

export type ComposeSectionKey =
  | "transport"
  | "cab"
  | "maintenance"
  | "coutM3"
  | "coutMensuel"
  | "coutOccasionnel"
  | "employes"
  | "autresCouts"
  | "formules"
  | "majorations"
  | "devis";

export type ComposePayload = {
  baseVariantId: string;
  bySection: Partial<
    Record<
      ComposeSectionKey,
      | null
      | "ZERO"
      | string
      | {
          fromVariantId: string;
        }
    >
  >;
};

const props = defineProps<{
  open: boolean;
  mode: VariantCreateMode;

  /** ✅ utile pour INITIEE: locks (CAB client, durée, etc.) */
  contract?: any;

  /** COMPOSEE */
  allVariants?: Array<{
    id: string;
    title: string;
    contractTitle?: string | null;
    pnlTitle?: string | null;
  }>;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit-initiee", payload: InitieePayload): void;
  (e: "submit-composee", payload: ComposePayload): void;
}>();

const isOpen = computed(() => !!props.open);
const mode = computed(() => props.mode);

function norm(x: any) {
  return String(x ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isChargeClient(v: any): boolean {
  if (v === true) return true;
  if (typeof v === "number" && Number.isFinite(v)) return v === 1;
  const s = norm(v);
  return s.includes("CLIENT");
}

const cabChargeClient = computed<boolean>(() => {
  const c = props.contract ?? {};
  const v = norm(c.cab);
  if (!v) return false;
  return v.includes("CLIENT");
});

const initWizard = ref<InitieeWizardState | null>(null);

/** =========================
 *  Locks (contrat -> champs forcés à 0 + disabled)
========================= */
const eauLocked = computed(() => isChargeClient(props.contract?.consoEau));

// ✅ Électricité + Location groupes: contractuel via Contract.consoElec (aligné avec CoutMensuelPage)
const elecAndGroupsLocked = computed(() =>
  isChargeClient(
    props.contract?.consoElec ??
      props.contract?.consoElectricite ??
      props.contract?.consommationElectricite ??
      props.contract?.electricite,
  ),
);

// ✅ Location terrain contractuel via Contract.terrain (aligné avec CoutMensuelPage)
const locationTerrainLocked = computed(() => isChargeClient(props.contract?.terrain ?? props.contract?.locationTerrain));

// ✅ Occasionnel: transport contractuel
const transportOccasionnelLocked = computed(() => isChargeClient(props.contract?.transport));

// ✅ branchements contractuels
const branchementElecLocked = computed(() => isChargeClient(props.contract?.branchementElec ?? props.contract?.branchementElectricite));
const branchementEauLocked = computed(() => isChargeClient(props.contract?.branchementEau));

const locationChargeurLocked = computed(() => isChargeClient(props.contract?.chargeuse ?? props.contract?.locationChargeur));
const genieCivilLocked = computed(() => isChargeClient(props.contract?.genieCivil));
const installationLocked = computed(() => isChargeClient(props.contract?.installation));

// ✅ Maintenance: TOUT contractuel
const maintenanceLockedAll = computed(() => isChargeClient(props.contract?.maintenance));

const locksCouts = computed(() => ({
  // m3
  "coutM3.eau": eauLocked.value,

  // mensuel
  "coutMensuel.electricite": elecAndGroupsLocked.value,
  "coutMensuel.location": elecAndGroupsLocked.value,
  "coutMensuel.locationTerrain": locationTerrainLocked.value,
  "coutMensuel.locationChargeur": locationChargeurLocked.value,

  // maintenance (tout)
  "maintenance.cab": maintenanceLockedAll.value,
  "maintenance.elec": maintenanceLockedAll.value,
  "maintenance.chargeur": maintenanceLockedAll.value,
  "maintenance.generale": maintenanceLockedAll.value,
  "maintenance.bassins": maintenanceLockedAll.value,
  "maintenance.preventive": maintenanceLockedAll.value,

  // occasionnel
  "coutOccasionnel.genieCivil": genieCivilLocked.value,
  "coutOccasionnel.installation": installationLocked.value,
  "coutOccasionnel.transport": transportOccasionnelLocked.value,
  "coutOccasionnel.branchementElec": branchementElecLocked.value,
  "coutOccasionnel.branchementEau": branchementEauLocked.value,
}));

const dureeMois = computed(() => {
  const d = Number(props.contract?.dureeMois ?? 0);
  return Number.isFinite(d) && d > 0 ? Math.trunc(d) : 1;
});

/** ✅ Volume TOTAL = somme des volumes par formule (plus de notion "global") */
const volumeTotalM3 = computed(() => {
  const w = initWizard.value;
  if (!w) return 0;
  return (w.formules.lines ?? []).reduce((s, l) => s + (Number(l.volumeM3) || 0), 0);
});

function applyContractLocksToWizard(w: InitieeWizardState) {
  if (eauLocked.value) w.couts.coutM3.eau = 0;

  if (elecAndGroupsLocked.value) {
    w.couts.coutMensuel.electricite = 0;
    w.couts.coutMensuel.location = 0; // ✅ Location groupes
  }
  if (locationTerrainLocked.value) w.couts.coutMensuel.locationTerrain = 0;
  if (locationChargeurLocked.value) w.couts.coutMensuel.locationChargeur = 0;

  // ✅ maintenance: tout à 0 si client
  if (maintenanceLockedAll.value) {
    w.couts.maintenance.cab = 0;
    w.couts.maintenance.elec = 0;
    w.couts.maintenance.chargeur = 0;
    w.couts.maintenance.generale = 0;
    w.couts.maintenance.bassins = 0;
    w.couts.maintenance.preventive = 0;
  }

  if (genieCivilLocked.value) w.couts.coutOccasionnel.genieCivil = 0;
  if (installationLocked.value) w.couts.coutOccasionnel.installation = 0;
  if (transportOccasionnelLocked.value) w.couts.coutOccasionnel.transport = 0;

  // ✅ branchements
  if (branchementElecLocked.value && (w.couts.coutOccasionnel as any).branchementElec !== undefined) {
    (w.couts.coutOccasionnel as any).branchementElec = 0;
  }
  if (branchementEauLocked.value && (w.couts.coutOccasionnel as any).branchementEau !== undefined) {
    (w.couts.coutOccasionnel as any).branchementEau = 0;
  }

  if (cabChargeClient.value) w.general.amortMois = 0;
}

type InitTabKey = "general" | "formules" | "couts" | "employes";
const tab = ref<InitTabKey>("general");
const initieeReady = computed(() => !!initWizard.value);

/* =========================================================
   COMPOSEE (inchangé)
========================================================= */
const compose = reactive<ComposePayload>({
  baseVariantId: "",
  bySection: {},
});

function setAllSectionsZero() {
  const keys: ComposeSectionKey[] = [
    "transport",
    "cab",
    "maintenance",
    "coutM3",
    "coutMensuel",
    "coutOccasionnel",
    "employes",
    "autresCouts",
    "formules",
    "majorations",
    "devis",
  ];
  const next: any = {};
  for (const k of keys) next[k] = "ZERO";
  compose.bySection = next;
}

const composeQuery = ref("");
const composeOnlySameContract = ref(false);

function labelV(v: any) {
  const parts = [v.title];
  if (v.contractTitle) parts.push(v.contractTitle);
  if (v.pnlTitle) parts.push(v.pnlTitle);
  return parts.filter(Boolean).join(" · ");
}

const allVariantChoices = computed(() => {
  const all = props.allVariants ?? [];
  const q = String(composeQuery.value ?? "").toLowerCase().trim();

  let out = all;

  if (composeOnlySameContract.value && props.contract?.id) {
    // si tu filtres côté parent, garde tel quel
    out = out;
  }

  if (q) out = out.filter((v) => labelV(v).toLowerCase().includes(q));
  return out.slice(0, 250);
});

const composeValid = computed(() => !!String(compose.baseVariantId ?? "").trim());

/* =========================================================
   Lifecycle
========================================================= */
watch(
  () => props.open,
  async (v) => {
    if (!v) return;

    if (props.mode === "INITIEE") {
      initWizard.value = createDefaultInitieeWizardState({
        cabChargeClient: cabChargeClient.value,
        contractPostes: props.contract?.postes ?? null,
      });

      if (initWizard.value) applyContractLocksToWizard(initWizard.value);
      tab.value = "general";
    }

    if (props.mode === "COMPOSEE") {
      compose.baseVariantId = "";
      setAllSectionsZero();
      composeQuery.value = "";
      composeOnlySameContract.value = false;
    }

    await nextTick();
  }
);

function close() {
  emit("close");
}

function submit() {
  if (props.mode === "INITIEE") {
    if (!initWizard.value) return;

    // ✅ Gasoil auto si lié au volume TOTAL
    if (initWizard.value.couts.coutMensuel.gasoilLinked) {
      const vol = Math.max(0, Number(volumeTotalM3.value) || 0);
      const d = Math.max(1, Number(dureeMois.value) || 1);
      initWizard.value.couts.coutMensuel.gasoil = (1.8 * vol * 12) / d;
    }

    // ✅ Re-apply locks avant submit (sécurité)
    applyContractLocksToWizard(initWizard.value);

    emit("submit-initiee", { wizard: initWizard.value });
    return;
  }

  if (!composeValid.value) return;
  emit("submit-composee", { baseVariantId: String(compose.baseVariantId), bySection: { ...compose.bySection } });
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") close();
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close()" @keydown="onKeydown" tabindex="-1">
      <div class="md" role="dialog" aria-modal="true" aria-label="Assistant création variante">
        <!-- Header -->
        <div class="hd">
          <div class="ttl">Créer une variante</div>

          <div class="tabs" v-if="mode === 'INITIEE'">
            <button class="tb" :class="{ on: tab === 'general' }" @click="tab = 'general'" type="button">Général</button>
            <button class="tb" :class="{ on: tab === 'formules' }" @click="tab = 'formules'" type="button">Formules</button>
            <button class="tb" :class="{ on: tab === 'couts' }" @click="tab = 'couts'" type="button">Coûts</button>
            <button class="tb" :class="{ on: tab === 'employes' }" @click="tab = 'employes'" type="button">Employés</button>
          </div>

          <button class="x" @click="close()" type="button">✕</button>
        </div>

        <!-- Body -->
        <div class="bd">
          <!-- INITIEE -->
          <div v-if="mode === 'INITIEE'">
            <div v-if="!initieeReady" class="box">Chargement…</div>

            <template v-else>
              <WizardGeneralTab
                v-if="tab === 'general'"
                v-model="initWizard!.general"
                :cab-charge-client="cabChargeClient"
              />

              <WizardFormulesTab
                v-else-if="tab === 'formules'"
                v-model="initWizard!.formules"
                :contract-id="contract?.id ?? ''"
              />

              <WizardCoutsTab
                v-else-if="tab === 'couts'"
                v-model="initWizard!.couts"
                :locks="locksCouts"
                :volume-total-m3="volumeTotalM3"
                :duree-mois="dureeMois"
              />

              <WizardEmployesTab
                v-else-if="tab === 'employes'"
                v-model="initWizard!.employes"
              />
            </template>
          </div>

          <!-- COMPOSEE -->
          <div v-else class="stack">
            <div class="box">
              <div class="boxT">Base + filtres</div>

              <div class="grid">
                <div class="f f--full">
                  <div class="k">Variante de base</div>
                  <select class="in in--strong" v-model="compose.baseVariantId">
                    <option value="">— Sélectionner —</option>
                    <option v-for="v in allVariantChoices" :key="v.id" :value="v.id">
                      {{ labelV(v) }}
                    </option>
                  </select>
                </div>

                <div class="f">
                  <div class="k">Filtre</div>
                  <input class="in" v-model="composeQuery" placeholder="Recherche…" />
                </div>

                <div class="f f--chk">
                  <label class="chk">
                    <input type="checkbox" v-model="composeOnlySameContract" />
                    Même contrat
                  </label>
                </div>
              </div>
            </div>

            <div class="box">
              <div class="boxT">Sections</div>
              <div class="mutedSmall">Zéro = ne copie pas</div>

              <div class="sections">
                <div v-for="(v, k) in compose.bySection" :key="k" class="sec">
                  <div class="k2">{{ k }}</div>
                  <select class="in" v-model="(compose.bySection as any)[k]">
                    <option value="ZERO">ZERO</option>
                    <option v-for="v2 in allVariantChoices" :key="v2.id" :value="v2.id">{{ v2.title }}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="ft">
          <div class="ftL">
            <div v-if="mode === 'INITIEE'" class="miniHint">
              Sliders + clics uniquement (pas de clavier).
            </div>
          </div>

          <div class="ftR">
            <button class="btn btn--ghost" @click="close()" type="button">Annuler</button>
            <button class="btn btn--pri" @click="submit()" type="button">Créer</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ✅ Light modal based on global tokens in src/style.css (Teleports OK) */
.ov{
  position:fixed; inset:0;
  background: rgba(15,23,42,.28);
  backdrop-filter: blur(3px);
  display:flex; align-items:center; justify-content:center;
  z-index: 1000000;
  padding: 12px;
}

.md{
  width: min(980px, 100%);
  max-height: min(640px, 92vh);
  background: var(--card, #fff);
  color: rgba(15,23,42,.92);
  border: 1px solid var(--border, rgba(16,24,40,.12));
  border-radius: 18px;
  box-shadow: 0 22px 70px rgba(0,0,0,.25);
  display:flex; flex-direction:column;
  overflow:hidden;
}

.hd{
  display:flex; align-items:center; gap:10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, rgba(16,24,40,.12));
  background: rgba(255,255,255,.72);
}

.ttl{ font-weight: 900; font-size: 14px; white-space: nowrap; }

.tabs{ display:flex; gap:6px; flex:1; overflow:hidden; }

.tb{
  border: 1px solid var(--border, rgba(16,24,40,.14));
  background: rgba(15,23,42,.04);
  color: rgba(15,23,42,.9);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.tb.on{
  background: rgba(24,64,112,.10);
  border-color: rgba(24,64,112,.28);
}

.x{
  margin-left:auto;
  border:none;
  background: transparent;
  color: rgba(15,23,42,.75);
  font-size: 16px;
  cursor: pointer;
}

.bd{ padding: 10px 12px; overflow:auto; }

.ft{
  display:flex; align-items:center; justify-content:space-between;
  gap:10px;
  padding: 10px 12px;
  border-top: 1px solid var(--border, rgba(16,24,40,.12));
  background: rgba(255,255,255,.72);
}

.ftR{ display:flex; gap:8px; }

.btn{
  border-radius: 12px;
  padding: 8px 12px;
  font-size: 13px;
  border: 1px solid var(--border, rgba(16,24,40,.14));
  background: rgba(15,23,42,.04);
  color: rgba(15,23,42,.92);
  cursor: pointer;
}
.btn--pri{
  background: rgba(101,129,77,.14);
  border-color: rgba(101,129,77,.28);
}
.btn--ghost{ background: transparent; }

.box{
  padding: 10px;
  border: 1px dashed rgba(16,24,40,.18);
  border-radius: 14px;
  font-size: 12px;
  color: rgba(15,23,42,.82);
}

.stack{ display:flex; flex-direction:column; gap:10px; }
.grid{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
.f--full{ grid-column: 1 / -1; }
.f{ display:flex; flex-direction:column; gap:6px; }
.k{ font-size: 12px; font-weight: 800; color: rgba(15,23,42,.86); }

.in{
  border: 1px solid rgba(16,24,40,.16);
  background: #fff;
  color: rgba(15,23,42,.92);
  border-radius: 12px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}
.in:focus{
  border-color: rgba(24,64,112,.35);
  box-shadow: 0 0 0 3px rgba(24,64,112,.12);
}
.in--strong{
  background: rgba(238,243,250,.9);
}

.f--chk{ justify-content:flex-end; }
.chk{ display:flex; align-items:center; gap:8px; font-size: 12px; color: rgba(15,23,42,.82); }

.sections{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px; }
.sec{ display:flex; flex-direction:column; gap:6px; }

.k2{ font-size:12px; font-weight:700; opacity:.9; }
.mutedSmall{ font-size:12px; opacity:.7; }
.miniHint{ font-size:12px; opacity:.72; white-space:nowrap; }

@media (max-width: 720px){
  .grid{ grid-template-columns: 1fr; }
  .sections{ grid-template-columns: 1fr; }
  .tabs{ flex-wrap: wrap; }
}
</style>