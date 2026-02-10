<!-- ✅ src/pages/DetailsPage.vue (FICHIER COMPLET) -->
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilSquareIcon,
  Squares2X2Icon,
} from "@heroicons/vue/24/outline";

const router = useRouter();
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
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toNum(v));
}
function money(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "MAD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
}
function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/* =========================
   ACTIVE
========================= */
const variant = computed<any>(() => (store as any).activeVariant ?? null);
const contract = computed<any>(() => (store as any).activeContract ?? null);

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
  const vmp = ((variant.value as any)?.mp?.items ?? []).find((x: any) => String(x.mpId) === String(mpId));
  if (!vmp) return 0;
  if (vmp?.prix != null) return toNum(vmp.prix);
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
   NAVIGATION (sidebar items)
========================= */
const sectionToSidebarItem: Record<string, string> = {
  Transport: "Transport",
  "Coûts / m³": "Cout au m3",
  "Coûts / mois": "Cout au mois",
  "Coûts occasionnels": "Couts occasionnels",
  Maintenance: "Maintenance",
  Employés: "Cout employés",
  CAB: "CAB",
  "Autres coûts": "Autres couts",
};

function goToSidebarItem(item: string) {
  const routeByItem: Record<string, string> = {
    Transport: "Transport",
    CAB: "CAB",
    MP: "Mp",

    Maintenance: "Maintenance",
    "Cout au m3": "cout au m3",
    "Cout au mois": "CoutMensuel",
    "Cout employés": "CoutEmployes",
    "Couts occasionnels": "CoutsOccasionnels",
    "Autres couts": "AutresCouts",

    Formules: "Formules",
    "Qté et MOMD": "MomdAndQuantity",
  };

  const rn = routeByItem[item];
  if (rn) {
    router.push({ name: rn });
    return;
  }

  const pageNameMap: Record<string, string> = {
    Maintenance: "Variante/Sections/Couts/Maintenance",
    "Cout au m3": "Variante/Sections/Couts/Cout au m3",
    "Cout au mois": "Variante/Sections/Couts/Cout au mois",
    "Cout employés": "Variante/Sections/Couts/Cout employés",
    "Couts occasionnels": "Variante/Sections/Couts/Couts occasionnels",
    "Autres couts": "Variante/Sections/Couts/Autres couts",
  };

  const pageName = pageNameMap[item] ?? item;
  router.push({ name: "PageView", params: { name: pageName } });
}

function editSection(blockKey: string) {
  const item = sectionToSidebarItem[blockKey];
  if (!item) return;
  goToSidebarItem(item);
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
  return makeFromTotal(section, label, toNum(perM3) * volumeTotal.value, level, isParent);
}
function makeFromPerMonth(section: string, label: string, perMonth: number, level: 0 | 1, isParent: boolean): Line {
  return makeFromTotal(section, label, toNum(perMonth) * dureeMois.value, level, isParent);
}
function sumSectionObj(obj: any): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((s: number, v: unknown) => s + toNum(v), 0);
}

/* =========================
   BUILD BLOCKS
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
    const children: Line[] = [makeFromPerM3(key, "Prix moyen transport", transportPrixMoyen.value, 1, false)];
    out.push({ key, title: "Transport", parent, children });
  }

  // 2) Coûts / m3
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

  // 3) Coûts / mois
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

  // 6) Employés (mensuel)
  {
    const key = "Employés";
    const e = v?.employes ?? {};
    const keys = Object.keys(e);

    const children: Line[] = [];
    let parentPerMonth = 0;

    for (const k of keys) {
      if (!k.endsWith("Nb")) continue;
      const base = k.slice(0, -2);
      const nb = toNum((e as any)[k]);
      const cout = toNum((e as any)[base + "Cout"]);
      const perMonth = nb * cout;
      if (perMonth === 0) continue;

      parentPerMonth += perMonth;
      children.push(makeFromPerMonth(key, base, perMonth, 1, false));
    }

    const parent = makeFromPerMonth(key, "Employés", parentPerMonth, 0, true);
    out.push({ key, title: "Employés", parent, children });
  }

  // 7) CAB (mensuel)
  {
    const key = "CAB";
    const parent = makeFromPerMonth(key, "CAB (amortissement)", amortMois.value, 0, true);
    const children: Line[] = [];
    if (amortMois.value !== 0) children.push(makeFromPerMonth(key, "Amortissement / mois", amortMois.value, 1, false));
    out.push({ key, title: "CAB", parent, children });
  }

  // 8) Autres coûts
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
   ACCORDION STATE
========================= */
const open = reactive<Record<string, boolean>>({});

function initOpenState() {
  for (const b of blocks.value) if (!(b.key in open)) open[b.key] = false;
}
onMounted(() => initOpenState());
computed(() => {
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

/* =========================
   QUICK META
========================= */
const headerTitle = computed(() => {
  if (!variant.value) return "Détails";
  const t = variant.value?.title ?? "Variante";
  const c = contract.value?.title ?? contract.value?.name ?? "Contrat";
  return `${t} — ${c}`;
});
</script>

<template>
  <div class="page">
    <div class="head">
      <div class="hLeft">
        <div class="hTop">
          <Squares2X2Icon class="hIc" />
          <div class="hTitle ellipsis" :title="headerTitle">{{ headerTitle }}</div>
        </div>
        <div class="hSub muted ellipsis" v-if="variant">
          Durée: <b>{{ dureeMois }}</b> mois • Volume: <b>{{ n(volumeTotal, 0) }}</b> m³ • CA estimé:
          <b>{{ money(caTotal, 0) }}</b>
        </div>
      </div>

      <div class="hRight" v-if="variant">
        <button class="btn ghost" type="button" @click="expandAll" title="Ouvrir toutes les sections">
          <ChevronDownIcon class="btnic" />
          Tout ouvrir
        </button>
        <button class="btn ghost" type="button" @click="collapseAll" title="Réduire toutes les sections">
          <ChevronRightIcon class="btnic" />
          Tout réduire
        </button>
      </div>
    </div>

    <div v-if="(store as any).loading" class="alert info">Chargement…</div>
    <div v-else-if="(store as any).error" class="alert error"><b>Erreur :</b> {{ (store as any).error }}</div>

    <template v-else>
      <div v-if="!variant" class="alert muted">Aucune variante active.</div>

      <template v-else>
        <div class="grid3">
          <div class="card">
            <div class="k">Volume total</div>
            <div class="v num">
              {{ n(volumeTotal, 0) }} <span class="u">m³</span>
            </div>
          </div>

          <div class="card">
            <div class="k">Volume pompé</div>
            <div class="v num">
              {{ n(volumePompe, 0) }} <span class="u">m³</span>
              <span class="pill">{{ n(volumePompePct, 0) }}%</span>
            </div>
          </div>

          <div class="card">
            <div class="k">Amortissement CAB</div>
            <div class="v num">
              {{ money(amortMois, 0) }} <span class="u">/mois</span>
            </div>
          </div>
        </div>

        <div class="box">
          <div class="boxHead">
            <div class="bhLeft">
              <div class="bhTitle">Sections</div>
              <div class="bhHint muted">
                % = part du CA (CA = PV moyen × volume). Les champs à 0 sont masqués.
              </div>
            </div>
          </div>

          <div class="acc">
            <div v-for="b in blocks" :key="b.key" class="accItem">
              <div class="accRow">
                <button
                  class="chevBtn"
                  type="button"
                  @click="toggle(b.key)"
                  :title="open[b.key] ? 'Réduire' : 'Ouvrir'"
                >
                  <component :is="open[b.key] ? ChevronDownIcon : ChevronRightIcon" class="chevIc" />
                </button>

                <button class="rowMain" type="button" @click="editSection(b.key)" :title="'Éditer: ' + b.key">
                  <div class="rowTitle ellipsis">
                    <b>{{ b.parent.label }}</b>
                  </div>
                  <div class="rowSub muted ellipsis">
                    /m³ {{ n(b.parent.perM3) }} • /mois {{ money(b.parent.perMonth, 0) }} • Total
                    <b>{{ money(b.parent.total, 0) }}</b> • {{ n(b.parent.pct, 1) }}%
                  </div>
                </button>

                <button class="editBtn" type="button" @click="editSection(b.key)" title="Ouvrir la section">
                  <PencilSquareIcon class="editIc" />
                </button>
              </div>

              <div v-show="open[b.key]" class="accBody">
                <div v-if="b.children.length === 0" class="empty muted">Aucun détail (valeurs = 0).</div>

                <div v-else class="tblWrap">
                  <table class="tbl">
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
                      <tr v-for="c in b.children" :key="b.key + '::' + c.label">
                        <td class="ellipsis" :title="c.label">{{ c.label }}</td>
                        <td class="r">{{ n(c.perM3) }}</td>
                        <td class="r">{{ money(c.perMonth, 0) }}</td>
                        <td class="r">{{ money(c.total, 0) }}</td>
                        <td class="r">{{ n(c.pct, 1) }}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div class="foot muted">Astuce: clic sur le titre d’une section pour l’éditer. Chevron = ouvrir/fermer.</div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page {
  --text: #0f172a;
  --muted: rgba(15, 23, 42, 0.62);
  --border: rgba(16, 24, 40, 0.12);
  --soft: rgba(15, 23, 42, 0.04);
  --soft2: rgba(15, 23, 42, 0.02);

  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 10px 14px;
}
.muted { color: var(--muted); }
.ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-variant-numeric: tabular-nums; }

/* header */
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  background: linear-gradient(180deg, #eef1f6 0%, #ffffff 55%);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px 12px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08);
}
.hLeft { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
.hTop { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
.hIc { width: 18px; height: 18px; color: rgba(15, 23, 42, 0.75); flex: 0 0 auto; }
.hTitle { font-size: 13px; font-weight: 950; color: var(--text); }
.hSub { font-size: 12px; }

.hRight { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }

.btn {
  height: 34px;
  border: 1px solid var(--border);
  background: rgba(15, 23, 42, 0.04);
  border-radius: 14px;
  padding: 0 12px;
  font-weight: 950;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.86);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.btn:hover { background: rgba(32, 184, 232, 0.12); border-color: rgba(32, 184, 232, 0.18); }
.btn.ghost { background: rgba(255, 255, 255, 0.75); }
.btnic { width: 16px; height: 16px; }

/* alerts */
.alert {
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
  font-size: 12.5px;
}
.alert.info { border-color: rgba(37, 99, 235, 0.25); background: rgba(37, 99, 235, 0.06); }
.alert.error { border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); }

/* KPI grid */
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 10px;
}
@media (max-width: 980px) { .grid3 { grid-template-columns: 1fr; } }

.card {
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 16px;
  padding: 10px 12px;
  background: linear-gradient(180deg, var(--soft2), rgba(255, 255, 255, 0.92));
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
  min-width: 0;
}
.k { font-size: 10.5px; font-weight: 950; color: rgba(15, 23, 42, 0.55); }
.v {
  margin-top: 4px;
  font-size: 14px;
  font-weight: 950;
  color: var(--text);
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  min-width: 0;
}
.u { font-size: 11px; font-weight: 900; color: rgba(15, 23, 42, 0.55); }
.pill {
  border: 1px solid rgba(16, 24, 40, 0.12);
  background: rgba(255, 255, 255, 0.9);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 950;
  color: rgba(15, 23, 42, 0.86);
}

/* box */
.box {
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.06);
}
.boxHead {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
}
.bhLeft { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.bhTitle { font-size: 12.5px; font-weight: 950; color: var(--text); }
.bhHint { font-size: 11px; }

.acc { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px 12px; }
.accItem {
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 16px;
  background: #fff;
  overflow: hidden;
}
.accRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.02);
}
.chevBtn {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(255, 255, 255, 0.75);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.chevBtn:hover { background: rgba(32, 184, 232, 0.12); border-color: rgba(32, 184, 232, 0.18); }
.chevIc { width: 18px; height: 18px; color: rgba(15, 23, 42, 0.75); }

.rowMain {
  border: 0;
  background: transparent;
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  padding: 0;
}
.rowTitle { font-size: 12.5px; font-weight: 950; color: var(--text); }
.rowSub { margin-top: 2px; font-size: 11.5px; font-weight: 850; }

.editBtn {
  width: 34px;
  height: 34px;
  border-radius: 14px;
  border: 1px solid rgba(16, 24, 40, 0.10);
  background: rgba(24, 64, 112, 0.92);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex: 0 0 auto;
}
.editBtn:hover { background: rgba(24, 64, 112, 1); }
.editIc { width: 18px; height: 18px; color: #fff; }

.accBody { padding: 10px; background: #fff; }
.empty { font-size: 12px; font-weight: 850; padding: 4px 2px; }

.tblWrap {
  border: 1px solid rgba(16, 24, 40, 0.10);
  border-radius: 14px;
  overflow: auto;
  background: #fff;
}
.tbl {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  table-layout: fixed;
  font-size: 12px;
}
.tbl th, .tbl td {
  border-bottom: 1px solid rgba(16, 24, 40, 0.08);
  padding: 8px 10px;
  text-align: left;
  white-space: nowrap;
}
.tbl thead th {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.02), rgba(15, 23, 42, 0.04));
  color: rgba(15, 23, 42, 0.55);
  font-size: 10px;
  font-weight: 950;
  letter-spacing: 0.2px;
}
.r { text-align: right; }
.tbl td:first-child { min-width: 260px; }
.tbl td:first-child.ellipsis { display: block; }

.foot {
  border-top: 1px solid rgba(16, 24, 40, 0.08);
  padding: 10px 12px;
  font-size: 11.5px;
  font-weight: 850;
}
</style>
