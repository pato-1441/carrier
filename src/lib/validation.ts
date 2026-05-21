const MC_NUMBER_REGEX = /^MC\d{1,8}$/;
const LOAD_REFERENCE_REGEX = /^[A-Z]{3}\d{5}$/;

export function normalizeMcNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidMcNumberFormat(value: string): boolean {
  return MC_NUMBER_REGEX.test(normalizeMcNumber(value));
}

export function toDocketNumber(value: string): string {
  return normalizeMcNumber(value).replace(/^MC/, "");
}

export function normalizeLoadReference(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidLoadReference(value: string): boolean {
  return LOAD_REFERENCE_REGEX.test(normalizeLoadReference(value));
}
