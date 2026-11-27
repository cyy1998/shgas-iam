import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { setTimeout as delay } from "node:timers/promises";

export async function waitForHttpRoute(url: URL, expectedStatus: number, signal: AbortSignal, ca?: string) {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    try {
      const status = await requestStatus(url, AbortSignal.any([signal, AbortSignal.timeout(2_000)]), ca);
      if (status === expectedStatus) return;
      lastError = new Error(`received HTTP ${status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250, undefined, { signal });
  }
  throw new Error(`Gateway route ${url.href} did not return HTTP ${expectedStatus}`, { cause: lastError });
}

function requestStatus(url: URL, signal: AbortSignal, ca?: string) {
  const request = url.protocol === "https:" ? requestHttps : requestHttp;
  return new Promise<number | undefined>((resolve, reject) => {
    // Connect to loopback while keeping the APISIX entry authority and TLS SNI.
    const client = request(
      {
        hostname: "127.0.0.1",
        servername: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Host: url.host },
        ca,
        signal,
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    client.once("error", reject);
    client.end();
  });
}
