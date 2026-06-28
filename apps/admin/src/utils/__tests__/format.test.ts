import { describe, expect, it } from 'vitest';
import { trim } from '../format';

describe('trim', () => {
  it('removes leading and trailing whitespace', () => {
    expect(trim('  IAM 用户  ')).toBe('IAM 用户');
  });
});
