type Destroy<T> = (value: T) => void | Promise<void>;

const globalSingletons = globalThis as typeof globalThis & {
  __iamSingletons?: Map<string, unknown>;
  __iamSingletonDestroyers?: Map<string, Destroy<unknown>>;
};

function getStore() {
  globalSingletons.__iamSingletons ??= new Map<string, unknown>();
  globalSingletons.__iamSingletonDestroyers ??= new Map<string, Destroy<unknown>>();
  return {
    values: globalSingletons.__iamSingletons,
    destroyers: globalSingletons.__iamSingletonDestroyers,
  };
}

export function createSingleton<T>(
  key: string,
  factory: () => T,
  options: { destroy?: Destroy<T> } = {},
): T {
  const store = getStore();
  if (!store.values.has(key)) {
    const value = factory();
    store.values.set(key, value);
    if (options.destroy) {
      store.destroyers.set(key, options.destroy as Destroy<unknown>);
    }
  }
  return store.values.get(key) as T;
}
