export interface AxisReviewRecord {
  agentId: string;
  axis: "standards" | "spec";
  round: number;
  baseSha: string;
  candidateSha: string;
  status: "pass" | "fail";
  findings: unknown[];
}

interface ChildEvidence {
  reused: boolean;
  message?: string;
  review?: AxisReviewRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReview(message: string, agentId: string): AxisReviewRecord | undefined {
  if (!message.includes("<axis-review")) {
    return;
  }
  const blocks = [...message.matchAll(/<axis-review>([\s\S]*?)<\/axis-review>/g)];
  if (blocks.length !== 1 || message.split("<axis-review").length !== 2) {
    throw new Error("Each review agent must return exactly one <axis-review> block.");
  }
  const value: unknown = JSON.parse(blocks[0]![1]!);
  if (!isRecord(value)
    || (value.axis !== "standards" && value.axis !== "spec")
    || typeof value.round !== "number" || !Number.isInteger(value.round) || value.round < 1 || value.round > 10
    || typeof value.baseSha !== "string" || !/^[a-f0-9]{40}$/.test(value.baseSha)
    || typeof value.candidateSha !== "string" || !/^[a-f0-9]{40}$/.test(value.candidateSha)
    || (value.status !== "pass" && value.status !== "fail") || !Array.isArray(value.findings)) {
    throw new Error("Review evidence has an invalid axis, round, commit, status, or findings.");
  }
  return {
    agentId,
    axis: value.axis,
    round: value.round,
    baseSha: value.baseSha,
    candidateSha: value.candidateSha,
    status: value.status,
    findings: value.findings,
  };
}

/** Observes Codex exec JSON events; it does not attest to child role configuration or OS permissions. */
export function createReviewEvidence() {
  let rootId: string | undefined;
  let invalid: string | undefined;
  const children = new Map<string, ChildEvidence>();

  function observeEvent(event: unknown) {
    if (!isRecord(event)) {
      return;
    }
    if (event.type === "thread.started") {
      if (typeof event.thread_id !== "string" || !event.thread_id) {
        throw new Error("Codex did not identify the implementation thread.");
      }
      if (rootId && rootId !== event.thread_id) {
        throw new Error("Multiple implementation threads appeared in the review stream.");
      }
      rootId = event.thread_id;
      return;
    }
    if (event.type !== "item.completed" || !isRecord(event.item)) {
      return;
    }
    const item = event.item;
    if (item.type !== "collab_tool_call" || !rootId || item.sender_thread_id !== rootId) {
      return;
    }
    if (!["spawn_agent", "send_input", "wait", "close_agent"].includes(String(item.tool))) {
      return;
    }
    if (!Array.isArray(item.receiver_thread_ids)
      || !item.receiver_thread_ids.every(id => typeof id === "string" && id.length > 0)
      || !isRecord(item.agents_states)) {
      throw new Error("Codex collaboration evidence has an unsupported shape.");
    }
    if (item.status !== "completed") {
      return;
    }
    for (const id of item.receiver_thread_ids) {
      if (item.tool === "spawn_agent") {
        const existing = children.get(id);
        if (existing) {
          existing.reused = true;
        }
        else if (id !== rootId) {
          children.set(id, { reused: false });
        }
      }
      const child = children.get(id);
      if (!child) {
        continue;
      }
      if (item.tool === "send_input") {
        child.reused = true;
      }
      const state = item.agents_states[id];
      if (!isRecord(state) || state.status !== "completed" || typeof state.message !== "string") {
        continue;
      }
      if (child.message !== undefined && child.message !== state.message) {
        child.reused = true;
      }
      child.message = state.message;
      const review = parseReview(state.message, id);
      child.review ??= review;
    }
  }

  return {
    observe(line: string): void {
      // The SDK catches callback errors. Retain parse failures until the explicit delivery gate instead.
      try {
        observeEvent(JSON.parse(line));
      }
      catch (error) {
        invalid ??= error instanceof Error ? error.message : "Invalid Codex review evidence.";
      }
    },
    assertPassed(baseSha: string, candidateSha: string): {
      standards: AxisReviewRecord;
      spec: AxisReviewRecord;
    } {
      if (invalid) {
        throw new Error(`Review evidence rejected: ${invalid}`);
      }
      const reviews = [...children.values()].flatMap(child => child.review ? [child.review] : []);
      if (!rootId || reviews.length === 0) {
        throw new Error("Missing completed reviews from freshly spawned Codex subagents.");
      }
      if (reviews.some(review => review.baseSha !== baseSha || children.get(review.agentId)!.reused)) {
        throw new Error("Review agents must be fresh and use the fixed implementation baseline.");
      }
      const latestRound = Math.max(...reviews.map(review => review.round));
      for (let number = 1; number <= latestRound; number++) {
        const round = reviews.filter(review => review.round === number);
        if (round.length !== 2 || new Set(round.map(review => review.axis)).size !== 2
          || new Set(round.map(review => review.candidateSha)).size !== 1) {
          throw new Error("Review rounds must be consecutive, with exactly one fresh agent per axis and one candidate.");
        }
      }
      const latest = reviews.filter(review => review.round === latestRound);
      const standards = latest.find(review => review.axis === "standards");
      const spec = latest.find(review => review.axis === "spec");
      if (latest.length !== 2 || !standards || !spec || standards.agentId === spec.agentId
        || latest.some(review => review.candidateSha !== candidateSha
          || review.status !== "pass" || review.findings.length !== 0)) {
        throw new Error("The latest review round must pass both axes for the final candidate with no findings.");
      }
      return { standards, spec };
    },
  };
}
