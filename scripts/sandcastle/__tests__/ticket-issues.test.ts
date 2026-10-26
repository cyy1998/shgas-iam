import { expect, test } from "bun:test";
import { assertTicketIssuesOpen, ExecutorInfrastructureError } from "../ticket-runtime.mts";

test("GitHub state lookup failures stop the runner as public infrastructure failures", async () => {
  let failure: unknown;
  try {
    await assertTicketIssuesOpen("unused", [11, 10], async () => {
      throw new Error("GitHub unavailable");
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ExecutorInfrastructureError);
});

test("a closed issue remains a local ticket failure", async () => {
  let failure: unknown;
  try {
    await assertTicketIssuesOpen("unused", [11, 10], async () => "CLOSED");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure).not.toBeInstanceOf(ExecutorInfrastructureError);
});
