import { Command } from "commander";
import { runApply, runDiff, runValidate } from "./commands";

const program = new Command();

program
  .name("apisix-sync")
  .description("Validate, diff, and apply APISIX gateway manifests")
  .showHelpAfterError()
  .exitOverride();

addCommonOptions(program.command("validate"))
  .description("Validate APISIX manifests")
  .action(async options => runValidate(options));

addRemoteOptions(addCommonOptions(program.command("diff")))
  .description("Diff APISIX manifests against the Admin API")
  .action(async options => runDiff(options));

addRemoteOptions(addCommonOptions(program.command("apply")))
  .description("Apply APISIX manifests through the Admin API")
  .option("--dry-run", "Plan apply without writes")
  .option("--prune", "Delete repo-managed remote objects removed from manifest")
  .action(async options => runApply(options));

function addCommonOptions(command: Command): Command {
  return command
    .option("--env <env:app>", "Manifest scope")
    .option("--manifest <path>", "Override manifest file")
    .option("--env-file <path>", "Load env vars from a file and render ${VAR} placeholders")
    .option("--render-env", "Render ${VAR} placeholders from current environment")
    .option("--json", "Print machine-readable output");
}

function addRemoteOptions(command: Command): Command {
  return command
    .option("--admin-url <url>", "APISIX Admin API base URL")
    .option("--admin-key <key>", "APISIX Admin API key, or use APISIX_ADMIN_KEY");
}

if (import.meta.main) {
  program.parseAsync(normalizePnpmPassthrough(process.argv)).catch((error) => {
    if (error.code === "commander.helpDisplayed") {
      return;
    }

    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

function normalizePnpmPassthrough(argv: string[]): string[] {
  return argv.filter((arg, index) => index < 2 || arg !== "--");
}
