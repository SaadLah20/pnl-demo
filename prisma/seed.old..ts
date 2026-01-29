import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {

  /* =====================
     CATALOGUES GLOBAUX
  ===================== */

  const ciment = await prisma.mpCatalogue.create({
    data: {
      categorie: 'CIMENT',
      label: 'CPJ 55',
      unite: 'Kg',
      prix: 1.2,
      fournisseur: 'Lafarge',
      city: 'Casablanca',
      region: 'CASA',
    }
  })

  const granulat = await prisma.mpCatalogue.create({
    data: {
      categorie: 'GRANULAT',
      label: 'G1',
      unite: 'Kg',
      prix: 0.35,
      fournisseur: 'Carrière Nord',
      city: 'Casablanca',
      region: 'CASA',
    }
  })

  await prisma.formuleCatalogue.create({
    data: {
      label: 'B25 Standard',
      resistance: '25 MPa',
      city: 'Casablanca',
      region: 'CASA'
    }
  })

  /* =====================
     P&L
  ===================== */

  const pnl = await prisma.pnl.create({
    data: {
      title: 'CAB Mobile – Chantier A',
      model: 'CAB_MOBILE_CLIENT',
      client: 'Client Alpha',
      status: 'ENCOURS',
      city: 'Casablanca',
      region: 'CASA'
    }
  })

  /* =====================
     CONTRAT
  ===================== */

  const contract = await prisma.contract.create({
    data: {
      pnlId: pnl.id,

      cab: 'CLIENT',
      installation: 'LHM',
      genieCivil: 'PARTAGE',
      transport: 'LHM',
      terrain: 'CLIENT',
      matierePremiere: 'LHM',
      maintenance: 'PARTAGE',
      chargeuse: 'CLIENT',
      branchementEau: 'CLIENT',
      consoEau: 'CLIENT',
      branchementElec: 'CLIENT',
      consoElec: 'CLIENT',

      postes: 2,
      sundayPrice: 1500,
      delayPenalty: 5000,
      chillerRent: 2000
    }
  })

  /* =====================
     VARIANTE
  ===================== */

  const variant = await prisma.variant.create({
    data: {
      title: 'Variante Base',
      description: 'Hypothèse standard',
      status: 'ENCOURS',
      contractId: contract.id
    }
  })

  /* =====================
     SECTIONS
  ===================== */

  await prisma.sectionMatierePremiere.create({
    data: {
      variantId: variant.id,
      category: 'LOGISTIQUE_APPRO'
    }
  })

  await prisma.sectionTransport.create({
    data: {
      variantId: variant.id,
      category: 'LOGISTIQUE_APPRO',
      type: 'MOYENNE',
      prixMoyen: 65
    }
  })

  await prisma.sectionCab.create({
    data: {
      variantId: variant.id,
      category: 'LOGISTIQUE_APPRO',
      etat: 'NEUVE',
      mode: 'LOCATION',
      capaciteM3: 60,
      amortMois: 18000
    }
  })

  await prisma.sectionMaintenance.create({
    data: {
      variantId: variant.id,
      category: 'COUTS_CHARGES',
      cab: 3000,
      elec: 1200,
      chargeur: 800,
      generale: 1500,
      bassins: 600,
      preventive: 1000
    }
  })

  await prisma.sectionCoutM3.create({
    data: {
      variantId: variant.id,
      category: 'COUTS_CHARGES',
      eau: 2.5,
      qualite: 1.2,
      dechets: 0.8
    }
  })

  await prisma.sectionEmployes.create({
    data: {
      variantId: variant.id,
      category: 'COUTS_CHARGES',
      responsableNb: 1,
      responsableCout: 9000,
      centralistesNb: 2,
      centralistesCout: 5500
    }
  })

  await prisma.sectionDevis.create({
    data: {
      variantId: variant.id,
      category: 'DEVIS',
      surcharge: 0
    }
  })
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
