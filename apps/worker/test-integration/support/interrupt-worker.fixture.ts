import { existsSync } from "node:fs";

// Exercise the production listener after installation. This does not claim
// native POSIX signal delivery on Windows.
const requestFile = process.env.IAM_WORKER_TEST_INTERRUPT_FILE;
const timer = setInterval(() => {
  if (!requestFile || !existsSync(requestFile) || process.listenerCount("SIGTERM") === 0) return;
  clearInterval(timer);
  process.emit("SIGTERM", "SIGTERM");
}, 10);
timer.unref();
