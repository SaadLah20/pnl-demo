// src/server/variant.sync.ts
import { PrismaClient } from "@prisma/client";

/**
 * ✅ Règle métier :
 * Les MP de la variante = UNION des MP utilisées dans les formules de la variante.
 * L'utilisateur ne fait que override le prix sur VariantMp (sans toucher au catalogue MP).
 *
 * Cette fonction :
 * - crée SectionMatierePremiere si besoin
 * - crée les VariantMp manquants (prix = prix catalogue)
 * - supprime les VariantMp qui ne sont plus utilisés par aucune formule
 * - conserve les prix override existants
 */
export async function syncVariantMpsFromFormules(tx: PrismaClient, variantId: string) {
  // 1) Récupérer toutes les formules de la variante + leur composition (FormuleCatalogueItem)
  const variant = await tx.variant.findUnique({
    where: { id: String(variantId) },
    include: {
      formules: {
        include: {
          items: {
            include: {
              formule: {
                include: {
                  items: true, // FormuleCatalogueItem => { mpId, qty }
                },
              },
            },
          },
        },
      },
    },
  });

  const vfItems = variant?.formules?.items ?? [];

  // 2) mpIds réellement utilisés (union)
  const usedMpIds = new Set<string>();

  for (const vf of vfItems) {
    const comp = vf?.formule?.items ?? [];
    for (const it of comp) {
      if (it?.mpId) usedMpIds.add(String(it.mpId));
    }
  }

  // 3) section MP (upsert)
  const secMp = await tx.sectionMatierePremiere.upsert({
    where: { variantId: String(variantId) },
    create: {
      variantId: String(variantId),
      category: "LOGISTIQUE_APPRO",
    },
    update: {},
  });

  // 4) MPs existantes (overrides existants à préserver)
  const existing = await tx.variantMp.findMany({
    where: { variantId: String(variantId) },
  });

  const existingByMpId = new Map<string, (typeof existing)[number]>();
  for (const row of existing) existingByMpId.set(String(row.mpId), row);

  // 5) Créer les MPs manquantes (prix = catalogue)
  for (const mpId of usedMpIds) {
    const already = existingByMpId.get(mpId);
    if (already) {
      // juste garantir sectionId
      if (already.sectionId !== secMp.id) {
        await tx.variantMp.update({
          where: { id: already.id },
          data: { sectionId: secMp.id },
        });
      }
      continue;
    }

    const mp = await tx.mpCatalogue.findUnique({ where: { id: mpId } });

    await tx.variantMp.create({
      data: {
        variantId: String(variantId),
        sectionId: secMp.id,
        mpId,
        prix: mp?.prix ?? 0,
      },
    });
  }

  // 6) Supprimer MPs qui ne sont plus utilisées
  const toDelete = existing.filter((x) => !usedMpIds.has(String(x.mpId)));
  if (toDelete.length) {
    await tx.variantMp.deleteMany({
      where: { id: { in: toDelete.map((x) => x.id) } },
    });
  }
}
