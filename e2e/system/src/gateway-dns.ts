import type { LookupAddress, LookupAllOptions, LookupOneOptions, LookupOptions } from "node:dns";
import dns from "node:dns";

const gatewayHostnames = new Set(["internal.iam.localhost", "external.iam.localhost", "unknown.iam.localhost"]);

/** Keep canonical URL/Host and Playwright's native Cookie jar; only map test-owned DNS names. */
export function installGatewayDns() {
  const original = dns.promises.lookup;
  function lookup(hostname: string, family: number): Promise<LookupAddress>;
  function lookup(hostname: string, options: LookupOneOptions): Promise<LookupAddress>;
  function lookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]>;
  function lookup(hostname: string, options: LookupOptions): Promise<LookupAddress | LookupAddress[]>;
  function lookup(hostname: string): Promise<LookupAddress>;
  function lookup(hostname: string, options?: number | LookupOptions) {
    const target = gatewayHostnames.has(hostname) ? "127.0.0.1" : hostname;
    if (typeof options === "number") return original(target, options);
    return options ? original(target, options) : original(target);
  }
  dns.promises.lookup = lookup;
  return () => {
    if (dns.promises.lookup === lookup) dns.promises.lookup = original;
  };
}
