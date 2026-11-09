type DestroyFn<T> = (instance: T) => void | Promise<void>;

interface SingletonOptions<T> {
  /** Optional destroy function for graceful shutdown / 可选的销毁函数，用于优雅关闭 */
  destroy?: DestroyFn<T>;
}

interface SingletonEntry {
  instance: unknown;
  destroy?: DestroyFn<unknown>;
}

// Use Symbol.for to ensure cross-module uniqueness, avoids maintaining types in global.d.ts
// 使用 Symbol.for 保证跨模块唯一性，避免在 global.d.ts 中维护类型
const SINGLETON_REGISTRY_KEY = Symbol.for("__singleton_registry__");

type GlobalWithRegistry = typeof globalThis & {
  [SINGLETON_REGISTRY_KEY]?: Map<string, SingletonEntry>;
};

/**
 * Get global singleton registry
 * 获取全局单例注册表
 */
function getRegistry(): Map<string, SingletonEntry> {
  const g = globalThis as GlobalWithRegistry;

  if (!g[SINGLETON_REGISTRY_KEY]) {
    g[SINGLETON_REGISTRY_KEY] = new Map();
  }

  return g[SINGLETON_REGISTRY_KEY];
}

/**
 * Create synchronous singleton
 * 创建同步单例
 *
 * @example
 * const redisClient = createSingleton('redis', () => new Redis(config), {
 *   destroy: (client) => client.quit(),
 * });
 */
export function createSingleton<T>(key: string, factory: () => T, options?: SingletonOptions<T>): T {
  const registry = getRegistry();

  if (!registry.has(key)) {
    const instance = factory();
    registry.set(key, {
      instance,
      destroy: options?.destroy as DestroyFn<unknown> | undefined,
    });
  }

  return registry.get(key)!.instance as T;
}

/**
 * Destroy specified singleton
 * 销毁指定单例
 */
export async function destroySingleton(key: string): Promise<void> {
  const registry = getRegistry();
  const entry = registry.get(key);

  if (entry) {
    if (entry.destroy) {
      // If instance is a Promise, wait for resolution before destroying
      // 如果实例是 Promise，等待其解析后再销毁
      const instance = entry.instance instanceof Promise ? await entry.instance : entry.instance;
      await entry.destroy(instance);
    }
    registry.delete(key);
  }
}

/**
 * Get all registered singleton keys (for debugging)
 * 获取所有已注册的单例键（用于调试）
 */
export function getSingletonKeys(): string[] {
  return Array.from(getRegistry().keys());
}
