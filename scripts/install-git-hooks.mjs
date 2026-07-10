import { existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();

if (["1", "true"].includes(process.env.SKIP_INSTALL_SIMPLE_GIT_HOOKS ?? "")) {
  console.log("Git hook installation skipped: SKIP_INSTALL_SIMPLE_GIT_HOOKS is enabled.");
}
else if (!existsSync(join(repoRoot, ".git"))) {
  console.log("Git hook installation skipped: no .git metadata found.");
}
else {
  const simpleGitHooks = (await import("simple-git-hooks")).default;
  await simpleGitHooks.setHooksFromConfig(repoRoot);
  console.log("Git hook installation complete.");
}
