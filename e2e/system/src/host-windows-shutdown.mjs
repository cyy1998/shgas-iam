import { existsSync } from "node:fs";

// Windows sends a cooperative shutdown request through this private, run-scoped path.
// Dispatch the same app handler used for POSIX SIGTERM before the enclosing Job can be killed.
const { IAM_E2E_HOST_STOP_FILE: stopFile, IAM_OWNED_PROCESS_SCOPE_FILE: scopeFile } = process.env;
const timer = setInterval(() => {
  if ((!stopFile || !existsSync(stopFile)) && (!scopeFile || existsSync(scopeFile))) return;
  clearInterval(timer);
  if (process.listenerCount("SIGTERM") > 0) process.emit("SIGTERM", "SIGTERM");
  else process.exit(0);
}, 25);
timer.unref();
