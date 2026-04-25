export const CATEGORY_OPTIONS = ['Clothing', 'Furniture', 'Electronics', 'Food', 'Stationery', 'Other'] as const;

export type CategoryOption = (typeof CATEGORY_OPTIONS)[number];

export const isCategoryOption = (value?: string | null): value is CategoryOption =>
  CATEGORY_OPTIONS.includes(value as CategoryOption);

export const getDisplayCategory = (item: { category?: string | null; customCategory?: string | null }) =>
  item.customCategory?.trim() || item.category?.trim() || 'Other';

