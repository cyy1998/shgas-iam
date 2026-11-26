import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { stringify } from "smol-toml";
import { loadAgentRoles, parseAgentRole } from "../codex-roles.ts";

const cwd = fileURLToPath(new URL("../../../..", import.meta.url));

test("loads the shared implementer, reviewer and researcher TOML roles", async () => {
  const roles = await loadAgentRoles(cwd);
  expect(Object.keys(roles).sort()).toEqual([
    "code_researcher",
    "implementer_deep",
    "implementer_light",
    "implementer_standard",
    "spec_reviewer",
    "standards_reviewer",
  ]);
  expect(roles.implementer_deep).toMatchObject({
    model: expect.any(String),
    effort: expect.any(String),
    instructions: expect.any(String),
    description: expect.any(String),
  });
});

const role = {
  name: "implementer_standard",
  model: "fixture-model",
  model_reasoning_effort: "high",
  description: "Fixture implementer",
  developer_instructions: "Implement the ticket",
};

test.each([
  { name: "wrong_name" },
  { model: " " },
  { model_reasoning_effort: "unrecognized" },
  { developer_instructions: "" },
])("rejects invalid role metadata %j", (invalid) => {
  expect(() => parseAgentRole(stringify({ ...role, ...invalid }), "implementer_standard")).toThrow(
    /无效的 AFK 角色配置/,
  );
});

test.each(["code_researcher", "spec_reviewer", "standards_reviewer"] as const)(
  "rejects write access for the read-only %s role",
  (name) => {
    const source = stringify({ ...role, name, sandbox_mode: "workspace-write" });
    expect(() => parseAgentRole(source, name)).toThrow(/必须为 read-only/);
  },
);
