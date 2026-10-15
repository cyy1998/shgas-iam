const { mkdirSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const packageName = require("./package.json").name;
const candidate = require("./candidate.json");
const run = process.env.SMOKE_RUN;
mkdirSync("/data", { recursive: true });
writeFileSync("/data/receipt.json", JSON.stringify({ run, ...candidate }));
createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.url === "/set-cookie") response.setHeader("set-cookie", `smoke=${run}; Path=/; HttpOnly; SameSite=Lax`);
  response.end(
    JSON.stringify({
      run,
      ...candidate,
      packageName,
      host: request.headers.host,
      cookie: request.headers.cookie ?? "",
    }),
  );
}).listen(3000, "0.0.0.0");
