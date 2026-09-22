import type { AxisReviewRecord } from "../sandcastle/review";
import { describe, expect, test } from "bun:test";
import { createReviewEvidence } from "../sandcastle/review";

const baseSha = "a".repeat(40);
const candidateSha = "b".repeat(40);
const rootId = "01950000-0000-7000-8000-000000000001";

function report(axis: AxisReviewRecord["axis"], overrides: Record<string, unknown> = {}) {
  return `<axis-review>${JSON.stringify({
    axis,
    round: 1,
    baseSha,
    candidateSha,
    status: "pass",
    findings: [],
    ...overrides,
  })}</axis-review>`;
}

function collaboration(
  tool: string,
  receivers: string[],
  states: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return JSON.stringify({
    type: "item.completed",
    item: {
      id: "item_3",
      type: "collab_tool_call",
      tool,
      sender_thread_id: rootId,
      receiver_thread_ids: receivers,
      prompt: tool === "spawn_agent" ? "Review the requested axis." : null,
      agents_states: states,
      status: "completed",
      ...overrides,
    },
  });
}

function evidence() {
  const collector = createReviewEvidence();
  collector.observe(JSON.stringify({ type: "thread.started", thread_id: rootId }));
  return collector;
}

function spawn(collector: ReturnType<typeof createReviewEvidence>, id: string) {
  collector.observe(collaboration("spawn_agent", [id], { [id]: { status: "running", message: null } }));
}

function complete(collector: ReturnType<typeof createReviewEvidence>, id: string, message: string) {
  collector.observe(collaboration("wait", [id], { [id]: { status: "completed", message } }));
}

function pair(
  collector: ReturnType<typeof createReviewEvidence>,
  overrides: Record<string, unknown> = {},
  prefix = "review",
) {
  for (const axis of ["standards", "spec"] as const) {
    const id = `${prefix}-${axis}`;
    spawn(collector, id);
    complete(collector, id, report(axis, overrides));
  }
}

describe("Sandcastle Codex review evidence", () => {
  test("accepts actual exec-shaped spawn and combined wait records for distinct child agents", () => {
    const collector = evidence();
    spawn(collector, "standards-child");
    spawn(collector, "spec-child");
    collector.observe(collaboration("wait", ["standards-child", "spec-child"], {
      "standards-child": { status: "completed", message: `No standards findings.\n${report("standards")}` },
      "spec-child": { status: "completed", message: report("spec") },
    }));
    const result = collector.assertPassed(baseSha, candidateSha);
    expect(result.standards).toMatchObject({ agentId: "standards-child", axis: "standards", round: 1 });
    expect(result.spec).toMatchObject({ agentId: "spec-child", axis: "spec", round: 1 });
  });

  test("permits repeated terminal wait snapshots and closing completed agents", () => {
    const collector = evidence();
    pair(collector);
    complete(collector, "review-standards", report("standards"));
    collector.observe(collaboration("close_agent", ["review-spec"], {
      "review-spec": { status: "shutdown", message: null },
    }));
    expect(collector.assertPassed(baseSha, candidateSha).spec.status).toBe("pass");
  });

  test("allows repairs followed by fresh dual-axis reviews of the final candidate", () => {
    const collector = evidence();
    pair(collector, { candidateSha: "c".repeat(40), status: "fail", findings: ["Fix missing validation."] }, "first");
    pair(collector, { round: 2 }, "second");
    expect(collector.assertPassed(baseSha, candidateSha).standards.round).toBe(2);
  });

  test("accepts a passing tenth round after nine complete failed rounds", () => {
    const collector = evidence();
    for (let round = 1; round < 10; round++)
      pair(collector, { round, status: "fail", findings: ["Fix issue"] }, `round-${round}`);
    pair(collector, { round: 10 }, "tenth");
    expect(collector.assertPassed(baseSha, candidateSha).spec.round).toBe(10);
  });

  test("rejects an eleventh round after ten complete failed rounds", () => {
    const collector = evidence();
    for (let round = 1; round <= 10; round++)
      pair(collector, { round, status: "fail", findings: ["Fix issue"] }, `round-${round}`);
    pair(collector, { round: 11 }, "eleventh");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects extra review pairs disguised by repeated early round numbers", () => {
    const collector = evidence();
    for (const prefix of ["first", "second", "third"])
      pair(collector, { round: 1, status: "fail", findings: ["Fix missing validation"] }, prefix);
    pair(collector, { round: 2 }, "fourth");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects skipped earlier rounds", () => {
    const collector = evidence();
    pair(collector, { round: 2 });
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects incomplete earlier rounds even when the final pair passes", () => {
    const collector = evidence();
    spawn(collector, "first-standards");
    complete(collector, "first-standards", report("standards", { status: "fail", findings: ["Fix"] }));
    pair(collector, { round: 2 }, "second");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects earlier axes reviewing different candidates", () => {
    const collector = evidence();
    spawn(collector, "first-standards");
    spawn(collector, "first-spec");
    complete(collector, "first-standards", report("standards", { candidateSha: "c".repeat(40) }));
    complete(collector, "first-spec", report("spec"));
    pair(collector, { round: 2 }, "second");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("ignores ordinary researcher results and nested collaboration events", () => {
    const collector = evidence();
    spawn(collector, "researcher");
    complete(collector, "researcher", "The entry point is runtime.mts.");
    collector.observe(collaboration("spawn_agent", ["nested"], {}, { sender_thread_id: "researcher" }));
    collector.observe(collaboration("wait", ["nested"], {
      nested: { status: "completed", message: report("spec", { round: 11 }) },
    }, { sender_thread_id: "researcher" }));
    pair(collector);
    expect(collector.assertPassed(baseSha, candidateSha).spec.status).toBe("pass");
  });

  test("does not accept the implementer's own final answer as child evidence", () => {
    const collector = evidence();
    collector.observe(JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: `${report("standards")}\n${report("spec")}` },
    }));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("Missing completed reviews");
  });

  test("requires successful root-thread spawn before accepting completion", () => {
    const collector = evidence();
    complete(collector, "unspawned", report("standards"));
    collector.observe(collaboration("spawn_agent", ["failed"], {}, { status: "failed" }));
    complete(collector, "failed", report("spec"));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("Missing completed reviews");
  });

  test("does not treat nested child spawns as implementation children", () => {
    const collector = evidence();
    for (const axis of ["standards", "spec"] as const) {
      collector.observe(collaboration("spawn_agent", [axis], {}, { sender_thread_id: "other-root" }));
      complete(collector, axis, report(axis));
    }
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("Missing completed reviews");
  });

  test.each([
    ["wrong candidate", { candidateSha: "c".repeat(40) }],
    ["wrong baseline", { baseSha: "d".repeat(40) }],
    ["failed review", { status: "fail" }],
    ["unresolved findings", { findings: ["Missing test."] }],
    ["too many rounds", { round: 11 }],
    ["zero round", { round: 0 }],
    ["fractional round", { round: 1.5 }],
    ["unknown axis", { axis: "security" }],
    ["missing findings", { findings: undefined }],
    ["non-array findings", { findings: {} }],
    ["short commit", { candidateSha: "abc1234" }],
  ])("rejects %s", (_label, overrides) => {
    const collector = evidence();
    pair(collector, overrides);
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects a single axis and mismatched rounds", () => {
    const collector = evidence();
    spawn(collector, "standards");
    complete(collector, "standards", report("standards"));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
    spawn(collector, "spec");
    complete(collector, "spec", report("spec", { round: 2 }));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("rejects mixed candidates within the same round", () => {
    const collector = evidence();
    spawn(collector, "standards");
    complete(collector, "standards", report("standards"));
    spawn(collector, "spec");
    complete(collector, "spec", report("spec", { candidateSha: "c".repeat(40) }));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("a later failed review cannot fall back to an earlier passing pair", () => {
    const collector = evidence();
    pair(collector);
    pair(collector, { round: 2, status: "fail" }, "second");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test.each(["send_input", "spawn_agent"])("rejects a review child reused via %s", (tool) => {
    const collector = evidence();
    pair(collector);
    collector.observe(collaboration(tool, ["review-spec"], {}));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("must be fresh");
  });

  test("rejects one child claiming both axes in different terminal messages", () => {
    const collector = evidence();
    spawn(collector, "same-child");
    complete(collector, "same-child", report("standards"));
    complete(collector, "same-child", report("spec"));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
  });

  test("cannot erase a reused review by replacing its terminal message with ordinary text", () => {
    const collector = evidence();
    pair(collector);
    complete(collector, "review-spec", "Disregard the prior report.");
    pair(collector, { round: 2 }, "new");
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("must be fresh");
  });

  test.each([
    ["invalid JSON", "<axis-review>{</axis-review>"],
    ["two review blocks", `${report("standards")}${report("spec")}`],
    ["unclosed block", "<axis-review>{}"],
  ])("stores %s errors until assertPassed instead of throwing in the raw callback", (_label, message) => {
    const collector = evidence();
    spawn(collector, "bad-review");
    expect(() => complete(collector, "bad-review", message)).not.toThrow();
    pair(collector);
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("Review evidence rejected");
  });

  test("fails closed on invalid JSON or unsupported collaboration shape", () => {
    for (const line of ["not json", collaboration("wait", [], {}, { receiver_thread_ids: null })]) {
      const collector = evidence();
      expect(() => collector.observe(line)).not.toThrow();
      pair(collector);
      expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow("Review evidence rejected");
    }
  });

  test("does not accept running agent states or absent root thread metadata", () => {
    const collector = evidence();
    spawn(collector, "unfinished");
    collector.observe(collaboration("wait", ["unfinished"], {
      unfinished: { status: "running", message: report("standards") },
    }));
    expect(() => collector.assertPassed(baseSha, candidateSha)).toThrow();
    const noRoot = createReviewEvidence();
    pair(noRoot);
    expect(() => noRoot.assertPassed(baseSha, candidateSha)).toThrow();
  });
});
