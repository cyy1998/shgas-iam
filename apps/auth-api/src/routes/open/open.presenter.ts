export function maskMobile(mobile: string | null): string | null {
  if (mobile === null) {
    return null;
  }
  if (mobile.length <= 7) {
    return mobile.replace(/.(?=.{2})/g, "*");
  }
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}
