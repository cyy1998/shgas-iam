import { setSystemTime } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const clockFile = process.env.IAM_WORKER_TEST_CLOCK_FILE;
const initialTime = process.env.IAM_WORKER_TEST_INITIAL_TIME;
if (!initialTime) throw new Error("Worker initial test time is required");
setSystemTime(new Date(initialTime));

function updateClock() {
  if (!clockFile || !existsSync(clockFile)) return;
  const command = readFileSync(clockFile, "utf8");
  if (!command || command === applied) return;
  setSystemTime(new Date(command));
  applied = command;
  writeFileSync(`${clockFile}.applied`, command);
}

let applied = initialTime;
if (clockFile) setInterval(updateClock, 10).unref();
