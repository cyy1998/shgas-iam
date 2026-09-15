import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createLoginCredential } from "@iam/contracts";
import { chromium } from "@playwright/test";

async function main() {
  // Explicit one-shot evidence tool; the caller owns the pinned suite process and its MongoDB.
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const options = JSON.parse(await readFile(process.argv[2]!, "utf8"));
  const suite = String(options.suiteOrigin);
  const output = String(options.outputDirectory);
  await mkdir(output, { recursive: true });
  const publicModules = new Set([
    "oidcc-server",
    "oidcc-idtoken-signature",
    "oidcc-userinfo-get",
    "oidcc-userinfo-post-header",
    "oidcc-userinfo-post-body",
    "oidcc-ensure-request-without-nonce-succeeds-for-code-flow",
    "oidcc-ensure-request-with-valid-pkce-succeeds",
    "oidcc-codereuse",
    "oidcc-prompt-none-not-logged-in",
  ]);
  const exclusions: Record<string, string> = {
    "oidcc-server-client-secret-post":
      "ADR-0035: client_secret_post success is outside the accepted authentication methods",
    "oidcc-prompt-login": "ADR-0013/0035: repeated authentication is deliberately rejected",
    "oidcc-max-age-1": "ADR-0013/0035: fresh repeated authentication is deliberately rejected",
    "oidcc-idtoken-unsigned":
      "Static registration and RS256 only; this module requires dynamic registration with alg none",
  };
  const candidate = {
    ...options.candidateRuntime,
    credential: () =>
      createLoginCredential({ ...options.loginCredential, now: Date.now(), nonce: randomUUID() }),
  };
  const rows: object[] = [];
  const browser = await chromium.launch({ headless: true });
  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(`${suite}/api${path}`, {
      signal: AbortSignal.timeout(10000),
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok)
      throw new Error(`Suite API ${path}: ${response.status} ${await response.text()}`);
    const body = await response.text();
    return body ? JSON.parse(body) : undefined;
  }
  const variant = {
    response_type: "code",
    client_auth_type: "client_secret_basic",
    response_mode: "default",
    client_registration: "static_client",
    server_metadata: "discovery",
  };
  const config = {
    alias: "iam195",
    description: "IAM #195 pinned suite, synthetic local production API; no certification claim",
    publish: "private",
    iam_s256_required: true,
    server: { discoveryUrl: `${candidate.origin}/oidc/.well-known/openid-configuration` },
    client: { client_id: candidate.clientId, client_secret: candidate.secret },
    client2: { client_id: candidate.secondClientId, client_secret: candidate.secret },
  };
  try {
    await writeFile(
      join(output, "environment.json"),
      JSON.stringify(
        {
          candidate: options.candidate,
          suiteCommit: "ab35a8df4864da35b49eff11483e204e01aa7961",
          suiteVersion: "5.2.4",
          origin: candidate.origin,
          suite,
          variant,
          config,
        },
        null,
        2,
      ),
    );
    for (const planName of [
      "oidcc-basic-certification-test-plan",
      "oidcc-config-certification-test-plan",
      "oidcc-rp-initiated-logout-certification-test-plan",
      "oidcc-test-plan",
    ]) {
      if (options.plans && !options.plans.includes(planName))
        continue;
      const isPublic = planName === "oidcc-test-plan";
      const selectedVariant = isPublic
        ? {
            response_type: "code",
            client_auth_type: "none",
            response_mode: "default",
            client_registration: "static_client",
          }
        : planName === "oidcc-basic-certification-test-plan"
          ? { client_registration: "static_client", server_metadata: "discovery" }
          : planName === "oidcc-config-certification-test-plan"
            ? {}
            : { client_registration: "static_client", response_type: "code" };
      const selectedConfig = {
        ...config,
        ...(isPublic
          ? {
              client: { client_id: candidate.publicClientId },
              client2: { client_id: candidate.publicClientId },
            }
          : {}),
      };
      const plan = await api(
        `/plan?${new URLSearchParams({ planName, variant: JSON.stringify(selectedVariant) })}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selectedConfig),
        },
      );
      await writeFile(join(output, `${planName}.json`), JSON.stringify(plan, null, 2));
      for (const module of plan.modules) {
        if (interrupted)
          throw new Error("Suite driver interrupted");
        const name: string = module.testModule;
        if (isPublic && !publicModules.has(name))
          continue;
        const row = {
          planName,
          planId: plan.id,
          module: name,
          variant: { ...selectedVariant, ...module.variant },
          status: "not_run",
          reason: "",
          suiteResult: "",
          suiteStatus: "",
          id: "",
        };
        rows.push(row);
        if (exclusions[name]) {
          row.status = "not_applicable";
          row.reason = exclusions[name]!;
          continue;
        }
        if (options.modules && !options.modules.includes(name)) {
          row.reason = "Not selected for this focused run";
          continue;
        }
        const context = await browser.newContext({ ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const screenshotPlaceholders = new Set<string>();
        async function collectScreenshots() {
          const images = await api(`/log/${row.id}/images`);
          for (const placeholder of images) {
            if (!placeholder.upload || placeholder.img || screenshotPlaceholders.has(placeholder._id))
              continue;
            const current = new URL(page.url());
            if (current.origin !== candidate.origin || current.pathname === "/login")
              continue;
            const source = String(placeholder.src);
            if (source.includes("ExpectSuccessfulLogoutPage")) {
              const confirm = page.getByRole("button", { name: "Yes, sign me out" });
              if (await confirm.count())
                await confirm.click();
              await page.waitForURL(`${candidate.origin}/oidc/session/end/success`);
            }
            else if (!source.includes("ErrorPage")) {
              throw new Error(
                `Unmapped screenshot requirement: ${source}; preserve for manual investigation`,
              );
            }
            const imageIndex = screenshotPlaceholders.size + 1;
            const screenshot = await page.screenshot({ path: join(output, `${row.id}-${imageIndex}.png`) });
            await writeFile(join(output, `${row.id}-${imageIndex}.html`), await page.content());
            await writeFile(
              join(output, `${row.id}-${imageIndex}-requirement.json`),
              JSON.stringify({ placeholder, capturedUrl: page.url(), module: name }, null, 2),
            );
            const uploaded = await api(`/log/${row.id}/images/${placeholder.upload}`, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: `data:image/png;base64,${screenshot.toString("base64")}`,
            });
            if (!uploaded?.img || uploaded._id !== placeholder._id)
              throw new Error("Suite did not attach the screenshot to the requested placeholder");
            screenshotPlaceholders.add(placeholder._id);
          }
        }
        try {
          const created = await api(
            `/runner?${new URLSearchParams({ test: name, plan: plan.id, variant: JSON.stringify(module.variant) })}`,
            { method: "POST" },
          );
          row.id = created.id;
          const deadline = Date.now() + 90000;
          let started = false;
          while (true) {
            if (interrupted)
              throw new Error("Suite driver interrupted");
            await collectScreenshots();
            let info = await api(`/info/${row.id}`);
            row.suiteResult = info.result;
            row.suiteStatus = info.status;
            if (["FINISHED", "INTERRUPTED"].includes(info.status)) {
              await collectScreenshots();
              const remaining = (await api(`/log/${row.id}/images`)).filter(
                (image: { upload?: unknown; img?: unknown }) => image.upload && !image.img,
              );
              info = await api(`/info/${row.id}`);
              row.suiteResult = info.result;
              row.suiteStatus = info.status;
              row.status
                = info.result === "PASSED" || info.result === "WARNING"
                  ? "pass"
                  : info.result === "SKIPPED"
                    ? "not_applicable"
                    : "fail";
              row.reason
                = info.result === "REVIEW"
                  ? "Official screenshot review pending; inspect saved actual screenshots separately"
                  : "";
              if (remaining.length) {
                row.status = "fail";
                row.reason = `${remaining.length} required screenshots were not captured at the required stage`;
              }
              break;
            }
            if (info.status === "CONFIGURED" && !started) {
              await api(`/runner/${row.id}`, { method: "POST" });
              started = true;
            }
            const running = await api(`/runner/${row.id}`);
            // This is a consumable queue. Visit one entry and acknowledge it before taking a fresh snapshot.
            for (const target of (running.browser?.urlsWithMethod ?? []).slice(0, 1)) {
              const url: string = target.url;
              if (target.method && target.method !== "GET") {
                const parsed = new URL(url);
                await page.goto(candidate.origin);
                await Promise.all([
                  page.waitForNavigation({ waitUntil: "domcontentloaded" }),
                  page.evaluate(
                    ({ action, fields }) => {
                      const form = document.createElement("form");
                      form.method = "POST";
                      form.action = action;
                      for (const [name, value] of fields) {
                        const input = document.createElement("input");
                        input.name = name;
                        input.value = value;
                        form.append(input);
                      }
                      document.body.append(form);
                      form.submit();
                    },
                    { action: `${parsed.origin}${parsed.pathname}`, fields: [...parsed.searchParams] },
                  ),
                ]);
              }
              else {
                await page.goto(url, { waitUntil: "domcontentloaded" });
              }
              if (new URL(page.url()).pathname === "/login") {
                const handle = new URL(page.url()).searchParams.get("oidcReturn");
                const guard = await context.request.get(
                  `${candidate.origin}/oidc/login-guard?oidcReturn=${encodeURIComponent(handle!)}`,
                );
                if (guard.status() !== 200)
                  throw new Error(`Login guard failed: ${guard.status()}`);
                const login = await context.request.post(`${candidate.origin}/auth/login/password`, {
                  data: { credential: candidate.credential() },
                });
                if (login.status() !== 200)
                  throw new Error(`Password HTTP login failed: ${login.status()}`);
                await page.goto(`${candidate.origin}/oidc/resume?oidcReturn=${encodeURIComponent(handle!)}`, {
                  waitUntil: "domcontentloaded",
                });
              }
              await collectScreenshots();
              const confirm = page.getByRole("button", { name: "Yes, sign me out" });
              if (await confirm.count())
                await confirm.click();
              await api(`/runner/browser/${row.id}/visit?${new URLSearchParams({ url })}`, {
                method: "POST",
              });
            }
            if (Date.now() >= deadline)
              throw new Error("Module did not finish within driver deadline; original suite state retained");
            await delay(200);
          }
        }
        catch (error) {
          row.status = "fail";
          row.reason = String(error);
        }
        finally {
          try {
            if (row.id) {
              try {
                await writeFile(
                  join(output, `${row.id}.json`),
                  JSON.stringify(await api(`/log/${row.id}`), null, 2),
                );
              }
              finally {
                const finalInfo = await api(`/info/${row.id}`);
                if (!["FINISHED", "INTERRUPTED"].includes(finalInfo.status))
                  await api(`/runner/${row.id}`, { method: "DELETE" });
              }
            }
          }
          finally {
            await context.close();
            await writeFile(join(output, "results.json"), JSON.stringify(rows, null, 2));
            process.stdout.write(`${JSON.stringify(row)}\n`);
          }
        }
      }
    }
  }
  finally {
    try {
      await browser.close();
    }
    finally {
      await writeFile(join(output, "results.json"), JSON.stringify(rows, null, 2));
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
  }
  if (rows.some(row => "status" in row && row.status === "fail"))
    process.exitCode = 1;
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
