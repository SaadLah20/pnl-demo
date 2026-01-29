import { prisma } from './db'

const variantInclude = {
  mp: true,
  transport: true,
  cab: true,
  maintenance: true,
  coutM3: true,
  coutMensuel: true,
  coutOccasionnel: true,
  employes: true,
  autresCouts: true,
  formules: true,
  majorations: true,
  devis: true,
} as const;

export async function getPnls() {
  return prisma.pnl.findMany({
    include: {
      contracts: {
        include: {
          variants: {
            include: variantInclude,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
