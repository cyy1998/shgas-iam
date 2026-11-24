import { expect, test } from "bun:test";
import { mkdtemp, open, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand } from "../../src/command-runner.ts";
import type { FailureReport } from "../../src/failure-report/report-format.ts";

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
const gatewayTest = fileURLToPath(new URL("../../src/gateway-test.ts", import.meta.url));
const reporterConfig = fileURLToPath(new URL("../../src/failure-report/reporter-config.ts", import.meta.url));

test("a real failed Playwright run publishes every failure and preserves history across runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "iam-e2e-failure-report-"));
  const reports = join(root, "reports");
  const output = join(root, "playwright-output");
  const serviceLog = join(root, "api.log");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/chunked") {
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("Chunked upstream failure"));
            controller.close();
          },
        });
        return new Response(body, { status: 502, headers: { "content-type": "text/plain" } });
      }
      if (pathname === "/compressed") {
        return new Response(Bun.gzipSync("Compressed upstream failure"), {
          status: 502,
          headers: { "content-type": "text/plain", "content-encoding": "gzip" },
        });
      }
      if (pathname.startsWith("/trpc/")) {
        return Response.json(
          {
            error: {
              message: "Directory is unavailable",
              data: { code: "SERVICE_UNAVAILABLE", accessToken: "body-secret" },
            },
          },
          { status: 503, headers: { "x-request-id": "evidence-request", "set-cookie": "session=header-secret" } },
        );
      }
      return new Response("<!doctype html><title>Reporter fixture</title>", {
        headers: { "content-type": "text/html" },
      });
    },
  });
  try {
    await writeFile(`${serviceLog}first-run`, '{"level":50,"time":1,"msg":"before either test"}\n');
    await writeFile(
      join(root, "playwright.config.mts"),
      `
      import { createFailureReporters } from ${JSON.stringify(reporterConfig)};
      export default {
        testDir: ".",
        outputDir: ${JSON.stringify(output)},
        workers: 1,
        timeout: 5000,
        use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
        reporter: createFailureReporters({
          reportDirectory: ${JSON.stringify(reports)},
          runId: process.env.IAM_E2E_TEST_REPORT_ID,
          logFiles: { api: [
            ${JSON.stringify(serviceLog)} + process.env.IAM_E2E_TEST_REPORT_ID,
            ${JSON.stringify(serviceLog)} + process.env.IAM_E2E_TEST_REPORT_ID + "-stderr",
          ] },
        }, false),
      };`,
    );
    await writeFile(
      join(root, "failure.spec.mts"),
      `
      import { appendFileSync } from "node:fs";
      import { test } from ${JSON.stringify(gatewayTest)};
      const origin = ${JSON.stringify(server.url.origin)};
      function log(msg, fields = {}, stream = "") {
        appendFileSync(${JSON.stringify(serviceLog)} + process.env.IAM_E2E_TEST_REPORT_ID + stream, JSON.stringify({ time: Date.now(), level: 50, msg, ...fields }) + "\\n");
      }
      test("assertion failure", async ({ page }) => {
        await page.goto(origin);
        await page.evaluate(async () => {
          console.error("browser console marker, password=console-secret");
          for (const path of ["/trpc/read?input=query-secret", "/chunked", "/compressed"]) {
            await (await fetch(path)).text();
          }
        });
        log("database rejected operation");
        log("database rejected operation", {}, "-stderr");
        log("upstream denied clientSecret=log-secret", {}, "-stderr");
        log("health probe failed", { path: "/healthz" });
        log("after either test", { time: Date.now() + 60_000 });
        await test.step("compare state", () => test.expect("actual").toBe("expected"));
      });
      test("timeout failure", async ({ browser }) => {
        test.setTimeout(3000);
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(origin);
        const pageError = page.waitForEvent("pageerror");
        await page.evaluate(() => { setTimeout(() => { throw new Error("uncaught page marker"); }, 0); });
        await pageError;
        log("timeout service marker");
        await page.locator("#never-present").click();
      });
    `,
    );

    const first = await runPlaywright(root, "first-run");
    expect(first.exitCode).toBe(1);
    const firstJsonPath = join(reports, "first-run", "failure-summary.json");
    const firstContent = await readFile(firstJsonPath, "utf8");
    const firstMarkdown = await readFile(join(reports, "first-run", "failure-summary.md"), "utf8");
    const firstReport: FailureReport = JSON.parse(firstContent);
    expect(firstReport.errors).toEqual([]);
    expect(firstReport.failures).toMatchObject([
      {
        title: "assertion failure",
        status: "failed",
        steps: expect.arrayContaining([{ title: "compare state", error: expect.stringContaining("expected") }]),
        artifacts: expect.arrayContaining([{ name: "trace", path: expect.stringContaining("trace.zip") }]),
        browserErrors: expect.arrayContaining([
          { type: "console.error", message: expect.stringContaining("browser console marker") },
        ]),
        responses: [
          {
            url: `${server.url.origin}/trpc/read`,
            method: "GET",
            status: 503,
            summary: expect.stringContaining("Directory is unavailable"),
            headers: { "x-request-id": "evidence-request" },
          },
          { url: `${server.url.origin}/chunked`, status: 502, summary: "Chunked upstream failure" },
          { url: `${server.url.origin}/compressed`, status: 502, summary: "Compressed upstream failure" },
        ],
        logs: {
          api: {
            entries: [
              { text: "database rejected operation", count: 2 },
              { text: "upstream denied clientSecret=[REDACTED]", count: 1 },
            ],
          },
        },
      },
      {
        title: "timeout failure",
        status: "timedOut",
        browserErrors: [{ type: "pageerror", message: "uncaught page marker" }],
        logs: { api: { entries: [{ text: "timeout service marker", count: 1 }] } },
      },
    ]);
    for (const content of [firstContent, firstMarkdown]) {
      for (const marker of [
        "console-secret",
        "body-secret",
        "query-secret",
        "header-secret",
        "log-secret",
        "health probe failed",
        "before either test",
        "after either test",
      ]) {
        expect(content).not.toContain(marker);
      }
    }
    for (const failure of firstReport.failures) expect(failure.window.end).toBeGreaterThan(failure.window.start);
    expect(first.stdout.trimEnd().split("\n").at(-1)).toContain(firstJsonPath);
    expect(await readFile(join(reports, "last-failure.json"), "utf8")).toBe(firstContent);
    expect(await readFile(join(reports, "last-failure.md"), "utf8")).toBe(firstMarkdown);

    const sentinel = join(output, "old-playwright-artifact");
    await writeFile(sentinel, "Playwright removes this");
    if (process.platform === "win32") {
      // NTFS rejects replacing a destination file while another handle keeps it open.
      const second = await runPlaywright(root, "second-run", "--grep", "assertion failure");
      expect(second.exitCode).toBe(1);
    } else {
      // Existing readers keep a complete old snapshot while new readers see the replacement.
      const previousJson = await open(join(reports, "last-failure.json"));
      try {
        const previousMarkdown = await open(join(reports, "last-failure.md"));
        try {
          const second = await runPlaywright(root, "second-run", "--grep", "assertion failure");
          expect(second.exitCode).toBe(1);
          const oldJson = await previousJson.readFile("utf8");
          const oldMarkdown = await previousMarkdown.readFile("utf8");
          expect(oldJson).toBe(firstContent);
          expect(oldMarkdown).toBe(firstMarkdown);
        } finally {
          await previousMarkdown.close();
        }
      } finally {
        await previousJson.close();
      }
    }
    expect(await Bun.file(sentinel).exists()).toBe(false);
    expect(await readFile(firstJsonPath, "utf8")).toBe(firstContent);
    const secondContent = await readFile(join(reports, "second-run", "failure-summary.json"), "utf8");
    const secondMarkdown = await readFile(join(reports, "second-run", "failure-summary.md"), "utf8");
    expect(JSON.parse(secondContent)).toMatchObject({
      runId: "second-run",
      failures: [{ title: "assertion failure" }],
    });
    expect(await readFile(join(reports, "last-failure.json"), "utf8")).toBe(secondContent);
    expect(await readFile(join(reports, "last-failure.md"), "utf8")).toBe(secondMarkdown);

    // Fresh runs may share the report directory while keeping Playwright artifacts separate.
    const concurrent = await Promise.allSettled(
      ["fresh-one", "fresh-two"].map((id) =>
        runPlaywright(root, id, "--grep", "assertion failure", "--output", join(root, id)),
      ),
    );
    expect(concurrent.map((outcome) => outcome.status === "fulfilled" && outcome.value.exitCode)).toEqual([1, 1]);
    for (const id of ["fresh-one", "fresh-two"]) {
      const history = await readFile(join(reports, id, "failure-summary.json"), "utf8");
      expect(JSON.parse(history)).toMatchObject({ runId: id, failures: [{ title: "assertion failure" }] });
    }
    const latest = await readFile(join(reports, "last-failure.json"), "utf8");
    const { runId }: FailureReport = JSON.parse(latest);
    expect(["fresh-one", "fresh-two"]).toContain(runId);
    expect(latest).toBe(await readFile(join(reports, runId, "failure-summary.json"), "utf8"));
    expect(await readFile(join(reports, "last-failure.md"), "utf8")).toBe(
      await readFile(join(reports, runId, "failure-summary.md"), "utf8"),
    );
  } finally {
    await server.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 45_000);

async function runPlaywright(cwd: string, runId: string, ...args: string[]) {
  try {
    await captureCommand("node", [playwrightCli, "test", ...args], {
      cwd,
      env: { ...process.env, IAM_E2E_TEST_REPORT_ID: runId, FORCE_COLOR: "0" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (error instanceof Error && "stdout" in error && "stderr" in error) {
      const exitCode = Number(/exited with code (\d+)/u.exec(error.message)?.[1]);
      return { exitCode, stdout: String(error.stdout), stderr: String(error.stderr) };
    }
    throw error;
  }
  throw new Error("Playwright unexpectedly passed");
}
