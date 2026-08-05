import readline from "node:readline";
import { createState, reduce, render, renderSnapshot } from "./model.mjs";

if (process.argv.includes("--snapshot") || !process.stdin.isTTY) {
  console.log(renderSnapshot());
  process.exit(0);
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

let state = createState();

function draw() {
  console.clear();
  console.log(render(state));
}

function quit() {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stdout.write("\n");
}

process.stdin.on("keypress", (_input, key) => {
  if (key.ctrl && key.name === "c") {
    quit();
    return;
  }

  if (key.name === "q") {
    quit();
    return;
  }

  state = reduce(state, key.name);
  draw();
});

draw();
