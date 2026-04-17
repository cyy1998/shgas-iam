/* eslint-disable ts/no-unsafe-function-type */
type BuiltIn
  = | Date
    | RegExp
    | Function
    | Error
    | Map<any, any>
    | ReadonlyMap<any, any>
    | Set<any>
    | ReadonlySet<any>
    | WeakMap<any, any>
    | WeakSet<any>
    | Promise<any>;

export type Prettify<T> = T extends BuiltIn
  ? T
  : T extends object
    ? T extends infer O ? { [K in keyof O]: Prettify<O[K]> } : never
    : T;
