export type Prettify<T> = T extends object
  ? T extends infer O ? { [K in keyof O]: Prettify<O[K]> } : never
  : T;
