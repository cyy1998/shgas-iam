import { describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { errorHandler } from "../error-handler";

describe("errorHandler", () => {
  test("prints the source file location when logging unexpected errors", async () => {
    const app = new Hono();
    const error = new Error("boom");
    const sourceLocation = `${process.cwd()}/apps/api/src/routes/auth/auth.handlers.ts:12:34`;
    error.stack = [
      "Error: boom",
      `    at explode (${sourceLocation})`,
      "    at async dispatch (node_modules/hono/dist/compose.js:22:17)",
    ].join("\n");
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    app.get("/boom", () => {
      throw error;
    });
    app.onError(errorHandler);

    try {
      await app.request("http://localhost/boom?trace=1");

      expect(consoleError).toHaveBeenCalledTimes(1);
      const [firstCall] = consoleError.mock.calls;
      expect(firstCall).toBeDefined();
      if (!firstCall) {
        throw new Error("console.error was not called");
      }

      expect(firstCall[0]).toContain(sourceLocation);
      expect(firstCall[1]).toBe(error);
    }
    finally {
      consoleError.mockRestore();
    }
  });
});
