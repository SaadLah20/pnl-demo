<!-- src/pages/Variante/Sections/Formules/FormulesPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { usePnlStore } from "@/stores/pnl.store";
import SectionGeneralizeModal, { type CopyPreset } from "@/components/SectionGeneralizeModal.vue";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();

  // optional loaders (fallback-safe)
  try {
    if (!store.formulesCatalogue?.length && (store as any).loadFormulesCatalogue) {
      await (store as any).loadFormulesCatalogue();
    }
  } catch {}
  try {
    if (!store.mpCatalogue?.length && (store as any).loadMpCatalogue) {
      await (store as any).loadMpCatalogue();
    }
  } catch {}
});

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function n(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function liters(v: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(toNum(v));
}

/* =========================
   ACTIVE
========================= */
const pnl = computed(() => store.activePnl);
const contract = computed(() => store.activeContract);
const variant = computed(() => store.activeVariant);

const pnlTitle = computed(() => pnl.value?.title ?? "—");
const contractLabel = computed(() => {
  const d = (contract.value as any)?.dureeMois ?? null;
  return d != null ? `Contrat ${String((contract.value as any)?.id ?? "").slice(0, 6)} — ${d} mois` : "—";
});
const variantTitle = computed(() => (variant.value as any)?.title ?? "—");

watch(
  () => store.activeVariantId,
  async (vid) => {
    const id = String(vid ?? "").trim();
    if (!id) return;

    const v = store.activeVariant as any;
    if (v && Array.isArray(v.formules?.items)) return;

    if ((store as any).loadVariantDeep) {
      await (store as any).loadVariantDeep(id);
    }
  },
  { immediate: true }
);

/* =========================
   ROWS (variant formules)
========================= */
type FormuleRow = {
  id: string; // variantFormuleId
  formuleId: string;
  label: string;
  resistance: string;
  city: string;
  region: string;
  volumeM3: number;      // "quantité" (m³)
  momd: number;          // marge
  cmpOverride: number | null; // DH
  raw: any;
};

const rows = computed<FormuleRow[]>(() => {
  const v: any = variant.value ?? null;

  const items =
    v?.formules?.items ??
    v?.variantFormules ??
    [];

  if (!Array.isArray(items)) return [];

  return items.map((it: any) => {
    const f = it?.formule ?? {};
    return {
      id: String(it?.id ?? ""),
      formuleId: String(it?.formuleId ?? f?.id ?? ""),
      label: String(f?.label ?? ""),
      resistance: String(f?.resistance ?? ""),
      city: String(f?.city ?? ""),
      region: String(f?.region ?? ""),
      volumeM3: toNum(it?.volumeM3 ?? 0),
      momd: toNum(it?.momd ?? 0),
      cmpOverride: it?.cmpOverride == null ? null : toNum(it?.cmpOverride),
      raw: it,
    };
  });
});

function getItemsRaw(r: FormuleRow): any[] {
  return r?.raw?.formule?.items ?? [];
}

/* =========================
   ✅ AJOUT FORMULE (UI + anti-doublon)
========================= */
const addOpen = ref(false);
const addQ = ref("");
const addBusy = ref(false);
const addErr = ref<string | null>(null);

const existingFormuleIds = computed(() => new Set(rows.value.map((r) => String(r.formuleId))));
const catalogue = computed<any[]>(() => (store.formulesCatalogue ?? []) as any[]);

const filteredCatalogue = computed(() => {
  const q = addQ.value.trim().toLowerCase();
  const list = catalogue.value.slice();
  const out = !q
    ? list
    : list.filter((f: any) => {
        const blob = `${f.label ?? ""} ${f.resistance ?? ""} ${f.city ?? ""} ${f.region ?? ""}`.toLowerCase();
        return blob.includes(q);
      });

  return out;
});

function isAlreadyInVariant(formuleId: string) {
  return existingFormuleIds.value.has(String(formuleId));
}

async function addFormule(formuleId: string) {
  if (!variant.value) return;
  if (isAlreadyInVariant(formuleId)) return;

  addBusy.value = true;
  addErr.value = null;
  try {
    const variantId = String((variant.value as any)?.id ?? store.activeVariantId ?? "").trim();
    if (!variantId) return;

    await (store as any).addFormuleToVariant(variantId, String(formuleId));
  } catch (e: any) {
    addErr.value = e?.message ?? String(e);
  } finally {
    addBusy.value = false;
  }
}

/* =========================
   ✅ SUPPRIMER FORMULE (variant)
========================= */
const delBusy = reactive<Record<string, boolean>>({});
const delErr = ref<string | null>(null);

async function deleteFormule(variantFormuleId: string) {
  const variantId = String((variant.value as any)?.id ?? store.activeVariantId ?? "").trim();
  const vfId = String(variantFormuleId ?? "").trim();
  if (!variantId || !vfId) return;

  const ok = window.confirm("Supprimer cette formule de la variante ? Cette action est définitive.");
  if (!ok) return;

  delErr.value = null;
  delBusy[vfId] = true;
  try {
    await (store as any).deleteVariantFormule(variantId, vfId);
  } catch (e: any) {
    delErr.value = e?.message ?? String(e);
  } finally {
    delBusy[vfId] = false;
  }
}

/* =========================
   Sorting MP: Ciment -> Granulas -> Adjuvant -> Others
========================= */
function normKey(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function catRank(catRaw: any): number {
  const c = normKey(catRaw);
  if (c === "ciment") return 0;

  if (c === "granulats" || c === "granulat" || c === "granulas" || c === "granula" || c.includes("granul"))
    return 1;

  if (c === "adjuvant") return 2;

  return 9;
}

function sortedItems(r: FormuleRow) {
  const items = getItemsRaw(r).slice();
  items.sort((a: any, b: any) => {
    const ra = catRank(a?.mp?.categorie);
    const rb = catRank(b?.mp?.categorie);
    if (ra !== rb) return ra - rb;

    const la = String(a?.mp?.label ?? "").toLowerCase();
    const lb = String(b?.mp?.label ?? "").toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return 0;
  });
  return items;
}

/* =========================
   CMP (composition)
========================= */
function cmpPerM3(r: FormuleRow): number {
  let total = 0;
  for (const it of getItemsRaw(r)) {
    const qtyKg = toNum(it?.qty ?? 0);
    const prixT = toNum(it?.mp?.prix ?? 0);
    total += (qtyKg / 1000) * prixT;
  }
  return total;
}

/* =========================
   Volume verifier (fallback-safe)
========================= */
function getRhoFromCategorie(catRaw: any): number | null {
  const c = normKey(catRaw);
  if (c === "ciment") return 3.1;
  if (c === "granulats" || c === "granulat" || c === "granulas" || c === "granula" || c.includes("granul"))
    return 2.65;
  if (c === "adjuvant") return 1.1;
  return null;
}

type ItemDraft = { mpId: string; qty: number };

function normalizeItems(items: ItemDraft[]): ItemDraft[] {
  const map = new Map<string, number>();
  for (const it of items ?? []) {
    const mpId = String(it.mpId ?? "").trim();
    if (!mpId) continue;
    const qty = Number(it.qty ?? 0);
    map.set(mpId, (map.get(mpId) ?? 0) + qty);
  }
  return [...map.entries()].map(([mpId, qty]) => ({ mpId, qty }));
}

function getMpById(mpId: string): any | null {
  const list = store.mpCatalogue ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;
  const found = list.find((x: any) => String(x?.id ?? "") === String(mpId));
  return found ?? null;
}

function compositionStatsFor(r: FormuleRow) {
  const raw = getItemsRaw(r) ?? [];
  const rawItems: Array<ItemDraft & { mpInline?: any }> = raw.map((x: any) => ({
    mpId: String(x?.mpId ?? x?.mp?.id ?? ""),
    qty: toNum(x?.qty ?? 0),
    mpInline: x?.mp ?? null,
  }));

  const withKeys = rawItems.map((x, idx) => ({
    ...x,
    mpId: x.mpId?.trim() ? x.mpId : `__missing_${idx}`,
  }));
  const cleaned = normalizeItems(withKeys);

  let mCiment = 0;
  let vTotal = 0;
  const missing: Array<{ mpId: string; label: string }> = [];

  const inlineById = new Map<string, any>();
  for (const it of withKeys) {
    if (it.mpInline && it.mpId) inlineById.set(String(it.mpId), it.mpInline);
  }

  for (const it of cleaned) {
    const mpFromCatalogue = getMpById(String(it.mpId));
    const mpInline = inlineById.get(String(it.mpId)) ?? null;
    const mp = mpFromCatalogue ?? mpInline ?? null;

    const rho = getRhoFromCategorie(mp?.categorie);

    if (!rho) {
      missing.push({
        mpId: String(it.mpId),
        label: String(mp?.label ?? "MP inconnue"),
      });
      continue;
    }

    const qty = toNum(it.qty);
    const cat = normKey(mp?.categorie);
    if (cat === "ciment") mCiment += qty;

    vTotal += (qty / 1000) / rho;
  }

  const vEau = (mCiment * 0.5 + 15) / 1000;
  const target = 1;
  const vTotWithWater = vTotal + vEau;

  const delta = target - vTotWithWater;

  const isLow = delta > 0.02;
  const isOk = !isLow && delta >= -0.02;

  const statusLabel = isOk ? "OK" : isLow ? "Bas" : "Haut";

  return {
    vTotal: vTotWithWater * 1000,
    target: target * 1000,
    delta: delta * 1000,
    vEau: vEau * 1000,
    missing,
    isLow,
    isOk,
    statusLabel,
  };
}

/* =========================
   UI: expand
========================= */
const open = reactive<Record<string, boolean>>({});

function toggle(r: FormuleRow) {
  open[r.id] = !open[r.id];
}
function openAll() {
  for (const r of rows.value) open[r.id] = true;
}
function closeAll() {
  for (const r of rows.value) open[r.id] = false;
}
function isOpen(r: FormuleRow) {
  return !!open[r.id];
}

/* =========================
   ✅ GENERALISER SECTION (Formules)
========================= */
const genOpen = ref(false);
const genBusy = ref(false);
const genErr = ref<string | null>(null);

function getAllVariantsOfActivePnl(): Array<{ id: string; raw: any }> {
  const p = store.activePnl;
  if (!p) return [];
  const out: Array<{ id: string; raw: any }> = [];
  for (const c of p.contracts ?? []) {
    for (const v of c.variants ?? []) {
      const id = String(v?.id ?? "");
      if (!id) continue;
      out.push({ id, raw: v });
    }
  }
  return out;
}

function getVariantById(variantId: string): any | null {
  const list = getAllVariantsOfActivePnl();
  return list.find((x) => x.id === String(variantId))?.raw ?? null;
}

function makePatchFor(copy: CopyPreset, s: any) {
  if (copy === "ZERO") return { volumeM3: 0, momd: 0, cmpOverride: 0 };
  if (copy === "QTY_ONLY") return { volumeM3: Number(s.volumeM3 ?? 0), momd: 0, cmpOverride: 0 };
  if (copy === "MOMD_ONLY") return { volumeM3: 0, momd: Number(s.momd ?? 0), cmpOverride: 0 };
  // QTY_MOMD
  return {
    volumeM3: Number(s.volumeM3 ?? 0),
    momd: Number(s.momd ?? 0),
    cmpOverride: s.cmpOverride == null ? 0 : s.cmpOverride,
  };
}

async function generalizeFormulesTo(variantIds: string[], copy: CopyPreset) {
  const sourceVariantId = String(store.activeVariantId ?? "").trim();
  if (!sourceVariantId) return;

  // source snapshot
  const src = rows.value
    .filter((r) => r.formuleId)
    .map((r) => ({
      formuleId: String(r.formuleId),
      volumeM3: toNum(r.volumeM3),
      momd: toNum(r.momd),
      cmpOverride: r.cmpOverride,
    }));

  genErr.value = null;
  genBusy.value = true;

  try {
    for (const targetIdRaw of variantIds) {
      const targetId = String(targetIdRaw ?? "").trim();
      if (!targetId || targetId === sourceVariantId) continue;

      // 1) delete existing target items
      const target = getVariantById(targetId) as any;
      const targetItems = (target?.formules?.items ?? target?.variantFormules ?? []) as any[];
      if (Array.isArray(targetItems) && targetItems.length) {
        for (const it of targetItems) {
          const vfId = String(it?.id ?? "").trim();
          if (!vfId) continue;
          await (store as any).deleteVariantFormule(targetId, vfId);
        }
      }

      // 2) add all formuleIds + patch fields depending on choice
      for (const s of src) {
        await (store as any).addFormuleToVariant(targetId, s.formuleId);

        const refreshed = getVariantById(targetId) as any;
        const its = (refreshed?.formules?.items ?? refreshed?.variantFormules ?? []) as any[];
        const created = Array.isArray(its)
          ? its.find((x: any) => String(x?.formuleId ?? x?.formule?.id ?? "") === s.formuleId)
          : null;

        const createdId = String(created?.id ?? "").trim();
        if (createdId) {
          const patch = makePatchFor(copy, s);
          await (store as any).updateVariantFormule(targetId, createdId, patch);
        }
      }
    }
  } catch (e: any) {
    genErr.value = e?.message ?? String(e);
  } finally {
    genBusy.value = false;
  }
}

async function onApplyGeneralize(payload: { mode: "ALL" | "SELECT"; variantIds: string[]; copy: CopyPreset }) {
  const ids = payload?.variantIds ?? [];
  const copy = payload?.copy ?? "QTY_MOMD";
  if (!ids.length) return;

  const label =
    copy === "ZERO"
      ? "Formules seulement (0 m³ / 0 MOMD / 0 DH)"
      : copy === "QTY_ONLY"
      ? "Formules + Quantités (MOMD=0 / 0 DH)"
      : "Formules + Quantités + MOMD";

  const ok = window.confirm(
    payload.mode === "ALL"
      ? `Généraliser les Formules sur TOUTES les variantes ?\nMode: ${label}`
      : `Généraliser les Formules sur ${ids.length} variante(s) ?\nMode: ${label}`
  );
  if (!ok) return;

  await generalizeFormulesTo(ids, copy);
  if (!genErr.value) genOpen.value = false;
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div class="tleft">
        <div class="titleRow">
          <div class="h1">Formules — Composition & CMP</div>
          <span class="badge">Variante active</span>
        </div>

        <div class="meta">
          <div class="metaLine">
            <span class="k">P&L</span>
            <span class="v">{{ pnlTitle }}</span>
            <span class="sep">•</span>
            <span class="k">Contrat</span>
            <span class="v">{{ contractLabel }}</span>
          </div>
          <div class="metaLine">
            <span class="k">Variante</span>
            <span class="v strong">{{ variantTitle }}</span>
          </div>
        </div>
      </div>

      <div class="tright">
        <div class="hint">
          • CMP estimé depuis prix/t.
          <br />
          • Volume vérif = Σ(kg/ρ) + Eau(C×0,5) + 15L.
        </div>
      </div>

      <div class="topActions">
        <button class="btnPrimary" @click="addOpen = true" :disabled="!variant || addBusy">
          + Ajouter
        </button>

        <button class="btn" @click="genOpen = true" :disabled="!variant || genBusy">
          Généraliser
        </button>

        <button class="btn" @click="store.loadPnls()">Recharger</button>
        <button class="btn xs" @click="openAll()" :disabled="!variant">Ouvrir</button>
        <button class="btn xs" @click="closeAll()" :disabled="!variant">Fermer</button>
      </div>
    </div>

    <div v-if="delErr" class="alert error"><b>Erreur :</b> {{ delErr }}</div>
    <div v-if="genErr" class="alert error"><b>Généralisation :</b> {{ genErr }}</div>
    <div v-if="genBusy" class="alert"><b>Généralisation :</b> traitement…</div>

    <div v-if="store.loading" class="alert">Chargement…</div>
    <div v-else-if="store.error" class="alert error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div class="card" v-if="!variant">
        <div class="muted">Aucune variante active. Sélectionne une variante depuis le Dashboard.</div>
      </div>

      <template v-else>
        <div class="card slim">
          <div class="bar">
            <div class="barLeft">
              <div class="h2">Formules ({{ rows.length }})</div>
              <div class="muted tiny">
                CMP = Σ((kg/m³ ÷ 1000) × DH/t) • Volume = Σ(kg/ρ) + Eau(C×0,5) + 15L
              </div>
            </div>
          </div>
        </div>

        <div class="card" v-if="rows.length === 0">
          <div class="muted">Aucune formule dans la variante.</div>
        </div>

        <div v-else class="cards">
          <div v-for="r in rows" :key="r.id" class="card">
            <button class="rowHead" @click="toggle(r)">
              <div class="left">
                <span class="chev">{{ isOpen(r) ? "▾" : "▸" }}</span>
                <span class="name">{{ r.label || "—" }}</span>
                <span class="chip">{{ r.resistance || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.city || "—" }}</span>
                <span class="dot">•</span>
                <span class="sub">{{ r.region || "—" }}</span>
              </div>

              <div class="right">
                <button
                  class="iconDanger"
                  title="Supprimer la formule"
                  @click.stop="deleteFormule(r.id)"
                  :disabled="delBusy[r.id]"
                >
                  🗑
                </button>

                <div class="cmpBox">
                  <span class="cmpLbl">CMP</span>
                  <span class="cmpVal mono">{{ n(cmpPerM3(r)) }}</span>
                </div>

                <template v-if="getItemsRaw(r).length">
                  <div class="pills">
                    <span class="pill mono">V <b>{{ liters(compositionStatsFor(r).vTotal) }}</b>L</span>
                    <span class="pill" :class="compositionStatsFor(r).isOk ? 'ok' : compositionStatsFor(r).isLow ? 'bad' : 'warn'">
                      {{ compositionStatsFor(r).statusLabel }}
                    </span>
                  </div>
                </template>
              </div>
            </button>

            <div v-if="isOpen(r)" class="rowBody">
              <div class="grid">
                <div class="box">
                  <div class="boxTitle">Composition (kg/m³)</div>

                  <div v-if="compositionStatsFor(r).missing.length" class="miniErr">
                    <b>MP non résolues</b> :
                    <span v-for="m in compositionStatsFor(r).missing" :key="m.mpId" class="miniChip">
                      {{ m.label }}
                    </span>
                  </div>

                  <div class="table">
                    <div class="thead">
                      <div>MP</div>
                      <div class="rightTxt">Cat.</div>
                      <div class="rightTxt">Qty</div>
                      <div class="rightTxt">Prix/t</div>
                      <div class="rightTxt">Total</div>
                    </div>

                    <div
                      v-for="it in sortedItems(r)"
                      :key="String(it?.id ?? it?.mpId ?? it?.mp?.id ?? '')"
                      class="trow"
                    >
                      <div class="mp">
                        <span class="mpName">{{ it?.mp?.label ?? "—" }}</span>
                        <span class="mpSub muted">{{ it?.mp?.resistance ?? "" }}</span>
                      </div>
                      <div class="rightTxt muted">{{ it?.mp?.categorie ?? "—" }}</div>
                      <div class="rightTxt mono strong">{{ n(it?.qty ?? 0, 0) }}</div>
                      <div class="rightTxt mono">{{ n(it?.mp?.prix ?? 0) }}</div>
                      <div class="rightTxt mono strong">
                        {{ n(((toNum(it?.qty ?? 0) / 1000) * toNum(it?.mp?.prix ?? 0))) }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="box">
                  <div class="boxTitle">Contrôle volume</div>
                  <div class="kpis">
                    <div class="kpi">
                      <div class="k">Volume total</div>
                      <div class="v mono strong">{{ liters(compositionStatsFor(r).vTotal) }} L</div>
                    </div>
                    <div class="kpi">
                      <div class="k">Cible</div>
                      <div class="v mono">{{ liters(compositionStatsFor(r).target) }} L</div>
                    </div>
                    <div class="kpi">
                      <div class="k">Δ</div>
                      <div
                        class="v mono"
                        :class="compositionStatsFor(r).isOk ? 'okTxt' : compositionStatsFor(r).isLow ? 'badTxt' : 'warnTxt'"
                      >
                        {{ liters(compositionStatsFor(r).delta) }} L
                      </div>
                    </div>
                    <div class="kpi">
                      <div class="k">Eau estimée</div>
                      <div class="v mono">{{ liters(compositionStatsFor(r).vEau) }} L</div>
                    </div>
                  </div>

                  <div class="muted tiny">
                    Note : contrôle de cohérence indicatif (ρ approx).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- MODAL AJOUT (inchangé) -->
        <div v-if="addOpen" class="modalOverlay" @click.self="addOpen = false">
          <div class="modal">
            <div class="modalHead">
              <div class="modalTitle">Ajouter une formule</div>
              <button class="x" @click="addOpen = false">✕</button>
            </div>

            <div class="modalSearch">
              <input v-model="addQ" class="in" placeholder="Rechercher…" />
            </div>

            <div v-if="addErr" class="modalErr"><b>Erreur :</b> {{ addErr }}</div>

            <div class="modalList">
              <div
                v-for="f in filteredCatalogue"
                :key="String(f?.id ?? '')"
                class="modalItem"
                :class="isAlreadyInVariant(String(f?.id ?? '')) ? 'disabled' : ''"
              >
                <div class="miLeft">
                  <div class="miTitle">
                    <span class="miName">{{ f?.label ?? "—" }}</span>
                    <span class="chip">{{ f?.resistance ?? "—" }}</span>
                  </div>
                  <div class="miSub muted">{{ f?.city ?? "—" }} • {{ f?.region ?? "—" }}</div>
                </div>

                <div class="miRight">
                  <span v-if="isAlreadyInVariant(String(f?.id ?? ''))" class="tag">Déjà ajouté</span>
                  <button
                    v-else
                    class="btnPrimary xs"
                    :disabled="addBusy"
                    @click="addFormule(String(f?.id ?? ''))"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>

            <div class="modalFoot">
              <button class="btn" @click="addOpen = false">Fermer</button>
            </div>
          </div>
        </div>

        <!-- ✅ MODAL GENERALISATION -->
        <SectionGeneralizeModal
          v-model="genOpen"
          section-label="Formules"
          :source-variant-id="String(store.activeVariantId ?? '') || null"
          @apply="onApplyGeneralize"
          @close="() => {}"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
/* styles identiques à ta version précédente (inchangés) */
.page { display:flex; flex-direction:column; gap:8px; padding:10px; }
.top { display:flex; justify-content:space-between; align-items:flex-end; gap:8px; flex-wrap:wrap; }
.tleft { display:flex; flex-direction:column; gap:2px; min-width:260px; }
.titleRow { display:flex; align-items:center; gap:8px; }
.h1 { font-weight:950; font-size:14px; }
.badge { font-size:10px; padding:2px 7px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; color:#374151; font-weight:900; }
.meta { display:flex; flex-direction:column; gap:1px; }
.metaLine { display:flex; align-items:center; gap:6px; font-size:11px; }
.k { color:#6b7280; font-weight:800; }
.v { color:#111827; }
.strong { font-weight:950; }
.sep { opacity:.5; }
.tright { display:flex; align-items:flex-end; flex:1 1 auto; min-width:220px; }
.hint { font-size:10.5px; color:#6b7280; line-height:1.2; }
.topActions { display:flex; gap:6px; align-items:center; flex:0 0 auto; }
.btn, .btnPrimary { border:1px solid #e5e7eb; background:#fff; padding:7px 10px; border-radius:12px; cursor:pointer; font-weight:900; font-size:12px; }
.btn:hover { background:#f9fafb; }
.btnPrimary { border-color:#111827; background:#111827; color:#fff; }
.btnPrimary:hover { filter:brightness(1.05); }
.btn.xs, .btnPrimary.xs { padding:6px 8px; font-size:11px; }
.alert { border:1px solid #e5e7eb; background:#fff; padding:10px 12px; border-radius:14px; font-size:12px; }
.alert.error { border-color:#fecaca; background:#fff5f5; color:#7f1d1d; }
.muted { color:#6b7280; }
.tiny { font-size:10.5px; }
.mono { font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; }
.card { border:1px solid #e5e7eb; background:#fff; border-radius:16px; overflow:hidden; }
.card.slim { padding:8px 10px; }
.cards { display:flex; flex-direction:column; gap:8px; }
.bar { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.h2 { font-weight:950; font-size:12.5px; }
.rowHead { width:100%; border:0; background:#fff; cursor:pointer; padding:8px 10px; display:flex; gap:10px; justify-content:space-between; align-items:center; text-align:left; }
.rowHead:hover { background:#f9fafb; }
.left { display:flex; align-items:center; gap:8px; min-width:0; flex:1 1 auto; overflow:hidden; }
.chev { color:#6b7280; width:16px; display:inline-block; flex:0 0 auto; }
.name { font-weight:950; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:420px; }
.chip { font-size:10px; padding:2px 7px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; color:#374151; font-weight:950; flex:0 0 auto; }
.dot { opacity:.5; flex:0 0 auto; }
.sub { font-size:10.5px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:150px; }
.right { display:flex; gap:8px; align-items:center; justify-content:flex-end; flex:0 0 auto; }
.iconDanger { border:1px solid #fee2e2; background:#fff; color:#b91c1c; width:30px; height:28px; border-radius:10px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; font-size:14px; flex:0 0 auto; }
.iconDanger:hover { background:#fff5f5; }
.iconDanger:disabled { opacity:.5; cursor:not-allowed; }
.cmpBox { display:inline-flex; align-items:baseline; gap:6px; padding:4px 8px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; }
.cmpLbl { font-size:10px; color:#6b7280; font-weight:900; }
.cmpVal { font-size:12px; font-weight:950; color:#111827; }
.pills { display:inline-flex; gap:6px; align-items:center; }
.pill { font-size:10px; padding:2px 7px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; font-weight:900; }
.pill.ok { border-color:#bbf7d0; background:#f0fdf4; color:#166534; }
.pill.warn { border-color:#fde68a; background:#fffbeb; color:#92400e; }
.pill.bad { border-color:#fecaca; background:#fff5f5; color:#7f1d1d; }
.rowBody { padding:10px; border-top:1px solid #eef2f7; }
.grid { display:grid; grid-template-columns:1.5fr 1fr; gap:10px; }
@media (max-width: 980px) { .grid { grid-template-columns:1fr; } }
.box { border:1px solid #eef2f7; background:#fcfcfd; border-radius:14px; padding:10px; }
.boxTitle { font-weight:950; font-size:12px; margin-bottom:8px; }
.miniErr { border:1px solid #fecaca; background:#fff5f5; color:#7f1d1d; border-radius:12px; padding:8px 10px; font-size:11px; margin-bottom:8px; }
.miniChip { display:inline-flex; align-items:center; gap:6px; padding:2px 6px; border-radius:999px; border:1px solid #fecaca; background:#fff; margin-left:6px; font-size:10px; font-weight:900; }
.table { display:flex; flex-direction:column; gap:6px; }
.thead, .trow { display:grid; grid-template-columns:1.4fr 0.8fr 0.6fr 0.7fr 0.7fr; gap:8px; align-items:center; }
.thead { font-size:10px; color:#6b7280; font-weight:900; padding:0 2px 4px; }
.trow { background:#fff; border:1px solid #eef2f7; border-radius:12px; padding:7px 8px; font-size:11.5px; }
.mp { display:flex; flex-direction:column; gap:1px; min-width:0; }
.mpName { font-weight:950; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mpSub { font-size:10px; }
.rightTxt { text-align:right; }
.kpis { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.kpi { border:1px solid #eef2f7; border-radius:14px; background:#fff; padding:8px 10px; }
.kpi .k { font-size:10px; color:#6b7280; font-weight:900; }
.kpi .v { font-size:12px; margin-top:2px; }
.okTxt { color:#166534; font-weight:950; }
.warnTxt { color:#92400e; font-weight:950; }
.badTxt { color:#7f1d1d; font-weight:950; }
.modalOverlay { position:fixed; inset:0; background:rgba(0,0,0,.28); display:flex; align-items:center; justify-content:center; padding:18px; z-index:50; }
.modal { width:min(900px, 96vw); max-height:82vh; overflow:auto; background:#fff; border-radius:18px; border:1px solid #e5e7eb; box-shadow:0 25px 50px rgba(0,0,0,.15); }
.modalHead { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-bottom:1px solid #eef2f7; }
.modalTitle { font-weight:950; font-size:13px; }
.x { border:1px solid #e5e7eb; background:#fff; width:34px; height:32px; border-radius:12px; cursor:pointer; font-weight:900; }
.x:hover { background:#f9fafb; }
.modalSearch { padding:10px 14px; border-bottom:1px solid #eef2f7; }
.in { width:100%; border:1px solid #e5e7eb; border-radius:12px; padding:10px 12px; outline:none; font-size:12px; }
.in:focus { border-color:#111827; box-shadow:0 0 0 3px rgba(17,24,39,.12); }
.modalErr { margin:10px 14px 0; border:1px solid #fecaca; background:#fff5f5; color:#7f1d1d; border-radius:14px; padding:10px 12px; font-size:12px; }
.modalList { padding:10px 14px; display:flex; flex-direction:column; gap:8px; }
.modalItem { border:1px solid #eef2f7; border-radius:14px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:12px; background:#fff; }
.modalItem:hover { background:#fcfcfd; }
.modalItem.disabled { opacity:.6; }
.miLeft { display:flex; flex-direction:column; gap:3px; min-width:0; }
.miTitle { display:flex; align-items:center; gap:8px; min-width:0; }
.miName { font-weight:950; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:520px; }
.miSub { font-size:11px; }
.miRight { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
.tag { font-size:10px; padding:2px 7px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; color:#6b7280; font-weight:900; }
.modalFoot { border-top:1px solid #eef2f7; padding:12px 14px; display:flex; justify-content:flex-end; gap:8px; }
</style>
