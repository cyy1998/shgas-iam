import { spawn } from "node:child_process";
import process from "node:process";

const commandEnvironmentKey = "IAM_PROCESS_SMOKE_COMMAND_BASE64";

function normalizeExitCode(code) {
  return Number.isInteger(code) && code >= 0 ? code : 1;
}

function waitForPendingWrites(stream) {
  if (stream.destroyed || stream.writableEnded)
    return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onError = (error) => {
      stream.off("error", onError);
      reject(error);
    };
    stream.once("error", onError);
    stream.write("", (error) => {
      stream.off("error", onError);
      if (error === null || error === undefined)
        resolve();
      else
        reject(error);
    });
  });
}

function readTargetCommand() {
  const encoded = process.env[commandEnvironmentKey];
  if (encoded === undefined)
    throw new Error(`${commandEnvironmentKey} is required`);
  const command = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  );
  if (
    typeof command !== "object"
    || command === null
    || typeof command.executable !== "string"
    || !Array.isArray(command.args)
    || !command.args.every(argument => typeof argument === "string")
    || typeof command.cwd !== "string"
  ) {
    throw new Error("invalid process-smoke target command");
  }
  return command;
}

function waitForJobAssignment() {
  return new Promise((resolve, reject) => {
    let input = "";
    const listeners = {};
    const cleanup = () => {
      process.stdin.off("data", listeners.data);
      process.stdin.off("end", listeners.end);
      process.stdin.off("error", listeners.error);
      process.stdin.pause();
    };
    listeners.data = (chunk) => {
      input += chunk;
      if (!input.includes("\n"))
        return;
      cleanup();
      resolve();
    };
    listeners.end = () => {
      cleanup();
      reject(new Error("Windows Job owner closed before assigning the launcher"));
    };
    listeners.error = (error) => {
      cleanup();
      reject(error);
    };
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", listeners.data);
    process.stdin.once("end", listeners.end);
    process.stdin.once("error", listeners.error);
    process.stdin.resume();
  });
}

async function main() {
  const command = readTargetCommand();
  await waitForJobAssignment();

  const environment = { ...process.env };
  delete environment[commandEnvironmentKey];
  const target = spawn(command.executable, command.args, {
    cwd: command.cwd,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  target.stdout?.pipe(process.stdout, { end: false });
  target.stderr?.pipe(process.stderr, { end: false });

  let observedExitCode = 1;
  let drainTimer;
  let isFinalizing = false;
  const finishLauncher = async (code) => {
    if (isFinalizing)
      return;
    isFinalizing = true;
    if (drainTimer !== undefined)
      clearTimeout(drainTimer);
    target.stdout?.unpipe(process.stdout);
    target.stderr?.unpipe(process.stderr);
    target.stdout?.destroy();
    target.stderr?.destroy();
    try {
      await Promise.all([
        waitForPendingWrites(process.stdout),
        waitForPendingWrites(process.stderr),
      ]);
      process.exitCode = normalizeExitCode(code);
    }
    catch {
      process.exitCode = 1;
    }
  };
  target.once("error", (error) => {
    process.stderr.write(`process-smoke target spawn failed: ${error.message}\n`);
    drainTimer ??= setTimeout(finishLauncher, 250, 1);
  });
  target.once("exit", (code) => {
    observedExitCode = normalizeExitCode(code);
    drainTimer ??= setTimeout(finishLauncher, 250, observedExitCode);
  });
  target.once("close", code => void finishLauncher(code ?? observedExitCode));
}

main().catch((error) => {
  process.stderr.write(`Windows Job launcher failed: ${error.message}\n`);
  process.exitCode = 1;
});
