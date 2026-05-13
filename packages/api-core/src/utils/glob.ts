export async function globImport<T>(pattern: string) {
  const glob = new Bun.Glob(pattern);
  const files = glob.scan({ absolute: true });
  const modules: Record<string, T> = {};
  for await (const file of files) {
    modules[file] = await import(file);
  }
  return modules;
}
