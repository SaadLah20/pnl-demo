<!-- src/pages/DetailsPage.vue -->
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { usePnlStore } from "@/stores/pnl.store";

const store = usePnlStore();

onMounted(async () => {
  if (store.pnls.length === 0) await store.loadPnls();
  if ((store as any).formulesCatalogue?.length === 0 && (store as any).loadFormulesCatalogue) {
    await (store as any).loadFormulesCatalogue();
  }
});

/* =========================
   HELPERS
========================= */
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
function money(v: any) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(toNum(v));
}
function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => store.activeVariant as any);
const contract = computed<any>(() => store.activeContract as any);
const dureeMois = computed<number>(() => Math.max(1, toNum(contract.value?.dureeMois) || 1));

const formules = computed<any[]>(() => (variant.value?.formules?.items ?? []) as any[]);
const volumeTotal = computed<number>(() => formules.value.reduce((s, vf) => s + toNum(vf?.volumeM3), 0));

const volumePompePct = computed<number>(() => toNum(variant.value?.transport?.volumePompePct));
const volumePompe = computed<number>(() => volumeTotal.value * (volumePompePct.value / 100));
const amortMois = computed<number>(() => toNum(variant.value?.cab?.amortMois));

/* =========================
   CMP / PV / CA (pour %)
========================= */
function mpPriceUsed(mpId: string): number {
  const vmp = (variant.value?.mp?.items ?? []).find((x: any) => x.mpId === mpId);
  if (!vmp) return 0;
  if (vmp?.prixOverride != null) return toNum(vmp.prixOverride);
  return toNum(vmp?.mp?.prix);
}

type CompRow = { mpId: string; qty: number; prix: number; coutParM3: number };

function compositionFor(formuleCatalogue: any): CompRow[] {
  const items = (formuleCatalogue?.items ?? []) as any[];
  return items.map((it: any) => {
    const mpId = String(it.mpId);
    const qty = toNum(it.qty);
    const prix = mpPriceUsed(mpId);
    return { mpId, qty, prix, coutParM3: (qty / 1000) * prix };
  });
}

function cmpParM3For(vf: any): number {
  const comp = compositionFor(vf?.formule);
  return comp.reduce((s, x) => s + toNum(x.coutParM3), 0);
}

const transportPrixMoyen = computed<number>(() => toNum(variant.value?.transport?.prixMoyen));

const pvParM3Moy = computed<number>(() => {
  const vol = volumeTotal.value;
  if (vol === 0) return 0;

  const total = formules.value.reduce((s, vf) => {
    const v = toNum(vf?.volumeM3);
    const pv = cmpParM3For(vf) + toNum(vf?.momd) + transportPrixMoyen.value;
    return s + pv * v;
  }, 0);

  return total / vol;
});

const caTotal = computed<number>(() => pvParM3Moy.value * volumeTotal.value);

function pctOfCa(totalCost: number): number {
  const ca = caTotal.value;
  if (ca <= 0) return 0;
  return (toNum(totalCost) / ca) * 100;
}

/* =========================
   HIERARCHY MODEL
========================= */
type Line = {
  level: 0 | 1;
  section: string;
  label: string;

  perM3: number;
  perMonth: number;
  total: number;
  pct: number;

  isParent: boolean;
};

function makeFromTotal(section: string, label: string, total: number, level: 0 | 1, isParent: boolean): Line {
  const t = toNum(total);
  return {
    level,
    section,
    label,
    isParent,
    total: t,
    perMonth: safeDiv(t, dureeMois.value),
    perM3: safeDiv(t, volumeTotal.value),
    pct: pctOfCa(t),
  };
}

function makeFromPerM3(section: string, label: string, perM3: number, level: 0 | 1, isParent: boolean): Line {
  const total = toNum(perM3) * volumeTotal.value;
  return makeFromTotal(section, label, total, level, isParent);
}

function makeFromPerMonth(section: string, label: string, perMonth: number, level: 0 | 1, isParent: boolean): Line {
  const total = toNum(perMonth) * dureeMois.value;
  return makeFromTotal(section, label, total, level, isParent);
}

/** somme des valeurs numériques d'un objet (TS strict-safe) */
function sumSectionObj(obj: any): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((s: number, v: unknown) => s + toNum(v), 0);
}

/* =========================
   BUILD SECTIONS + CHILDREN
========================= */
type SectionBlock = {
  key: string;
  title: string;
  parent: Line;
  children: Line[];
};

const blocks = computed<SectionBlock[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const out: SectionBlock[] = [];

  // 1) Transport
  {
    const key = "Transport";
    const parent = makeFromPerM3(key, "Transport", transportPrixMoyen.value, 0, true);
    const children: Line[] = [
      makeFromPerM3(key, "Prix moyen transport", transportPrixMoyen.value, 1, false),
      ...(volumePompePct.value
        ? [makeFromTotal(key, "Volume pompé (%)", 0, 1, false)] // juste pour info visuelle, valeurs seront 0 (OK)
        : []),
    ];
    out.push({ key, title: "Transport", parent, children: children.filter((x) => x.label !== "Volume pompé (%)") });
  }

  // 2) Coûts / m3 (champs)
  {
    const key = "Coûts / m³";
    const obj = v?.coutM3 ?? {};
    const filtered = Object.fromEntries(Object.entries(obj).filter(([k]) => !["id", "category"].includes(k)));
    const parentTotalPerM3 = sumSectionObj(filtered);
    const parent = makeFromPerM3(key, "Coûts / m³", parentTotalPerM3, 0, true);

    const children: Line[] = [];
    for (const k of Object.keys(filtered)) {
      const val = toNum((filtered as any)[k]);
      if (val === 0) continue;
      children.push(makeFromPerM3(key, k, val, 1, false));
    }
    out.push({ key, title: "Coûts / m³", parent, children });
  }

  // 3) Coûts / mois (champs)
  {
    const key = "Coûts / mois";
    const obj = v?.coutMensuel ?? {};
    const filtered = Object.fromEntries(Object.entries(obj).filter(([k]) => !["id", "category"].includes(k)));
    const parentPerMonth = sumSectionObj(filtered);
    const parent = makeFromPerMonth(key, "Coûts / mois", parentPerMonth, 0, true);

    const children: Line[] = [];
    for (const k of Object.keys(filtered)) {
      const val = toNum((filtered as any)[k]);
      if (val === 0) continue;
      children.push(makeFromPerMonth(key, k, val, 1, false));
    }
    out.push({ key, title: "Coûts / mois", parent, children });
  }

  // 4) Coûts occasionnels (total)
  {
    const key = "Coûts occasionnels";
    const obj = v?.coutOccasionnel ?? {};
    const filtered = Object.fromEntries(Object.entries(obj).filter(([k]) => !["id", "category"].includes(k)));
    const parentTotal = sumSectionObj(filtered);
    const parent = makeFromTotal(key, "Coûts occasionnels", parentTotal, 0, true);

    const children: Line[] = [];
    for (const k of Object.keys(filtered)) {
      const val = toNum((filtered as any)[k]);
      if (val === 0) continue;
      children.push(makeFromTotal(key, k, val, 1, false));
    }
    out.push({ key, title: "Coûts occasionnels", parent, children });
  }

  // 5) Maintenance (mensuel)
  {
    const key = "Maintenance";
    const obj = v?.maintenance ?? {};
    const filtered = Object.fromEntries(Object.entries(obj).filter(([k]) => !["id", "category"].includes(k)));
    const parentPerMonth = sumSectionObj(filtered);
    const parent = makeFromPerMonth(key, "Maintenance", parentPerMonth, 0, true);

    const children: Line[] = [];
    for (const k of Object.keys(filtered)) {
      const val = toNum((filtered as any)[k]);
      if (val === 0) continue;
      children.push(makeFromPerMonth(key, k, val, 1, false));
    }
    out.push({ key, title: "Maintenance", parent, children });
  }

  // 6) Employés (mensuel) : nb*cout
  {
    const key = "Employés";
    const e = v?.employes ?? {};
    const keys = Object.keys(e);

    const children: Line[] = [];
    let parentPerMonth = 0;

    for (const k of keys) {
      if (!k.endsWith("Nb")) continue;
      const base = k.slice(0, -2);
      const nb = toNum(e[k]);
      const cout = toNum(e[base + "Cout"]);
      const perMonth = nb * cout;
      if (perMonth === 0) continue;

      parentPerMonth += perMonth;
      children.push(makeFromPerMonth(key, base, perMonth, 1, false));
    }

    const parent = makeFromPerMonth(key, "Employés", parentPerMonth, 0, true);
    out.push({ key, title: "Employés", parent, children });
  }

  // 7) CAB amortissement (mensuel)
  {
    const key = "CAB";
    const parent = makeFromPerMonth(key, "CAB (amortissement)", amortMois.value, 0, true);
    const children: Line[] = [];
    if (amortMois.value !== 0) children.push(makeFromPerMonth(key, "Amortissement / mois", amortMois.value, 1, false));
    out.push({ key, title: "CAB", parent, children });
  }

  // 8) Autres coûts (mix unités)
  {
    const key = "Autres coûts";
    const items = v?.autresCouts?.items ?? [];
    const ca = caTotal.value;
    const vol = volumeTotal.value;
    const d = dureeMois.value;

    const children: Line[] = [];
    let parentTotal = 0;

    for (const it of items) {
      const label = String(it?.label ?? "Autre coût");
      const unite = String(it?.unite ?? "FORFAIT");
      const valeur = toNum(it?.valeur);
      let total = 0;

      if (unite === "FORFAIT") total = valeur;
      else if (unite === "MOIS") total = valeur * d;
      else if (unite === "M3") total = valeur * vol;
      else if (unite === "POURCENT_CA") total = (ca * valeur) / 100;

      if (total === 0) continue;
      parentTotal += total;

      children.push(makeFromTotal(key, `${label} (${unite})`, total, 1, false));
    }

    const parent = makeFromTotal(key, "Autres coûts", parentTotal, 0, true);
    out.push({ key, title: "Autres coûts", parent, children });
  }

  return out;
});

/* =========================
   COLLAPSE / EXPAND (default collapsed)
========================= */
const open = reactive<Record<string, boolean>>({});

function initOpenState() {
  for (const b of blocks.value) {
    if (!(b.key in open)) open[b.key] = false; // collapsed by default
  }
}
// init whenever blocks change (first render + variant change)
computed(() => blocks.value).value; // keep TS happy
onMounted(() => initOpenState());
const _blocksWatcher = computed(() => {
  initOpenState();
  return blocks.value.length;
});

function toggle(key: string) {
  open[key] = !open[key];
}
function collapseAll() {
  for (const k of Object.keys(open)) open[k] = false;
}
function expandAll() {
  for (const k of Object.keys(open)) open[k] = true;
}
</script>

<template>
  <div class="page">
    <div class="top">
      <div>
        <div class="h1">Détails</div>
        <div class="muted" v-if="variant">
          {{ variant?.title ?? "Variante" }} — {{ dureeMois }} mois
        </div>
      </div>

      <div class="actions" v-if="variant">
        <button class="btn" @click="expandAll()">Tout ouvrir</button>
        <button class="btn" @click="collapseAll()">Tout réduire</button>
      </div>
    </div>

    <div v-if="store.loading" class="card">Chargement…</div>
    <div v-else-if="store.error" class="card error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="!variant" class="card muted">Aucune variante active.</div>

      <template v-else>
        <!-- KPIs -->
        <div class="card">
          <div class="kpiGrid">
            <div class="kpi">
              <div class="k">Volume total</div>
              <div class="v">{{ n(volumeTotal, 0) }} <span class="u">m³</span></div>
            </div>

            <div class="kpi">
              <div class="k">Volume pompé</div>
              <div class="v">
                {{ n(volumePompe, 0) }} <span class="u">m³</span>
                <span class="tag">{{ n(volumePompePct, 0) }}%</span>
              </div>
            </div>

            <div class="kpi">
              <div class="k">Amortissement</div>
              <div class="v">{{ money(amortMois) }} <span class="u">/mois</span></div>
            </div>
          </div>
        </div>

        <!-- SECTIONS (collapsible) -->
        <div class="card">
          <div class="sectionTitle">Sections (hiérarchie)</div>

          <div class="tableWrap">
            <table class="table">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th class="r">/m³</th>
                  <th class="r">/mois</th>
                  <th class="r">Total</th>
                  <th class="r">%</th>
                </tr>
              </thead>

              <tbody>
                <template v-for="b in blocks" :key="b.key">
                  <!-- Parent row (BOLD total only for section) -->
                  <tr class="parentRow" @click="toggle(b.key)">
                    <td>
                      <div class="labelCell">
                        <span class="chev">{{ open[b.key] ? "▾" : "▸" }}</span>
                        <b>{{ b.parent.label }}</b>
                      </div>
                    </td>

                    <td class="r">{{ n(b.parent.perM3) }}</td>
                    <td class="r">{{ money(b.parent.perMonth) }}</td>

                    <!-- ✅ total section en gras -->
                    <td class="r"><b>{{ money(b.parent.total) }}</b></td>

                    <td class="r">{{ n(b.parent.pct) }}%</td>
                  </tr>

                  <!-- Children rows (NOT bold totals) -->
                  <tr
                    v-for="c in b.children"
                    v-show="open[b.key]"
                    :key="b.key + '::' + c.label"
                    class="childRow"
                  >
                    <td>
                      <div class="labelCell child">
                        <span class="indent">—</span>
                        <span>{{ c.label }}</span>
                      </div>
                    </td>
                    <td class="r">{{ n(c.perM3) }}</td>
                    <td class="r">{{ money(c.perMonth) }}</td>

                    <!-- ✅ total coût NON gras -->
                    <td class="r">{{ money(c.total) }}</td>

                    <td class="r">{{ n(c.pct) }}%</td>
                  </tr>

                  <!-- If no children -->
                  <tr v-if="open[b.key] && b.children.length === 0" class="childRow empty">
                    <td class="muted" colspan="5" style="padding-left: 36px;">Aucun détail (valeurs = 0).</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <div class="muted" style="margin-top:8px">
            % = part du CA total (CA = PV moyen × volume total). Les champs à 0 sont masqués.
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; gap:10px; padding:12px; }
.top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap; }
.h1 { font-size:16px; font-weight:900; margin:0; }
.muted { color:#6b7280; font-size:12px; }

.actions { display:flex; gap:8px; }
.btn { border:1px solid #d1d5db; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer; }
.btn:hover { background:#f9fafb; }

.card { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:12px; }
.error { border-color:#ef4444; background:#fff5f5; }

.kpiGrid {
  display:grid;
  grid-template-columns: repeat(3, minmax(200px, 1fr));
  gap:10px;
}
@media (max-width: 980px) { .kpiGrid { grid-template-columns: 1fr; } }

.kpi { border:1px solid #eef2f7; border-radius:12px; padding:10px; background:#fcfcfd; }
.k { font-size:11px; color:#6b7280; }
.v { font-size:15px; font-weight:900; margin-top:2px; display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; }
.u { font-size:12px; font-weight:600; color:#6b7280; }
.tag { border:1px solid #e5e7eb; background:#fff; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700; color:#111827; }

.sectionTitle { font-weight:900; font-size:13px; margin-bottom:10px; }

.tableWrap { overflow:auto; }
.table { width:100%; border-collapse:collapse; font-size:12px; }
.table th, .table td { border-bottom:1px solid #e5e7eb; padding:7px 8px; text-align:left; vertical-align:top; }
.table th { background:#fafafa; color:#6b7280; font-size:11px; }
.r { text-align:right; }

/* parent/child */
.parentRow { background:#fcfcfd; cursor:pointer; user-select:none; }
.parentRow:hover { background:#f8fafc; }

.childRow { background:#fff; }
.childRow.empty { background:#fff; }

.labelCell { display:flex; align-items:center; gap:8px; }
.labelCell.child { padding-left: 18px; }
.chev { width: 16px; display:inline-block; color:#6b7280; }
.indent { width: 16px; display:inline-block; color:#9ca3af; }
</style>
