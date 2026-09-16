/** Mirrors the Prisma PropertyType enum. Values go to the API; labels are for people. */
export const PROPERTY_TYPE_OPTIONS = [
  { value: 'SINGLE_FAMILY', label: 'Single-family home' },
  { value: 'MULTI_FAMILY', label: 'Multi-family building' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'OTHER', label: 'Other' },
];

export const propertyTypeLabel = (value) =>
  PROPERTY_TYPE_OPTIONS.find((o) => o.value === value)?.label || null;
