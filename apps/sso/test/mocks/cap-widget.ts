import { vi } from "vitest";

// Keep the app's fetch adapter and fallback path in the test. The browser-side
// proof computation would require a Web Worker, even for a failed challenge.
vi.mock("cap-widget", () => ({
  default: class {
    constructor(private readonly options: { apiEndpoint: string }) {}

    async solve() {
      const response = await (window.CAP_CUSTOM_FETCH ?? fetch)(`${this.options.apiEndpoint}challenge`, {
        method: "POST",
      });
      if (response.ok) throw new Error("The captcha fixture must return a failed challenge");
      return { success: false };
    }
  },
}));
