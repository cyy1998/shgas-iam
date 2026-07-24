import { appendFileSync } from "node:fs";

const command = process.argv.slice(2).join(" ");
appendFileSync(process.env.IAM_VERIFY_COMMAND_LOG, `${command}\n`);

if (command === process.env.IAM_VERIFY_FAIL_COMMAND)
  process.exit(37);
