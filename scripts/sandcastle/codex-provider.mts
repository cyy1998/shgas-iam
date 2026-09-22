import type { AgentProvider } from "@ai-hero/sandcastle";
import type { AgentRole, AgentRoles } from "./agents.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { codex } from "@ai-hero/sandcastle";
import { stringify } from "smol-toml";
import { reviewerNames } from "./agents.ts";

export const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;
const sandboxRolesPath = "/opt/iam-afk/agents";

export async function prepareAgentConfig(roles: AgentRoles) {
  const directory = await mkdtemp(join(tmpdir(), "iam-sandcastle-roles-"));
  try {
    for (const name of reviewerNames) {
      const role = roles[name];
      await writeFile(join(directory, `${name}.toml`), stringify({
        name,
        description: role.description,
        model: role.model,
        model_reasoning_effort: role.effort,
        developer_instructions: role.instructions,
        sandbox_mode: "read-only",
      }));
    }
  }
  catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    mounts: [{ hostPath: directory, sandboxPath: sandboxRolesPath, readonly: true }],
    close: () => rm(directory, { recursive: true, force: true }),
  };
}

export function codexConfigArgs(roles: AgentRoles, implementer?: AgentRole): string[] {
  const settings: Record<string, unknown> = {
    "features.multi_agent": true,
    "features.multi_agent_v2": false,
    "agents.enabled": true,
    "agents.max_depth": 1,
    "agents.max_concurrent_threads_per_session": 6,
  };
  for (const name of reviewerNames) {
    settings[`agents.${name}.description`] = roles[name].description;
    settings[`agents.${name}.config_file`] = `${sandboxRolesPath}/${name}.toml`;
  }
  if (implementer)
    settings.developer_instructions = implementer.instructions;
  return Object.entries(settings).flatMap(([key, value]) => ["-c", `${key}=${JSON.stringify(value)}`]);
}

export function configuredCodex(model: string, roles: AgentRoles, implementer?: AgentRole): AgentProvider {
  const provider = codex(implementer?.model ?? model, {
    effort: implementer?.effort ?? "high",
    sessionStorage: { hostSessionsDir: join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions") },
  });
  return {
    ...provider,
    buildPrintCommand(options) {
      const result = provider.buildPrintCommand(options);
      return { ...result, command: `${result.command} ${codexConfigArgs(roles, implementer).map(shellQuote).join(" ")}` };
    },
  };
}

/** Reads the CLI's effective configuration without invoking a model or loading account credentials. */
export function codexConfigProbe(roles: AgentRoles): string {
  const args = [...codexConfigArgs(roles, roles.implementer_standard), "app-server"];
  return `
    const { spawn } = require("node:child_process");
    const { createInterface } = require("node:readline");
    const child = spawn("codex", ${JSON.stringify(args)}, { stdio: ["pipe", "pipe", "pipe"] });
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      if (error) { console.error(String(error)); process.exitCode = 1; }
      else console.log("Codex role configuration parsed.");
    };
    const timer = setTimeout(() => finish(new Error("Codex config probe timed out")), 20000);
    child.on("error", finish);
    child.on("close", () => { if (!done) finish(new Error("Codex config probe exited early")); });
    child.stderr.resume();
    const send = (message) => child.stdin.write(JSON.stringify(message) + "\\n");
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const response = JSON.parse(line);
        if (response.error) throw new Error(JSON.stringify(response.error));
        if (response.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "config/read", params: { includeLayers: false, cwd: process.cwd() } });
        }
        if (response.id === 2) {
          const config = response.result.config;
          if (config.features.multi_agent !== true || config.features.multi_agent_v2 !== false
            || config.agents.enabled !== true || config.agents.max_depth !== 1) {
            throw new Error("Codex subagent configuration did not take effect");
          }
          for (const name of ${JSON.stringify(reviewerNames)}) {
            if (config.agents[name]?.config_file !== ${JSON.stringify(sandboxRolesPath)} + "/" + name + ".toml")
              throw new Error("Codex did not load the role path: " + name);
          }
          finish();
        }
      } catch (error) { finish(error); }
    });
    send({ id: 1, method: "initialize", params: {
      clientInfo: { name: "iam-afk-smoke", version: "1" }, capabilities: { experimentalApi: true }
    } });
  `;
}
