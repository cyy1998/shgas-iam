export function parsePlaywrightArguments(args: string[]) {
  const boundary = args.indexOf("--");
  const options = args.slice(0, boundary === -1 ? args.length : boundary);
  const runtime = {
    fresh: options.includes("--fresh"),
    devFrontend: options.includes("--dev-frontend"),
    keep: options.includes("--keep"),
  };
  const playwright = options.filter((arg) => arg !== "--fresh" && arg !== "--dev-frontend" && arg !== "--keep");
  if (boundary !== -1) playwright.push(...args.slice(boundary));
  return { runtime, playwright };
}
