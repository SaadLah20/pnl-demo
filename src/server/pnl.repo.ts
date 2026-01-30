// server/pnl.repo.ts
import { prisma } from "./db";

export async function getPnls() {
  return prisma.pnl.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      contracts: {
        include: {
          variants: {
            include: {
              transport: true,
              cab: true,
              maintenance: true,
              coutM3: true,
              coutMensuel: true,
              coutOccasionnel: true,
              employes: true,

              autresCouts: {
                include: { items: true },
              },

              majorations: true,
              devis: true,

              mp: {
                include: {
                  items: {
                    include: { mp: true },
                    orderBy: { mp: { categorie: "asc" } },
                  },
                },
              },

              formules: {
                include: {
                  items: {
                    include: {
                      formule: {
                        include: {
                          items: { include: { mp: true } },
                        },
                      },
                    },
                    orderBy: { volumeM3: "desc" },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
