<!-- src/components/SectionImportModal.vue (FICHIER COMPLET / FIXES + UI polish) -->
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, nextTick } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import { computeHeaderKpis } from "@/services/kpis/headerkpis";
import { contractUiTitle } from "@/services/contractTitle";

export type ImportCopyPreset = "FULL" | "ZERO" | "QTY_ONLY" | "MOMD_ONLY" | "QTY_MOMD";
type ImportScope = "SAME_PNL" | "ALL_PNLS";

type VariantRow = {
  variantId: string;
  title: string;
  status: string;

  pnlId: string;
  pnlLabel: string;

  contractId: string;
  contractLabel: string;

  ebit: number;

  _variant: any;
  _contract: any;
};

const props = defineProps<{
  modelValue: boolean;
  sectionLabel: string;
  targetVariantId: string | null;
  enablePresets?: boolean;
  sectionKey?: string; // ex: "maintenance" | "transport" | "cab" | "coutM3" | ...
}>();

const emit = defineEmits<{
  (e: "update:modelValue", v: boolean): void;
  (e: "close"): void;
  (e: "apply", payload: { sourceVariantId: string; copy: ImportCopyPreset }): void;
}>();

const store = usePnlStore();
const isOpen = computed(() => !!props.modelValue);

const q = ref("");
const picked = ref<string | null>(null);
const copy = ref<ImportCopyPreset>("FULL");
const scope = ref<ImportScope>("SAME_PNL");

const pnlFilter = ref<string>("ALL");
const contractFilter = ref<string>("ALL");

/* =========================
   Close / ESC / scroll lock
========================= */
function close() {
  emit("update:modelValue", false);
  emit("close");
}
function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) return;
  if (e.key === "Escape") close();
}
function lockBodyScroll(lock: boolean) {
  const el = document?.body;
  if (!el) return;
  el.style.overflow = lock ? "hidden" : "";
}
watch(
  () => isOpen.value,
  (open) => {
    lockBodyScroll(open);
    if (open) window.addEventListener("keydown", onKeydown);
    else window.removeEventListener("keydown", onKeydown);
  },
  { immediate: true }
);
onBeforeUnmount(() => {
  lockBodyScroll(false);
  window.removeEventListener("keydown", onKeydown);
});

/* =========================
   Helpers
========================= */
function n2(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function fmt(x: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(n2(x));
}
function computeKpisFor(v: any, dureeMois: number) {
  try {
    return computeHeaderKpis(v, dureeMois, null, null, false);
  } catch {
    return null;
  }
}
function fmt0(x: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n2(x));
}
function setPicked(id: string) {
  picked.value = id;
}

/* =========================
   SAME_PNL resolve
========================= */
const targetPnlId = computed<string | null>(() => {
  const t = String(props.targetVariantId ?? "").trim();
  if (!t) return null;

  for (const p of (store as any).pnls ?? []) {
    const pid = String((p as any)?.id ?? "");
    for (const c of (p as any)?.contracts ?? []) {
      for (const v of (c as any)?.variants ?? []) {
        if (String(v?.id ?? "") === t) return pid;
      }
    }
  }
  return null;
});
const canSamePnl = computed(() => !!targetPnlId.value);

/* =========================
   Section key inference (FIX coutM3)
========================= */
function inferSectionKeyFromLabel(label: string): string | null {
  const raw = String(label ?? "");
  const s = raw.toLowerCase();

  const has = (k: string) => s.includes(k);

  if (has("maintenance")) return "maintenance";
  if (has("transport")) return "transport";
  if (has("cab")) return "cab";

  // ✅ FIX: m3 / m³ / coût au m3 / coût au m³ / cout m3
  if (has("m³") || has("m3") || has("au m3") || has("au m³") || has("coût au") || has("cout au")) return "coutM3";

  if (has("mensuel")) return "coutMensuel";
  if (has("occasion")) return "coutOccasionnel";
  if (has("employ")) return "employes";
  if (has("autres") || has("autre coût") || has("autres coûts")) return "autresCouts";
  if (has("formule")) return "formules";
  if (has("matière") || has("matiere") || has("mp")) return "mp";
  if (has("devis")) return "devis";

  return null;
}

const effectiveSectionKey = computed<string | null>(() => {
  const k = String(props.sectionKey ?? "").trim();
  if (k) return k;
  return inferSectionKeyFromLabel(props.sectionLabel);
});

/* =========================
   Tooltip (Teleport to body + fixed + auto placement)
========================= */
const tipOpenFor = ref<string | null>(null);
const tipText = ref<string>("");
const tipTitle = ref<string>("");
const tipXY = ref<{ x: number; y: number }>({ x: 0, y: 0 });
const tipPlacement = ref<"top" | "bottom">("top");

function openTip(e: MouseEvent, row: VariantRow) {
  tipOpenFor.value = row.variantId;
  tipTitle.value = `Aperçu — ${props.sectionLabel}`;
  tipText.value = sectionPreviewText(row._variant);

  const el = e.currentTarget as HTMLElement | null;
  if (!el) return;

  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // base: centered on icon
  let x = r.left + r.width / 2;

  // decide top/bottom
  const preferTop = r.top > vh * 0.55;
  tipPlacement.value = preferTop ? "top" : "bottom";

  // y reference point
  const y = preferTop ? r.top : r.bottom;

  // clamp x inside viewport with margin
  const margin = 16;
  x = Math.max(margin, Math.min(vw - margin, x));

  tipXY.value = { x, y };

  // after paint, we may still adjust if overflow (measure)
  nextTick(() => {
    const tipEl = document.getElementById("import-tip");
    if (!tipEl) return;
    const tr = tipEl.getBoundingClientRect();

    let nx = tipXY.value.x;
    let ny = tipXY.value.y;

    // adjust X if overflow
    if (tr.left < margin) nx += margin - tr.left;
    if (tr.right > vw - margin) nx -= tr.right - (vw - margin);

    // adjust Y if overflow
    if (tr.top < margin) {
      tipPlacement.value = "bottom";
      ny = r.bottom;
    }
    if (tr.bottom > vh - margin) {
      tipPlacement.value = "top";
      ny = r.top;
    }

    tipXY.value = { x: nx, y: ny };
  });
}

function closeTip() {
  tipOpenFor.value = null;
}

/* =========================
   Section preview (clean labels, hide 0)
========================= */
function sectionPreviewText(variant: any): string {
  const key = effectiveSectionKey.value;
  if (!key) return "Aperçu indisponible (sectionKey inconnu).";

  const s = variant?.[key];
  if (!s) return "Section vide.";

  // helpers
  const lines: string[] = [];
  const add = (label: string, value: any, suffix = "", digits = 2) => {
    if (value === null || value === undefined) return;
    const num = typeof value === "number" ? value : Number.isFinite(Number(value)) ? Number(value) : null;
    if (num !== null) {
      if (num === 0) return; // ✅ hide 0
      lines.push(`${label}: ${fmt(num, digits)}${suffix}`);
      return;
    }
    const str = String(value).trim();
    if (!str) return;
    lines.push(`${label}: ${str}${suffix}`);
  };
  const addBool = (label: string, b: any) => {
    if (b === null || b === undefined) return;
    if (b === false) return; // hide false
    lines.push(`${label}: Oui`);
  };

  // items sections
  if (key === "autresCouts") {
    const items = s?.items ?? variant?.autreCoutItems ?? [];
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return "Aucun item.";
    const top = arr.slice(0, 6).map((x: any) => {
      const lab = String(x?.label ?? "—").trim();
      const u = String(x?.unite ?? "-").trim();
      const v = n2(x?.valeur);
      return `${lab} (${u}) = ${fmt(v)}`;
    });
    return `Items (${arr.length})\n- ${top.join("\n- ")}${arr.length > 6 ? "\n…" : ""}`;
  }

  if (key === "formules") {
    const items = s?.items ?? variant?.variantFormules ?? [];
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return "Aucune formule.";
    const top = arr.slice(0, 6).map((x: any) => {
      const lab = x?.formule?.label ?? x?.label ?? x?.formuleId ?? "—";
      const vol = n2(x?.volumeM3);
      const momd = n2(x?.momd);
      const cmpo = x?.cmpOverride != null ? `, CMP override=${fmt(x?.cmpOverride)}` : "";
      return `${String(lab).trim()}: vol=${fmt(vol)} m³, MOMD=${fmt(momd)}${cmpo}`;
    });
    return `Formules (${arr.length})\n- ${top.join("\n- ")}${arr.length > 6 ? "\n…" : ""}`;
  }

  if (key === "mp") {
    const items = s?.items ?? variant?.variantMps ?? [];
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return "Aucune MP.";
    const top = arr.slice(0, 6).map((x: any) => {
      const lab = x?.mp?.label ?? x?.label ?? x?.mpId ?? "—";
      const prix = x?.prix != null ? fmt(x?.prix) : "-";
      return `${String(lab).trim()}: prix=${prix}`;
    });
    return `MP (${arr.length})\n- ${top.join("\n- ")}${arr.length > 6 ? "\n…" : ""}`;
  }

  // field sections (labels “propres”)
  if (key === "maintenance") {
    add("CAB", s.cab);
    add("Électricité", s.elec);
    add("Chargeur", s.chargeur);
    add("Générale", s.generale);
    add("Bassins", s.bassins);
    add("Préventive", s.preventive);
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "transport") {
    add("Type", s.type);
    add("Prix moyen", s.prixMoyen);
    addBool("Pompage", s.includePompage);
    if (s.includePompage) {
      add("Volume pompe", s.volumePompePct, " %");
      add("PA pompe", s.prixAchatPompe);
      add("PV pompe", s.prixVentePompe);
    }
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "cab") {
    add("État", s.etat);
    add("Mode", s.mode);
    add("Capacité", s.capaciteM3, " m³");
    add("Amortissement", s.amortMois, " mois", 0);
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "coutM3") {
    add("Eau", s.eau);
    add("Qualité", s.qualite);
    add("Déchets", s.dechets);
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "coutMensuel") {
    add("Électricité", s.electricite);
    add("Gasoil", s.gasoil);
    add("Location", s.location);
    add("Sécurité", s.securite);
    add("Hébergements", s.hebergements);
    add("Location terrain", s.locationTerrain);
    add("Téléphone", s.telephone);
    add("3G", s.troisG);
    add("Taxe prof.", s.taxeProfessionnelle);
    add("Location véhicule", s.locationVehicule);
    add("Location ambulance", s.locationAmbulance);
    add("Location bungalows", s.locationBungalows);
    add("EPI", s.epi);
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "coutOccasionnel") {
    add("Génie civil", s.genieCivil);
    add("Installation", s.installation);
    add("Transport", s.transport);
    add("Démontage", s.demontage);
    add("Remise point centrale", s.remisePointCentrale);
    add("Silots", s.silots);
    add("Local adjuvant", s.localAdjuvant);
    add("Bungalows", s.bungalows);
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  if (key === "employes") {
    const pushRole = (label: string, nb: any, cout: any) => {
      const n = n2(nb);
      const c = n2(cout);
      if (n === 0 && c === 0) return;
      lines.push(`${label}: nb=${fmt(n, 0)}, coût=${fmt(c)}`);
    };

    pushRole("Responsable", s.responsableNb, s.responsableCout);
    pushRole("Centralistes", s.centralistesNb, s.centralistesCout);
    pushRole("Manœuvre", s.manoeuvreNb, s.manoeuvreCout);
    pushRole("Coord. exploitation", s.coordinateurExploitationNb, s.coordinateurExploitationCout);
    pushRole("Technicien labo", s.technicienLaboNb, s.technicienLaboCout);
    pushRole("Femme ménage", s.femmeMenageNb, s.femmeMenageCout);
    pushRole("Gardien", s.gardienNb, s.gardienCout);
    pushRole("Maintenancier", s.maintenancierNb, s.maintenancierCout);
    pushRole("Panier repas", s.panierRepasNb, s.panierRepasCout);

    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  // generic primitive dump (hide 0)
  if (typeof s === "object" && !Array.isArray(s)) {
    for (const k of Object.keys(s)) {
      const v = (s as any)[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "object") continue;
      if (typeof v === "number" && v === 0) continue;
      if (typeof v === "boolean" && v === false) continue;
      lines.push(`${k}: ${typeof v === "number" ? fmt(v) : String(v)}`);
    }
    return lines.length ? lines.join("\n") : "Valeurs à 0.";
  }

  return "Section non supportée.";
}

/* =========================
   Rows building
========================= */
const allRows = computed<VariantRow[]>(() => {
  const out: VariantRow[] = [];

  for (const p of (store as any).pnls ?? []) {
    const pnlId = String((p as any)?.id ?? "");
    const pnlLabel = String((p as any)?.title ?? (p as any)?.label ?? `P&L ${pnlId}`);

    for (const c of (p as any)?.contracts ?? []) {
      const d = (c as any)?.dureeMois ?? null;
      const contractId = String((c as any)?.id ?? "");
      const contractLabel = contractUiTitle(c);

      for (const v of (c as any)?.variants ?? []) {
        const vid = String(v?.id ?? "");
        if (!vid) continue;
        if (props.targetVariantId && vid === String(props.targetVariantId)) continue;

        const kpis = computeKpisFor(v, Number(d ?? 0));
        const ebit = n2((kpis as any)?.ebit?.total ?? (kpis as any)?.ebitTotal ?? (kpis as any)?.ebit ?? 0);

        out.push({
          variantId: vid,
          title: String(v?.title ?? "—"),
          status: String(v?.status ?? "—"),
          pnlId,
          pnlLabel,
          contractId,
          contractLabel,
          ebit,
          _variant: v,
          _contract: c,
        });
      }
    }
  }

  return out;
});

const pnlOptions = computed(() => {
  const opts = (store as any).pnls ?? [];
  return opts.map((p: any) => ({
    id: String(p?.id ?? ""),
    label: String(p?.title ?? p?.label ?? `P&L ${String(p?.id ?? "").slice(0, 6)}`),
  }));
});

const contractOptions = computed(() => {
  const all: Array<{ id: string; label: string; pnlId: string }> = [];

  for (const p of (store as any).pnls ?? []) {
    const pid = String((p as any)?.id ?? "");
    if (scope.value === "ALL_PNLS" && pnlFilter.value !== "ALL" && pid !== pnlFilter.value) continue;

    for (const c of (p as any)?.contracts ?? []) {
      const cid = String((c as any)?.id ?? "");
      all.push({ id: cid, label: contractUiTitle(c), pnlId: pid });
    }
  }

  const map = new Map<string, { id: string; label: string; pnlId: string }>();
  for (const x of all) if (!map.has(x.id)) map.set(x.id, x);

  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "fr"));
});

const rows = computed<VariantRow[]>(() => {
  let out = allRows.value;

  if (scope.value === "SAME_PNL" && targetPnlId.value) {
    out = out.filter((r) => r.pnlId === targetPnlId.value);
  }

  if (scope.value === "ALL_PNLS") {
    if (pnlFilter.value !== "ALL") out = out.filter((r) => r.pnlId === pnlFilter.value);
    if (contractFilter.value !== "ALL") out = out.filter((r) => r.contractId === contractFilter.value);
  }

  const needle = q.value.trim().toLowerCase();
  if (needle) {
    out = out.filter((r) => {
      const blob = `${r.title} ${r.status} ${r.pnlLabel} ${r.contractLabel}`.toLowerCase();
      return blob.includes(needle);
    });
  }

  return [...out].sort((a, b) => b.ebit - a.ebit);
});

const pickedRow = computed(() => rows.value.find((r) => r.variantId === picked.value) ?? null);
const canSubmit = computed(() => !!String(picked.value ?? "").trim());

watch(
  () => isOpen.value,
  (open) => {
    if (!open) return;

    q.value = "";
    picked.value = null;
    copy.value = "FULL";
    scope.value = canSamePnl.value ? "SAME_PNL" : "ALL_PNLS";

    pnlFilter.value = "ALL";
    contractFilter.value = "ALL";

    closeTip();
  }
);

watch(
  () => scope.value,
  () => {
    const sel = String(picked.value ?? "");
    if (sel && !rows.value.some((r) => r.variantId === sel)) picked.value = null;

    if (scope.value !== "ALL_PNLS") {
      pnlFilter.value = "ALL";
      contractFilter.value = "ALL";
    }

    closeTip();
  }
);

watch(
  () => pnlFilter.value,
  () => {
    if (contractFilter.value === "ALL") return;
    const ok = rows.value.some((r) => r.contractId === contractFilter.value);
    if (!ok) contractFilter.value = "ALL";
  }
);

function submit() {
  const src = String(picked.value ?? "").trim();
  if (!src) return;
  emit("apply", { sourceVariantId: src, copy: copy.value });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="ov" @click.self="close">
      <div class="modal" role="dialog" aria-modal="true" :aria-label="`Importer — ${sectionLabel}`">
        <div class="head">
          <div class="headLeft">
            <div class="title">Importer — {{ sectionLabel }}</div>
            <div class="subtitle">
              Choisis une variante source puis clique <b>Importer</b>.
              <span class="muted2">La sauvegarde se fait sur la page.</span>
            </div>
          </div>
          <button class="iconBtn" type="button" @click="close" aria-label="Fermer">✕</button>
        </div>

        <div class="body">
          <div class="topbar">
            <div class="seg" role="tablist" aria-label="Périmètre">
              <button
                type="button"
                class="segBtn"
                :class="{ on: scope === 'SAME_PNL' }"
                :disabled="!canSamePnl"
                @click="scope = 'SAME_PNL'"
                :title="!canSamePnl ? 'P&L cible introuvable (targetVariantId manquant)' : ''"
              >
                Même P&L
              </button>
              <button type="button" class="segBtn" :class="{ on: scope === 'ALL_PNLS' }" @click="scope = 'ALL_PNLS'">
                Tous les P&L
              </button>
            </div>

            <div v-if="scope === 'ALL_PNLS'" class="filtersRow">
              <select class="select sm" v-model="pnlFilter" title="Filtrer par P&L">
                <option value="ALL">P&L : Tous</option>
                <option v-for="p in pnlOptions" :key="p.id" :value="p.id">{{ p.label }}</option>
              </select>

              <select class="select sm" v-model="contractFilter" title="Filtrer par contrat">
                <option value="ALL">Contrat : Tous</option>
                <option v-for="c in contractOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
            </div>

            <input class="search smGrow" v-model="q" placeholder="Rechercher…" />

            <div v-if="enablePresets" class="presetInline">
              <select class="select sm" v-model="copy" title="Données à importer">
                <option value="FULL">Section complète</option>
                <option value="ZERO">Formules (Qté=0, MOMD=0)</option>
                <option value="QTY_ONLY">Formules + Qté</option>
                <option value="MOMD_ONLY">Formules + MOMD</option>
                <option value="QTY_MOMD">Formules + Qté + MOMD</option>
              </select>
            </div>

            <!-- ✅ pill compacte + pas de wrap -->
            <div class="topbarRight">
              <span class="pillNoWrap" :title="`${rows.length} variantes`">{{ rows.length }}</span>
              <span v-if="pickedRow" class="pickedMini" :title="pickedRow.title">
                Source: <b class="ell">{{ pickedRow.title }}</b>
              </span>
            </div>
          </div>

          <div v-if="rows.length === 0" class="empty">Aucune variante trouvée pour ce périmètre.</div>

          <div v-else class="listWrap" role="listbox" aria-label="Variantes source">
            <div class="listHead">
              <div class="c1"></div>
              <div class="c2">Variante</div>
              <div class="c3">P&L</div>
              <div class="c4">Contrat</div>
              <div class="c5 right">EBIT</div>
              <div class="c6">Status</div>
            </div>

            <button
              v-for="r in rows"
              :key="r.variantId"
              class="row"
              type="button"
              role="option"
              :aria-selected="picked === r.variantId"
              :class="{ active: picked === r.variantId }"
              @click="setPicked(r.variantId)"
            >
              <div class="c1">
                <input
                  type="radio"
                  name="import-source-variant"
                  :checked="picked === r.variantId"
                  tabindex="-1"
                  @click.stop
                  readonly
                />
              </div>

              <div class="c2">
                <div class="line">
                  <div class="nm" :title="r.title">{{ r.title }}</div>

                  <!-- ✅ tooltip via Teleport + fixed -->
                  <span
                    class="infoWrap"
                    @mouseenter="(e) => openTip(e, r)"
                    @mousemove="(e) => openTip(e, r)"
                    @mouseleave="closeTip"
                    @click.stop
                    aria-label="Aperçu section"
                  >
                    <span class="info">i</span>
                  </span>
                </div>
              </div>

              <div class="c3 muted" :title="r.pnlLabel">{{ r.pnlLabel }}</div>
              <div class="c4 muted" :title="r.contractLabel">{{ r.contractLabel }}</div>

              <div class="c5 right mono strong" :title="fmt0(r.ebit)">{{ fmt0(r.ebit) }}</div>

              <div class="c6">
                <span class="tag" :title="r.status">{{ r.status }}</span>
              </div>
            </button>
          </div>
        </div>

        <div class="foot">
          <button class="btn ghost" type="button" @click="close">Annuler</button>
          <button class="btn primary" type="button" @click="submit" :disabled="!canSubmit">Importer</button>
        </div>
      </div>
    </div>

    <!-- ✅ Tooltip global au-dessus de tout -->
    <div
      v-if="isOpen && tipOpenFor"
      id="import-tip"
      class="tipGlobal"
      :style="{
        left: tipXY.x + 'px',
        top: tipXY.y + 'px',
        transform:
          tipPlacement === 'top'
            ? 'translate(-50%, calc(-100% - 10px))'
            : 'translate(-50%, 10px)',
      }"
      @mouseenter.stop
      @mouseleave="closeTip"
    >
      <div class="tipTitle">{{ tipTitle }}</div>
      <div class="tipBody">{{ tipText }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  z-index: 110000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(4px);
}
.modal {
  width: min(1100px, 96vw);
  height: min(84vh, 860px);
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
}
.head {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.headLeft {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.title {
  font-size: 15px;
  font-weight: 800;
  color: #0f172a;
}
.subtitle {
  font-size: 12px;
  color: #64748b;
  line-height: 1.25;
}
.muted2 {
  color: #94a3b8;
}
.iconBtn {
  width: 36px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  background: #fff;
  cursor: pointer;
  font-weight: 900;
  color: #0f172a;
}
.iconBtn:hover {
  background: #f8fafc;
}

.body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
  flex: 1 1 auto;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap; /* ✅ évite wrap */
  padding: 10px 12px;
  border: 1px solid #eef2f7;
  background: #fcfcfd;
  border-radius: 12px;
  overflow: hidden;
}
.filtersRow {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: nowrap;
}
.topbarRight {
  margin-left: auto;
  display: inline-flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  flex: 0 0 auto;
}

.pickedMini {
  font-size: 12px;
  color: #334155;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  padding: 5px 10px;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  max-width: 320px;
  min-width: 0;
}
.ell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
  display: inline-block;
}

.seg {
  display: inline-flex;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  flex: 0 0 auto;
}
.segBtn {
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  color: #334155;
  background: transparent;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
}
.segBtn.on {
  background: #0f172a;
  color: #fff;
}
.segBtn:not(.on):hover {
  background: #f8fafc;
}
.segBtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.select {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
  background: #fff;
  max-width: 220px;
}
.select.sm {
  padding: 7px 10px;
  font-size: 12px;
  border-radius: 10px;
}
.search {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 7px 10px;
  outline: none;
  font-size: 12px;
  background: #fff;
  min-width: 200px;
}
.search.smGrow {
  flex: 1 1 auto;
  min-width: 220px;
}

.pillNoWrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: 12px;
  font-weight: 900;
  color: #334155;
  white-space: nowrap; /* ✅ */
  flex: 0 0 auto;
}

.empty {
  border: 1px dashed #e5e7eb;
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  color: #64748b;
  font-size: 12px;
}

.listWrap {
  border: 1px solid #eef2f7;
  border-radius: 12px;
  overflow: auto;
  flex: 1 1 auto;
  min-height: 220px;
}
.listHead,
.row {
  display: grid;
  grid-template-columns: 40px 1.25fr 1fr 1fr 0.65fr 0.55fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
}
.listHead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  border-bottom: 1px solid #eef2f7;
  font-size: 11px;
  font-weight: 900;
  color: #475569;
}
.row {
  border-bottom: 1px solid #eef2f7;
  background: #fff;
  font-size: 12px;
  text-align: left;
  width: 100%;
  cursor: pointer;
}
.row:last-child {
  border-bottom: 0;
}
.row:hover {
  background: #fbfdff;
}
.row.active {
  background: #eef2ff;
  box-shadow: inset 3px 0 0 #0f172a;
}

.c1 {
  display: flex;
  align-items: center;
  justify-content: center;
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.nm {
  font-weight: 900;
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.right {
  text-align: right;
}
.muted {
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
.strong {
  font-weight: 900;
  color: #0f172a;
}
.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-weight: 900;
  font-size: 10px;
  color: #334155;
}

.infoWrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
}
.info {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #0f172a;
  font-size: 11px;
  font-weight: 900;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.infoWrap:hover .info {
  background: #f8fafc;
}

/* ✅ Tooltip global au-dessus de tout */
.tipGlobal {
  position: fixed;
  z-index: 999999; /* ✅ au-dessus */
  width: min(420px, 80vw);
  background: #0b1220;
  color: #e2e8f0;
  border: 1px solid rgba(226, 232, 240, 0.18);
  border-radius: 12px;
  padding: 10px 10px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}
.tipTitle {
  font-size: 11px;
  font-weight: 900;
  margin-bottom: 6px;
  color: #fff;
}
.tipBody {
  font-size: 12px;
  line-height: 1.35;
  white-space: pre-line;
  color: #e2e8f0;
}

.foot {
  padding: 12px 14px;
  border-top: 1px solid #f1f5f9;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  background: #fff;
}
.btn {
  border: 1px solid #e5e7eb;
  background: #fff;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 900;
  font-size: 12px;
  color: #0f172a;
}
.btn:hover {
  background: #f8fafc;
}
.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.btn.ghost {
  background: #fff;
}
.btn.primary {
  border-color: #0f172a;
  background: #0f172a;
  color: #fff;
}
.btn.primary:hover {
  filter: brightness(1.06);
}
</style>
