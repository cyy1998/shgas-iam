import process from "node:process";

if (process.platform !== "linux") {
  console.error("This repository's development and test tooling requires Linux or WSL2.");
  process.exit(1);
}
