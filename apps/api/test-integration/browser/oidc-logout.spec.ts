import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import process from "node:process";
import { expect, test } from "@playwright/test";
import { z } from "zod";

async function start(failToken = false) {
  if (!process.env.IAM_API_TEST_REDIS_URL)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  // Resolve the real executable through the installed CLI shim, then own the direct child.
  const executable = execSync("bun -e \"console.log(process.execPath)\"", {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4096,
  }).trim();
  const child = spawn(
    executable,
    ["test-integration/browser/oidc-server.fixture.ts", ...(failToken ? ["--fail-token"] : [])],
    { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: "pipe" },
  );
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4096);
  });
  async function close() {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000);
    try {
      const code = await exit;
      if (code !== 0)
        throw new Error(`Browser fixture failed (${code}): ${stderr}`);
    }
    finally {
      clearTimeout(timer);
    }
  }
  try {
    const line = await readReady(child, exit);
    const seed = z
      .object({
        origin: z.url(),
        logoutUri: z.url(),
        token: z.string(),
        clientId: z.string(),
        id_token: z.string(),
        access_token: z.string(),
      })
      .parse(JSON.parse(line));
    return { ...seed, close };
  }
  catch (failure) {
    try {
      await close();
    }
    catch (cleanup) {
      throw new AggregateError([failure, cleanup], "Browser fixture startup and cleanup failed", {
        cause: failure,
      });
    }
    throw failure;
  }
}
async function readReady(child: ChildProcessWithoutNullStreams, exit: Promise<number | null>) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      new Promise<string>((resolve, reject) => {
        let stdout = "";
        child.stdout.on("data", (chunk) => {
          stdout = (stdout + String(chunk)).slice(0, 32769);
          if (stdout.length > 32768)
            reject(new Error("Browser fixture readiness exceeded limit"));
          const newline = stdout.indexOf("\n");
          if (newline >= 0)
            resolve(stdout.slice(0, newline));
        });
        timer = setTimeout(() => reject(new Error("Browser fixture readiness timed out")), 10000);
      }),
      exit.then(() => {
        throw new Error("Browser fixture exited before readiness");
      }),
    ]);
  }
  finally {
    clearTimeout(timer!);
  }
}

test("real candidate browser cancels without logout, then confirms with bound state and root termination", async ({
  page,
  context,
}) => {
  const f = await start();
  try {
    await context.addCookies([
      { name: "global_session", value: f.token, url: f.origin, httpOnly: true, sameSite: "Lax" },
    ]);
    const parameters = new URLSearchParams({
      client_id: f.clientId,
      id_token_hint: f.id_token,
      post_logout_redirect_uri: f.logoutUri,
      state: "browser-state",
    });
    await page.goto(`${f.origin}/oidc/session/end?${parameters}`);
    await page.getByRole("button", { name: "No, stay signed in" }).click();
    await expect(page).toHaveURL(`${f.logoutUri}?state=browser-state`);
    expect((await context.cookies(f.origin)).find(value => value.name === "global_session")?.value).toBe(
      f.token,
    );
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${f.origin}/oidc/session/end?${parameters}`);
    await page.getByRole("button", { name: "Yes, sign me out" }).click();
    await expect(page).toHaveURL(`${f.logoutUri}?state=browser-state`);
    expect((await context.cookies(f.origin)).some(value => value.name === "global_session")).toBe(false);
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(401);
  }
  finally {
    await f.close();
  }
});

test("browser rejects tampered CSRF and unsafe redirects locally while preserving the session", async ({
  page,
  context,
}) => {
  const f = await start();
  try {
    await context.addCookies([
      { name: "global_session", value: f.token, url: f.origin, httpOnly: true, sameSite: "Lax" },
    ]);
    await page.goto(`${f.origin}/oidc/session/end`);
    await page.locator("input[name=\"xsrf\"]").evaluate((element) => {
      if (element instanceof HTMLInputElement)
        element.value = "invalid";
    });
    await page.getByRole("button", { name: "Yes, sign me out" }).click();
    await expect(page.locator("body")).toContainText("invalid_request");
    expect(page.url()).toBe(`${f.origin}/oidc/session/end/confirm`);
    const bad = new URLSearchParams({
      id_token_hint: f.id_token,
      post_logout_redirect_uri: "https://evil.example",
    });
    await page.goto(`${f.origin}/oidc/session/end?${bad}`);
    await expect(page.locator("body")).toContainText("invalid_request");
    expect((await context.cookies(f.origin)).find(value => value.name === "global_session")?.value).toBe(
      f.token,
    );
    expect(
      (
        await context.request.get(`${f.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${f.access_token}` },
        })
      ).status(),
    ).toBe(200);
  }
  finally {
    await f.close();
  }
});

test("browser fixture startup failure closes both real HTTP servers before returning", async ({
  request,
}) => {
  const failure = await start(true).catch(error => error);
  expect(failure).toBeInstanceOf(AggregateError);
  const cleanupReport = String(failure.errors[1]);
  expect(cleanupReport).toContain("Browser fixture Token request failed");
  const receipt = z
    .object({ origin: z.url(), rp: z.url() })
    .parse(JSON.parse(/fixture-created:(\{[^\n]+\})/u.exec(cleanupReport)![1]!));
  for (const endpoint of [receipt.origin, receipt.rp]) {
    const connection = await request.get(endpoint).catch(error => error);
    expect(connection).toBeInstanceOf(Error);
  }
});
