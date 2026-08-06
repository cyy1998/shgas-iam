export function isValidOidcReturnHandle(value: string) {
  return /^[\w-]{43,128}$/.test(value);
}
