import { watch } from "node:fs";
import path from "node:path";

// Deliver a child-local signal event on Windows through the actual entry listener.
const trigger = process.env.IAM_GATEWAY_TEST_SHUTDOWN_PATH;
if (!trigger) throw new Error("A test-owned shutdown trigger is required");
const watcher = watch(path.dirname(trigger), (_event, filename) => {
  if (String(filename) !== path.basename(trigger)) return;
  watcher.close();
  process.emit("SIGTERM", "SIGTERM");
});
