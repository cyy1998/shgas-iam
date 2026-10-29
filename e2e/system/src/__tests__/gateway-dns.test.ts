import { expect, test } from "bun:test";
import dns from "node:dns";
import { installGatewayDns } from "../gateway-dns.ts";

test("gateway DNS maps only the three test authorities and restores the worker resolver", async () => {
  const original = dns.promises.lookup;
  const restore = installGatewayDns();
  try {
    for (const hostname of ["internal.iam.localhost", "external.iam.localhost", "unknown.iam.localhost"]) {
      const address = await dns.promises.lookup(hostname);
      expect(address).toEqual({ address: "127.0.0.1", family: 4 });
    }
    const untouched = await dns.promises.lookup("127.0.0.2");
    expect(untouched.address).toBe("127.0.0.2");
  } finally {
    restore();
  }
  expect(dns.promises.lookup).toBe(original);
});
