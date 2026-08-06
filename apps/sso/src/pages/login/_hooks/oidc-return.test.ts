import { describe, expect, it } from 'vitest';
import { isValidOidcReturnHandle } from './oidc-return';

describe('OIDC login return handle', () => {
  it('accepts an opaque Session Kernel handle without interpreting its prefix', () => {
    expect(isValidOidcReturnHandle(
      `iam_or_${'a'.repeat(43)}`,
    )).toBe(true);
  });

  it.each([
    'short',
    `bad.${'a'.repeat(43)}`,
    'a'.repeat(129),
  ])('rejects a malformed return handle', (value) => {
    expect(isValidOidcReturnHandle(value)).toBe(false);
  });
});
