const URI_COMPONENT_EXTRA_CHARACTER_PATTERN = /[!'()*]/gu;

export function encodeCustomSsoClientCode(clientCode: string) {
  return encodeURIComponent(clientCode).replace(
    URI_COMPONENT_EXTRA_CHARACTER_PATTERN,
    character =>
      `%${character.codePointAt(0)?.toString(16).toUpperCase()}`,
  );
}

export function decodeCustomSsoClientCode(
  encodedClientCode: string,
): string | null {
  try {
    return decodeURIComponent(encodedClientCode);
  }
  catch {
    return null;
  }
}

export function customSsoLocalSessionCookieName(clientCode: string) {
  return `local_${encodeCustomSsoClientCode(clientCode)}_session`;
}
