<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

// Heroicons Vue
import {
  ChartBarIcon,
  FolderIcon,
  BookOpenIcon,
  ArchiveBoxIcon,
  ArrowsRightLeftIcon,
  DocumentPlusIcon,
  InformationCircleIcon,
  UserGroupIcon,
  UserIcon,
  CurrencyDollarIcon,
  PlusCircleIcon,
  ClipboardDocumentIcon,
  CubeIcon,
  TruckIcon,
  BeakerIcon,
  ScaleIcon,
  BuildingLibraryIcon,
  WrenchIcon,
  CalendarIcon,
  UsersIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
  EnvelopeOpenIcon
} from '@heroicons/vue/24/outline'

const router = useRouter()

const openSections = ref({
  general: true,
  variante: true,
  generalVariante: true,
  formules: true,
  couts: true,
  devis: true,
})

const activeItem = ref('Mes P&L')

function goToPage(name: string) {
  activeItem.value = name
  router.push({ name: 'PageView', params: { name } })
}

// Icon mapping
const icons: Record<string, any> = {
  'Mes P&L': ChartBarIcon,
  'Répertoire MP': FolderIcon,
  'Catalogue formules': BookOpenIcon,
  'P&L archivés': ArchiveBoxIcon,
  'Comparateur de variantes': ArrowsRightLeftIcon,
  'Générer devis multi-variantes': DocumentPlusIcon,
  'Informations': InformationCircleIcon,
  'A la charge de LHM': UserGroupIcon,
  'A la charge du client': UserIcon,
  'Prix complémentaires': CurrencyDollarIcon,
  'Articles supplémentaires': PlusCircleIcon,
  'Récapitulatif de la variante': ClipboardDocumentIcon,
  'Formules de la variante': BeakerIcon,
  'Quantité et MOMD': ScaleIcon,
  'CAB': BuildingLibraryIcon,
  'Maintenance': WrenchIcon,
  'Cout au m3': CubeIcon,
  'Cout au mois': CalendarIcon,
  'Cout employés': UsersIcon,
  'Couts occasionnels': CurrencyDollarIcon,
  'Autres couts': EllipsisHorizontalIcon,
  'Majorations': PlusIcon,
  'Nouveau Devis': DocumentPlusIcon,
  'Devis communiqués au client': EnvelopeOpenIcon
}
</script>

<template>
<aside class="sidebar">
  <!-- Logo -->
  <div class="logo-section">
    <h1>PnL Creator</h1>
  </div>

  <!-- Profil -->
  <div class="profile-section">
    <img class="profile-img" src="https://cdn-icons-png.flaticon.com/512/3135/3135715.png" alt="Profil" />
    <div class="profile-info">
      <div class="name">Saad Lahlimi</div>
      <div class="role">Responsable P&L</div>
    </div>
  </div>

  <!-- Section Général -->
  <div class="section">
    <h2 class="section-title" @click="openSections.general = !openSections.general">
      Général
      <span class="arrow">{{ openSections.general ? '▾' : '▸' }}</span>
    </h2>
    <nav v-show="openSections.general" class="nav-items">
      <div
        v-for="item in ['Mes P&L','Répertoire MP','Catalogue formules','P&L archivés','Comparateur de variantes','Générer devis multi-variantes']"
        :key="item"
        :class="['item', { active: activeItem === item }]"
        @click="goToPage(item)"
      >
        <component v-if="icons[item]" :is="icons[item]" class="icon" />
        {{ item }}
      </div>
    </nav>
  </div>

  <!-- Variante active -->
  <div class="section">
    <h2 class="section-title" @click="openSections.variante = !openSections.variante">
      Variante active
      <span class="arrow">{{ openSections.variante ? '▾' : '▸' }}</span>
    </h2>
    <div v-show="openSections.variante" class="sub-sections">

      <!-- Général -->
      <div class="main-section">
        <div class="main-title" @click="openSections.generalVariante = !openSections.generalVariante">
          Général
          <span class="arrow">{{ openSections.generalVariante ? '▾' : '▸' }}</span>
        </div>
        <nav v-show="openSections.generalVariante" class="nav-items sub-nav">
          <div
            v-for="item in ['Informations','A la charge de LHM','A la charge du client','Prix complémentaires','Articles supplémentaires','Récapitulatif de la variante']"
            :key="item"
            :class="['item', { active: activeItem === item }]"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- Matière première -->
      <div class="main-section">
        <div
          class="main-title"
          :class="{ active: activeItem==='Matière première' }"
          @click="goToPage('Matière première')"
        >
          Matière première
          <span class="arrow">▸</span>
        </div>
      </div>

      <!-- Transport -->
      <div class="main-section">
        <div
          class="main-title"
          :class="{ active: activeItem==='Transport' }"
          @click="goToPage('Transport')"
        >
          Transport
          <span class="arrow">▸</span>
        </div>
      </div>

      <!-- Formules -->
      <div class="main-section">
        <div class="main-title" @click="openSections.formules = !openSections.formules">
          Formules
          <span class="arrow">{{ openSections.formules ? '▾' : '▸' }}</span>
        </div>
        <nav v-show="openSections.formules" class="nav-items sub-nav">
          <div
            v-for="item in ['Formules de la variante','Quantité et MOMD']"
            :key="item"
            :class="['item', { active: activeItem === item }]"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- Coûts -->
      <div class="main-section">
        <div class="main-title" @click="openSections.couts = !openSections.couts">
          Coûts et charges
          <span class="arrow">{{ openSections.couts ? '▾' : '▸' }}</span>
        </div>
        <nav v-show="openSections.couts" class="nav-items sub-nav">
          <div
            v-for="item in ['CAB','Maintenance','Cout au m3','Cout au mois','Cout employés','Couts occasionnels','Autres couts']"
            :key="item"
            :class="['item', { active: activeItem === item }]"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

      <!-- Devis -->
      <div class="main-section">
        <div class="main-title" @click="openSections.devis = !openSections.devis">
          Devis
          <span class="arrow">{{ openSections.devis ? '▾' : '▸' }}</span>
        </div>
        <nav v-show="openSections.devis" class="nav-items sub-nav">
          <div
            v-for="item in ['Majorations','Nouveau Devis','Devis communiqués au client']"
            :key="item"
            :class="['item', { active: activeItem === item }]"
            @click="goToPage(item)"
          >
            <component :is="icons[item]" class="icon" />
            {{ item }}
          </div>
        </nav>
      </div>

    </div>
  </div>
</aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  background: #f8f9fa;
  padding:16px;
  height:100vh;
  overflow-y:auto;
  font-family:"Inter",sans-serif;
  box-shadow:2px 0 8px rgba(0,0,0,0.05);
}

.logo-section h1 {
  background: linear-gradient(135deg,#007a33,#009ee0);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  margin-bottom:16px;
  font-size:1.5rem;
  font-weight:700;
}

.profile-section {
  display:flex; align-items:center; gap:12px; margin-bottom:16px;
}
.profile-img { width:36px; height:36px; border-radius:50%; border:1px solid #ccc; }
.profile-info .name { font-weight:600; font-size:0.95rem; }
.profile-info .role { font-size:0.8rem; color:#666; }

.section-title {
  font-weight:600;
  font-size:0.95rem;
  cursor:pointer;
  margin-bottom:6px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  background:linear-gradient(90deg,#007a33,#009ee0);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
}
.arrow { font-size:0.8rem; }

.nav-items { display:flex; flex-direction:column; margin-bottom:8px; }
.nav-items .item {
  padding:6px 10px;
  cursor:pointer;
  border-radius:6px;
  transition:all 0.2s;
  font-size:0.9rem;
  color:#333;
  display:flex;
  align-items:center;
  gap:8px;
}
.nav-items .item:hover { background:#e0f2f1; transform:translateX(2px); }
.nav-items .item.active { background:#007a33; color:white; }

.sub-sections { padding-left:12px; }
.main-section { margin-bottom:6px; }
.main-title {
  font-weight:600;
  font-size:0.95rem;
  cursor:pointer;
  padding:6px 10px;
  display:flex;
  justify-content:space-between;
  align-items:center;
  border-radius:6px;
  transition:all 0.2s;
}
.main-title:hover { background:#e0f2f1; }
.main-title.active { background:#007a33; color:white; }
.sub-nav .item { font-weight:400; padding-left:18px; font-size:0.88rem; }
.icon { width:16px;height:16px; }
</style>
