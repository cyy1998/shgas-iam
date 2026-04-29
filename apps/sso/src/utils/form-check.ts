import type { Rule } from 'antd/es/form';

export const PHONE_REGEX = /^1\d{10}$/;

// 至少 8 位、含字母与数字、不含空格
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)(?!.*\s).{8,}$/;

export const phoneRule: Rule = {
  validator: (_rule, value: string) => {
    if (!value) return Promise.reject(new Error('请输入手机号'));
    if (!PHONE_REGEX.test(value))
      return Promise.reject(new Error('请输入正确的手机号'));
    return Promise.resolve();
  },
};

export const passwordRule: Rule = {
  validator: (_rule, value: string) => {
    if (!value) return Promise.reject(new Error('请输入密码'));
    if (value.length < 8)
      return Promise.reject(new Error('密码长度不得小于 8 位'));
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value))
      return Promise.reject(new Error('密码必须同时包含字母和数字'));
    if (/\s/.test(value))
      return Promise.reject(new Error('密码不能包含空格'));
    return Promise.resolve();
  },
};

export function confirmPasswordRule(getOriginal: () => string | undefined): Rule {
  return {
    validator: (_rule, value: string) => {
      if (!value) return Promise.reject(new Error('请再次输入密码'));
      if (value !== getOriginal())
        return Promise.reject(new Error('两次输入的密码不一致'));
      return Promise.resolve();
    },
  };
}
