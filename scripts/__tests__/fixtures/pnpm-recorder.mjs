import { appendFileSync } from "node:fs";

const command = process.argv.slice(2).join(" ");
const commandLog = process.env.IAM_TEST_INTEGRATION_COMMAND_LOG
  ?? process.env.IAM_VERIFY_COMMAND_LOG;
const failCommand = process.env.IAM_TEST_INTEGRATION_FAIL_COMMAND
  ?? process.env.IAM_VERIFY_FAIL_COMMAND;

appendFileSync(commandLog, `${command}\n`);

if (command === failCommand)
  process.exit(37);
