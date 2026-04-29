import type { History } from 'history';

// Augment @umijs/max to expose the runtime `history` object.
// The actual export comes from the auto-generated .umi/exports.ts, but tsc
// resolves the package alias to the umi node_modules entry which lacks this
// binding. This shim bridges the gap for static type-checking.
declare module '@umijs/max' {
  export const history: History;
  export function createHistory(opts: { type?: 'browser' | 'hash' | 'memory'; basename?: string }): History;
}
