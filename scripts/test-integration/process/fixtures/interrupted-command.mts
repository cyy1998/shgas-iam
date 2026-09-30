import { writeFile } from "node:fs/promises";
import { withCommandFixture } from "../command-fixture";

const descriptorPath = process.argv[2];
const signal = process.argv[3];
if (descriptorPath === undefined || (signal !== "SIGINT" && signal !== "SIGTERM")) {
  throw new Error("interrupted command fixture requires a descriptor path and signal");
}

try {
  await withCommandFixture("iam-command-interrupted-", async (root) => {
    await writeFile(descriptorPath, root, "utf8");
    // Exercise the catchable event on Windows too; the fixture restores a real self-signal.
    process.emit(signal, signal);
  });
} catch {
  // Model a test runner recording an interrupted test and trying to run another one.
}
await writeFile(`${descriptorPath}.continued`, "continued after interruption", "utf8");
