import type { Rule } from 'antd/es/form';
import { describe, expect, it } from 'vitest';
import { confirmPasswordRule, passwordRule, phoneRule } from '../form-check';

type RuleValidator = (
  rule: unknown,
  value: string,
  callback: (error?: string) => void,
) => Promise<void> | void;

function validate(rule: Rule, value: string) {
  const validator = (rule as { validator?: RuleValidator }).validator;
  return Promise.resolve(validator?.({}, value, () => undefined));
}

describe('form-check rules', () => {
  it('validates mainland China mobile phone numbers', async () => {
    await expect(validate(phoneRule, '13800000000')).resolves.toBeUndefined();
    await expect(validate(phoneRule, '')).rejects.toThrow('请输入手机号');
    await expect(validate(phoneRule, '23800000000')).rejects.toThrow(
      '请输入正确的手机号',
    );
  });

  it('requires password length, letters, digits and no spaces', async () => {
    await expect(validate(passwordRule, 'Abc12345')).resolves.toBeUndefined();
    await expect(validate(passwordRule, '')).rejects.toThrow('请输入密码');
    await expect(validate(passwordRule, 'A1b2')).rejects.toThrow(
      '密码长度不得小于 8 位',
    );
    await expect(validate(passwordRule, 'abcdefgh')).rejects.toThrow(
      '密码必须同时包含字母和数字',
    );
    await expect(validate(passwordRule, 'Abc 12345')).rejects.toThrow(
      '密码不能包含空格',
    );
  });

  it('requires confirmation password to match the original password', async () => {
    const rule = confirmPasswordRule(() => 'Abc12345');

    await expect(validate(rule, 'Abc12345')).resolves.toBeUndefined();
    await expect(validate(rule, '')).rejects.toThrow('请再次输入密码');
    await expect(validate(rule, 'Abc123456')).rejects.toThrow(
      '两次输入的密码不一致',
    );
  });
});
