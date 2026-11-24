import { expect, test } from "bun:test";
import {
  type FrontendWorkspaceInputs,
  fingerprintFrontendInputs,
  matchesFrontendBuild,
} from "../frontend/frontend-fingerprint.ts";

function fingerprint(
  app: string,
  changes: { admin?: string; leaf?: string; lockfile?: string; clientCode?: string } = {},
) {
  const { admin = "admin source", leaf = "leaf source", lockfile = "lock", clientCode = "iam-admin" } = changes;
  const workspaces = new Map<string, FrontendWorkspaceInputs>([
    ["admin", { manifest: { dependencies: { middle: "workspace:*" } }, files: { "apps/admin/src/main.ts": admin } }],
    ["sso", { manifest: {}, files: { "apps/sso/src/main.ts": "sso source" } }],
    [
      "middle",
      { manifest: { dependencies: { leaf: "workspace:*" } }, files: { "packages/middle/src/index.ts": "middle" } },
    ],
    ["leaf", { manifest: {}, files: { "packages/leaf/src/index.ts": leaf } }],
  ]);
  return fingerprintFrontendInputs(
    app,
    workspaces,
    { "pnpm-lock.yaml": lockfile },
    {
      [app === "admin" ? "IAM_ADMIN_WEB_CLIENT_CODE" : "IAM_SSO_WEB_CLIENT_CODE"]: app === "admin" ? clientCode : "iam",
    },
  );
}

test("only inputs in the selected frontend's workspace closure change its fingerprint", () => {
  const admin = fingerprint("admin");
  const sso = fingerprint("sso");
  for (const change of [
    { admin: "changed app" },
    { leaf: "changed transitive dependency" },
    { clientCode: "alt-admin" },
  ]) {
    expect(fingerprint("admin", change)).not.toBe(admin);
    expect(fingerprint("sso", change)).toBe(sso);
  }
  expect(fingerprint("admin", { lockfile: "changed lock" })).not.toBe(admin);
  expect(fingerprint("sso", { lockfile: "changed lock" })).not.toBe(sso);
  expect(fingerprint("admin")).toBe(admin);
});

test("a matching fingerprint requires a complete and intact build", () => {
  const recorded = { fingerprint: "inputs", files: { "index.html": "page", "assets/main.js": "script" } };
  expect(matchesFrontendBuild(recorded, "inputs", { "assets/main.js": "script", "index.html": "page" })).toBe(true);
  expect(matchesFrontendBuild(recorded, "new-inputs", recorded.files)).toBe(false);
  expect(matchesFrontendBuild(recorded, "inputs", { "index.html": "page" })).toBe(false);
  expect(matchesFrontendBuild(recorded, "inputs", { "index.html": "page", "assets/main.js": "damaged" })).toBe(false);
});
