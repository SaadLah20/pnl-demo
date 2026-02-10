<!-- ✅ src/pages/DetailsPage.vue (FICHIER COMPLET / header sticky COMPACT sans augmenter la hauteur) -->
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import { usePnlStore } from "@/stores/pnl.store";
import { PencilSquareIcon } from "@heroicons/vue/24/outline";

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
function fmt(v: any, digits = 2) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNum(v));
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
const variant = computed<any>(() => store.activeVariant as any);
const contract = computed<any>(() => store.activeContract as any);
const dureeMois = computed<number>(() => Math.max(1, toNum(contract.value?.dureeMois) || 1));

const formules = computed<any[]>(() => (variant.value?.formules?.items ?? []) as any[]);
const volumeTotal = computed<number>(() => formules.value.reduce((s, vf) => s + toNum(vf?.volumeM3), 0));

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
   NAVIGATION
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
"Cout au m3": "CoutM3",
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
  const total = toNum(perM3) * volumeTotal.value;
  return makeFromTotal(section, label, total, level, isParent);
}
function makeFromPerMonth(section: string, label: string, perMonth: number, level: 0 | 1, isParent: boolean): Line {
  const total = toNum(perMonth) * dureeMois.value;
  return makeFromTotal(section, label, total, level, isParent);
}
function sumSectionObj(obj: any): number {
  if (!obj) return 0;
  return Object.values(obj).reduce((s: number, v: unknown) => s + toNum(v), 0);
}

/* =========================
   BUILD SECTIONS + CHILDREN
========================= */
type SectionBlock = {
  key: string;
  parent: Line;
  children: Line[];
};

const blocks = computed<SectionBlock[]>(() => {
  const v = variant.value;
  if (!v) return [];

  const out: SectionBlock[] = [];

  {
    const key = "Transport";
    const parent = makeFromPerM3(key, "Transport", transportPrixMoyen.value, 0, true);
    const children: Line[] = [makeFromPerM3(key, "Prix moyen transport", transportPrixMoyen.value, 1, false)];
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

  {
    const key = "CAB";
    const amortMois = toNum(v?.cab?.amortMois);
    const parent = makeFromPerMonth(key, "CAB (amortissement)", amortMois, 0, true);
    const children: Line[] = [];
    if (amortMois !== 0) children.push(makeFromPerMonth(key, "Amortissement / mois", amortMois, 1, false));
    out.push({ key, parent, children });
  }

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
    out.push({ key, parent, children });
  }

  return out;
});

/* =========================
   COLLAPSE / EXPAND
========================= */
const open = reactive<Record<string, boolean>>({});

function initOpenState() {
  for (const b of blocks.value) if (!(b.key in open)) open[b.key] = false;
}
onMounted(() => initOpenState());
const _sync = computed(() => {
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
    <!-- ✅ STICKY HEADER (COMPACT: hauteur identique, pas plus) -->
    <div class="pageHead">
      <div class="headL">
        <div class="h1">Détails</div>
        <div class="sub" v-if="variant">
          <span class="pill" :title="variant?.title ?? 'Variante'">{{ variant?.title ?? "Variante" }}</span>
          <span class="dot">•</span>
          <span class="pill">{{ dureeMois }} mois</span>
          <span class="dot">•</span>
          <span class="pill">Vol {{ fmt(volumeTotal, 0) }} m³</span>
        </div>
      </div>

      <div class="headR" v-if="variant">
        <button class="btn" @click="expandAll()">Ouvrir</button>
        <button class="btn" @click="collapseAll()">Réduire</button>
      </div>
    </div>

    <div v-if="store.loading" class="panel">Chargement…</div>
    <div v-else-if="store.error" class="panel error"><b>Erreur :</b> {{ store.error }}</div>

    <template v-else>
      <div v-if="!variant" class="panel muted">Aucune variante active.</div>

      <template v-else>
        <div class="panel">
          <div class="sectionHead">
            <div class="sectionTitle">Sections</div>
            <div class="hint">% = part du CA total. Valeurs 0 masquées.</div>
          </div>

          <div class="list">
            <div v-for="b in blocks" :key="b.key" class="blk">
              <!-- parent -->
              <div class="row parent">
                <div class="cell label">
                  <button class="chevBtn" type="button" @click.stop="toggle(b.key)" :aria-label="'toggle ' + b.key">
                    <span class="chev">{{ open[b.key] ? "▾" : "▸" }}</span>
                  </button>

                  <button class="sectionLink" type="button" @click.stop="editSection(b.key)" :title="'Ouvrir: ' + b.key">
                    <b class="lblTxt">{{ b.parent.label }}</b>
                  </button>
                </div>

                <div class="nums">
                  <div class="numBox small">
                    <div class="nbLab">/m³</div>
                    <div class="nbVal">
                      <span class="val">{{ fmt(b.parent.perM3, 2) }}</span>
                      <span class="unit">MAD</span>
                    </div>
                  </div>

                  <div class="numBox">
                    <div class="nbLab">/mois</div>
                    <div class="nbVal">
                      <span class="val">{{ money(b.parent.perMonth, 0) }}</span>
                      <span class="unit"></span>
                    </div>
                  </div>

                  <div class="numBox">
                    <div class="nbLab">Total</div>
                    <div class="nbVal">
                      <span class="val strong">{{ money(b.parent.total, 0) }}</span>
                      <span class="unit"></span>
                    </div>
                  </div>

                  <div class="numBox tiny">
                    <div class="nbLab">%</div>
                    <div class="nbVal">
                      <span class="val pct">{{ fmt(b.parent.pct, 2) }}</span>
                      <span class="unit">%</span>
                    </div>
                  </div>

                  <button class="iconBtn" type="button" @click.stop="editSection(b.key)" title="Éditer">
                    <PencilSquareIcon class="icon" />
                  </button>
                </div>
              </div>

              <!-- children -->
              <div v-show="open[b.key]" class="children">
                <div v-if="b.children.length === 0" class="empty muted">Aucun détail (valeurs = 0).</div>

                <div v-for="c in b.children" :key="b.key + '::' + c.label" class="row child">
                  <div class="cell label childLab">
                    <span class="indent">—</span>
                    <span class="lblTxt childTxt" :title="c.label">{{ c.label }}</span>
                  </div>

                  <div class="nums nums-child">
                    <div class="numBox small detail">
                      <div class="nbLab">/m³</div>
                      <div class="nbVal">
                        <span class="val">{{ fmt(c.perM3, 2) }}</span>
                        <span class="unit">MAD</span>
                      </div>
                    </div>

                    <div class="numBox detail">
                      <div class="nbLab">/mois</div>
                      <div class="nbVal">
                        <span class="val">{{ money(c.perMonth, 0) }}</span>
                        <span class="unit"></span>
                      </div>
                    </div>

                    <div class="numBox detail">
                      <div class="nbLab">Total</div>
                      <div class="nbVal">
                        <span class="val">{{ money(c.total, 0) }}</span>
                        <span class="unit"></span>
                      </div>
                    </div>

                    <div class="numBox tiny detail">
                      <div class="nbLab">%</div>
                      <div class="nbVal">
                        <span class="val pct">{{ fmt(c.pct, 2) }}</span>
                        <span class="unit">%</span>
                      </div>
                    </div>

                    <div class="iconGhost"></div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="blocks.length === 0" class="panel muted" style="box-shadow:none; border-style:dashed;">
              Aucune section.
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.page{
  --text:#0f172a;
  --muted: rgba(15,23,42,0.64);
  --border: rgba(16,24,40,0.12);
  --soft2: rgba(15,23,42,0.03);

  display:flex;
  flex-direction:column;
  gap:8px;
  padding: 0 10px 12px;
}

/* ✅ sticky header under HeaderDashboard (hauteur compacte) */
.pageHead{
  position: sticky;
  top: -15px; /* adapte si nécessaire */
  z-index: 30;

  display:flex;
  justify-content:space-between;
  align-items:flex-end;
  gap:10px;

  padding: 8px 0;              /* ✅ compact */
  background: rgba(248,250,252,0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(16,24,40,0.08);
}

.headL{
  display:flex;
  flex-direction:column;
  gap:4px;                     /* ✅ compact */
  min-width:0;
}
.h1{
  font-size:14px;              /* ✅ idem style projet */
  font-weight:1000;
  color: var(--text);
  line-height:1.05;
}
.sub{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  min-width:0;
  font-size: 11.5px;
  color: var(--muted);
}
.dot{ color: rgba(148,163,184,1); font-weight: 900; }
.pill{
  max-width: 48vw;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;

  border:1px solid rgba(16,24,40,0.10);
  background: rgba(255,255,255,0.82);
  border-radius: 999px;
  padding: 2px 8px;            /* ✅ compact */
  font-size: 11px;
  font-weight: 950;
  color: rgba(15,23,42,0.78);
}

.headR{
  display:flex;
  gap:8px;
  align-items:center;
  flex-wrap:wrap;
}

/* buttons (compact height) */
.btn{
  border:1px solid var(--border);
  background: rgba(255,255,255,0.80);
  border-radius:12px;
  padding:6px 10px;
  font-size:12px;
  font-weight:900;
  color: rgba(15,23,42,0.86);
  cursor:pointer;
  box-shadow: 0 4px 14px rgba(15,23,42,0.06);
  height: 30px;
}
.btn:hover{
  background: rgba(32,184,232,0.12);
  border-color: rgba(32,184,232,0.18);
}

/* panels */
.panel{
  background: rgba(255,255,255,0.92);
  border:1px solid var(--border);
  border-radius:16px;
  padding:10px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.06);
}
.error{ border-color: rgba(239,68,68,0.45); background: rgba(255,245,245,0.92); }
.muted{ color:var(--muted); font-size:12px; }

/* section head */
.sectionHead{
  display:flex;
  align-items:flex-end;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  margin-bottom:8px;
}
.sectionTitle{ font-size:12px; font-weight:950; color: var(--text); }
.hint{ font-size:11px; color: var(--muted); }

/* list */
.list{ display:flex; flex-direction:column; gap:8px; }
.blk{
  border:1px solid rgba(16,24,40,0.10);
  border-radius:14px;
  overflow:hidden;
  background:#fff;
}

/* rows (compact height) */
.row{
  display:flex;
  align-items:stretch;
  justify-content:space-between;
  gap:10px;
  padding:7px 10px;            /* ✅ compact */
}
.row.parent{ background: rgba(15,23,42,0.02); }
.row.parent:hover{ background: rgba(32,184,232,0.06); }
.row.child{
  border-top:1px solid rgba(16,24,40,0.08);
  background:#fff;
  padding:6px 10px;            /* ✅ compact */
}

/* label area */
.cell.label{
  display:flex;
  align-items:center;
  gap:8px;
  min-width: 240px;
  flex: 1 1 auto;
  overflow:hidden;
}
.lblTxt{
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  max-width: 520px;
}
.childTxt{ font-weight: 850; font-size: 11.5px; }
.indent{ width:16px; display:inline-block; color: rgba(15,23,42,0.35); }

.chevBtn{
  border:1px solid transparent;
  background: transparent;
  cursor:pointer;
  padding: 2px 6px;
  border-radius: 10px;
  height: 26px;
}
.chevBtn:hover{
  background: rgba(15,23,42,0.04);
  border-color: rgba(16,24,40,0.10);
}
.chev{ width:16px; display:inline-block; color: rgba(15,23,42,0.55); font-weight:900; }

.sectionLink{
  border:0;
  background: transparent;
  cursor:pointer;
  padding: 2px 6px;
  border-radius: 10px;
  text-align:left;
  color: var(--text);
  height: 26px;
  display:flex;
  align-items:center;
  min-width: 0;
}
.sectionLink:hover{ background: rgba(15,23,42,0.04); }

/* numeric aligned area */
.nums{
  display:grid;
  grid-template-columns: 108px 144px 168px 96px 40px;
  gap:8px;
  align-items:stretch;
  flex: 0 0 auto;
}
.numBox{
  border:1px solid rgba(16,24,40,0.10);
  border-radius:12px;
  background: linear-gradient(180deg, rgba(248,250,252,0.9), #fff);
  padding:6px 8px;
  display:flex;
  flex-direction:column;
  justify-content:center;
  min-width:0;
}
.numBox.tiny{ background: rgba(15,23,42,0.03); }

.nbLab{
  font-size:10px;
  font-weight:950;
  color: rgba(15,23,42,0.50);
  line-height:1.05;
}
.nbVal{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  gap:8px;
  margin-top:2px;
  min-width:0;
}
.nbVal .val{
  font-size:12.5px;
  font-weight:950;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  min-width: 0;
}
.nbVal .val.strong{ font-weight: 1000; }
.nbVal .unit{
  font-size:10.5px;
  font-weight:950;
  color: rgba(15,23,42,0.50);
  white-space: nowrap;
  flex: 0 0 auto;
}
.nbVal .val.pct{
  overflow: visible;
  text-overflow: clip;
  min-width: 54px;
}

/* details */
.numBox.detail{
  padding:5px 7px;
  border-radius:11px;
  background: rgba(15,23,42,0.02);
  border-color: rgba(16,24,40,0.08);
}
.numBox.detail .nbLab{ font-size: 9.5px; }
.numBox.detail .nbVal .val{ font-size: 11.5px; }
.numBox.detail .nbVal .unit{ font-size: 10px; }
.numBox.detail.tiny{ background: rgba(15,23,42,0.018); }

.iconBtn{
  border:1px solid rgba(16,24,40,0.12);
  background: rgba(15,23,42,0.04);
  border-radius:12px;
  height: 100%;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
}
.iconBtn:hover{
  background: rgba(32,184,232,0.12);
  border-color: rgba(32,184,232,0.18);
}
.icon{ width: 18px; height: 18px; color: rgba(15,23,42,0.78); }
.iconGhost{ width: 40px; }

.children{ background:#fff; }
.empty{
  padding:8px 10px;
  border-top:1px solid rgba(16,24,40,0.08);
  font-size:12px;
}

/* responsive */
@media (max-width: 980px){
  .nums{ grid-template-columns: 1fr 1fr; }
  .iconBtn, .iconGhost{ display:none; }
  .lblTxt{ max-width: 56vw; }
  .pill{ max-width: 70vw; }
}
</style>
