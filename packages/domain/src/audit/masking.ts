export function maskMobileForAudit(phoneNumber: string): string;
export function maskMobileForAudit(phoneNumber: string | null | undefined): string | null;
export function maskMobileForAudit(phoneNumber: string | null | undefined) {
  return phoneNumber?.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") ?? null;
}
