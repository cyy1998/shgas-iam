// Augment @umijs/max to expose the runtime `history` object.
// The actual export comes from the auto-generated .umi/exports.ts, but tsc
// resolves the package alias to the umi node_modules entry which lacks this
// binding. This shim bridges the gap for static type-checking.
declare module '@umijs/max' {
  import type { History } from 'history';
  export const history: History;
  export function createHistory(opts: { type?: 'browser' | 'hash' | 'memory'; basename?: string }): History;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function useModel<T extends string>(name: T): any;
}

// Static asset module declarations
declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
