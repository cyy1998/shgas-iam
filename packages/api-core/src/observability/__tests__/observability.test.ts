import { describe, expect, test } from "bun:test";
import { observabilityLogFields, pickObservabilityContext } from "../index";

describe("observability helpers", () => {
  test("picks only request and trace identifiers with null fallbacks", () => {
    expect(pickObservabilityContext({
      requestId: " req-1 ",
      traceId: " trace-1 ",
    })).toEqual({
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(pickObservabilityContext(undefined)).toEqual({
      requestId: null,
      traceId: null,
    });
  });

  test("builds stable log fields with explicit nulls", () => {
    expect(observabilityLogFields({ requestId: "", traceId: undefined })).toEqual({
      requestId: null,
      traceId: null,
    });
  });
});
