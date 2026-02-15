// src/constants/variantStatus.ts
export type VariantStatusUi =
  | "ENCOURS"
  | "ANNULEE"
  | "ADJUGE"
  | "ARCHIVED";

export const VARIANT_STATUS_OPTS: Array<{ value: VariantStatusUi; label: string }> = [
  { value: "ENCOURS", label: "Encours" },
  { value: "ANNULEE", label: "Annulée" },
  { value: "ADJUGE", label: "Adjugée" },
  { value: "ARCHIVED", label: "Archivée" },
] as const;
