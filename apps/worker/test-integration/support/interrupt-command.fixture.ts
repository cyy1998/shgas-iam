import { existsSync } from "node:fs";

// Windows has no POSIX signal delivery. Deliver the runtime signal event in this
// child only, while executing the actual CLI and its production signal listener.
// Lock-wait tests request delivery explicitly; other callers retain the 500ms
// request delay. In either case, an early request waits for listener installation.
const requestFile = process.env.IAM_WORKER_TEST_INTERRUPT_FILE;
const requestAt = Date.now() + 500;
const timer = setInterval(() => {
  if (process.listenerCount("SIGTERM") === 0) return;
  if (requestFile ? !existsSync(requestFile) : Date.now() < requestAt) return;
  clearInterval(timer);
  process.emit("SIGTERM", "SIGTERM");
}, 10);
timer.unref();
