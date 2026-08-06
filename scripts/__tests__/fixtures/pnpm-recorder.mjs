import { appendFileSync } from "node:fs";

const command = process.argv.slice(2).join(" ");
const commandLog = process.env.IAM_VERIFICATION_GATE_COMMAND_LOG
  ?? process.env.IAM_TEST_INTEGRATION_COMMAND_LOG
  ?? process.env.IAM_VERIFY_COMMAND_LOG;
const failCommand = process.env.IAM_VERIFICATION_GATE_FAIL_COMMAND
  ?? process.env.IAM_TEST_INTEGRATION_FAIL_COMMAND
  ?? process.env.IAM_VERIFY_FAIL_COMMAND;
const diagnosticCommand = process.env.IAM_VERIFICATION_GATE_DIAGNOSTIC_COMMAND;
const signalCommand = process.env.IAM_VERIFICATION_GATE_SIGNAL_COMMAND;

appendFileSync(commandLog, `${command}\n`);

if (command === diagnosticCommand) {
  const diagnostic = process.env.IAM_VERIFICATION_GATE_DIAGNOSTIC;
  if (process.env.IAM_VERIFICATION_GATE_DIAGNOSTIC_STREAM === "stdout")
    console.log(diagnostic);
  else
    console.error(diagnostic);
}

if (command === signalCommand)
  process.kill(process.pid, process.env.IAM_VERIFICATION_GATE_SIGNAL ?? "SIGTERM");

if (command === failCommand)
  process.exit(Number(process.env.IAM_VERIFICATION_GATE_FAIL_EXIT_CODE ?? 37));
