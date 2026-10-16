import { expect, test } from "bun:test";
import { withGatewayLifecycleFixture } from "../support/gateway-lifecycle.fixture";

test("a real TCP disconnect leaves the original publish running once and busy until completion", async () => {
  await withGatewayLifecycleFixture(
    async ({ proxy, remote, startGateway, connectCaller, body, observeAvailability }) => {
      const gateway = await startGateway();
      const gate = proxy.interceptOnce({ method: "PUT", path: "/apisix/admin/upstreams/tender.api.test" });
      const caller = await connectCaller(gateway, body("first"));
      await gate.entered;
      await caller.disconnect();
      expect(caller.receivedBytes()).toBe(0);
      const accessBeforeBusy = proxy.journal.length;
      const busy = await gateway.apply(body("second"));
      expect(busy).toMatchObject({ status: 409, body: { code: "GATEWAY_BUSY" } });
      expect(proxy.journal.length).toBe(accessBeforeBusy);
      gate.release();
      await gate.completed;
      const available = await observeAvailability(gateway);
      expect(available.status).toBe(200);
      const actual = await remote.read();
      expect(actual.routes).toHaveLength(1);
      expect(actual.routes[0]).toMatchObject({ id: "tender.api.test", uri: "/first/*" });
      expect(proxy.journal.filter((entry) => entry.method === "PUT").map((entry) => entry.path)).toEqual([
        "/apisix/admin/upstreams/tender.api.test",
        "/apisix/admin/services/tender.test",
        "/apisix/admin/routes/tender.api.test",
      ]);
    },
  );
}, 180_000);

test("the service deadline blocks a disconnected publish even when its original remote write arrives late", async () => {
  await withGatewayLifecycleFixture(
    async ({ proxy, remote, startGateway, connectCaller, body, observeAvailability }) => {
      const gateway = await startGateway({ operationTimeoutMs: 1500, requestTimeoutMs: 1500 });
      const lateWrite = proxy.interceptOnce({ method: "PUT", path: "/apisix/admin/upstreams/tender.api.test" });
      const caller = await connectCaller(gateway, body("late"));
      await lateWrite.entered;
      await caller.disconnect();
      const blocked = await observeAvailability(gateway);
      expect(blocked).toMatchObject({ status: 503, body: { code: "GATEWAY_BLOCKED" } });
      const beforeLateWrite = await remote.read();
      expect(beforeLateWrite.upstreams).toHaveLength(0);
      lateWrite.release();
      await lateWrite.completed;
      const afterLateWrite = await remote.read();
      expect(afterLateWrite.upstreams[0]).toMatchObject({ id: "tender.api.test", desc: "late" });
      const stillBlocked = await gateway.apply(body("must-not-retry"));
      expect(stillBlocked.body.code).toBe("GATEWAY_BLOCKED");
      expect(proxy.journal.filter((entry) => entry.method === "PUT")).toHaveLength(1);
      expect(proxy.journal.filter((entry) => entry.method === "DELETE")).toHaveLength(0);
      await remote.delete("upstreams", "tender.api.test");
    },
  );
}, 180_000);

test("normal shutdown stops new apply and waits for the original real publication before releasing resources", async () => {
  await withGatewayLifecycleFixture(async ({ proxy, remote, database, startGateway, body }) => {
    const gateway = await startGateway();
    const gate = proxy.interceptOnce({ method: "PUT", path: "/apisix/admin/upstreams/tender.api.test" });
    const publication = gateway.apply(body("drained"));
    await gate.entered;
    await gateway.shutdown();
    await gateway.waitForEvent("gateway_stopping");
    let newApply: Awaited<ReturnType<typeof gateway.apply>> | undefined;
    let connectionFailure: unknown;
    try {
      newApply = await gateway.apply(body("must-not-run"));
    } catch (error) {
      connectionFailure = error;
    }
    const refusedConnection =
      connectionFailure instanceof Error &&
      "code" in connectionFailure &&
      ["ConnectionRefused", "SocketClosed", "ECONNREFUSED", "ECONNRESET", "EPIPE"].includes(
        String(connectionFailure.code),
      );
    expect(refusedConnection || (newApply?.status === 503 && newApply.body.code === "GATEWAY_STOPPING")).toBe(true);
    expect(gateway.child.exitCode).toBeNull();
    expect(gateway.child.signalCode).toBeNull();
    expect(proxy.journal.filter((entry) => entry.method === "PUT")).toHaveLength(1);
    gate.release();
    const result = await publication;
    expect(result).toMatchObject({ status: 200, body: { data: { outcome: "applied", written: true } } });
    const exited = await gateway.waitForExit();
    expect(exited).toEqual({ code: 0, signal: null });
    const actual = await remote.read();
    expect(actual.routes[0]).toMatchObject({ uri: "/drained/*" });
    const sessions = await database.sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'iam-gateway' AND datname = current_database()`;
    expect(sessions[0]?.count).toBe(0);
    let listening = false;
    try {
      await fetch(`${gateway.origin}/health`, { signal: AbortSignal.timeout(1000) });
      listening = true;
    } catch {}
    expect(listening).toBe(false);
  });
}, 180_000);

test("an undeliverable unknown result remains blocked until manual repair and a fresh process", async () => {
  await withGatewayLifecycleFixture(
    async ({ proxy, remote, startGateway, connectCaller, body, observeAvailability }) => {
      const gateway = await startGateway();
      const lostResponse = proxy.interceptOnce({
        method: "PUT",
        path: "/apisix/admin/upstreams/tender.api.test",
        action: "drop_after_forward",
      });
      const failedRecovery = proxy.interceptOnce({
        method: "DELETE",
        path: "/apisix/admin/upstreams/tender.api.test",
        action: "reject",
      });
      const caller = await connectCaller(gateway, body("unknown"));
      await lostResponse.entered;
      await caller.disconnect();
      lostResponse.release();
      await failedRecovery.entered;
      const busy = await gateway.apply(body("must-not-run"));
      expect(busy.body.code).toBe("GATEWAY_BUSY");
      failedRecovery.release();
      await failedRecovery.completed;
      const blocked = await observeAvailability(gateway);
      expect(blocked).toMatchObject({ status: 503, body: { code: "GATEWAY_BLOCKED" } });
      const accessBeforeBlocked = proxy.journal.length;
      const rejected = await gateway.apply(body("still-blocked"));
      expect(rejected.body.code).toBe("GATEWAY_BLOCKED");
      expect(proxy.journal.length).toBe(accessBeforeBlocked);
      const actual = await remote.read();
      expect(actual.upstreams).toHaveLength(1);
      expect(actual.upstreams[0]).toMatchObject({ id: "tender.api.test", desc: "unknown" });
      expect(proxy.journal.filter((entry) => entry.method === "PUT")).toHaveLength(1);
      // An operator first joins the failed attempt, inspects APISIX and repairs its remaining object.
      await remote.delete("upstreams", "tender.api.test");
      const repaired = await remote.read();
      expect(repaired.upstreams).toHaveLength(0);
      await gateway.shutdown();
      const stopped = await gateway.waitForExit();
      expect(stopped).toEqual({ code: 0, signal: null });
      const writesBeforeRestart = proxy.journal.filter((entry) => entry.method !== "GET").length;
      const restarted = await startGateway();
      expect(proxy.journal.filter((entry) => entry.method !== "GET")).toHaveLength(writesBeforeRestart);
      const published = await restarted.apply(body("recovered"));
      expect(published).toMatchObject({ status: 200, body: { data: { outcome: "applied", written: true } } });
      const afterRestart = await remote.read();
      expect(afterRestart.routes[0]).toMatchObject({ uri: "/recovered/*" });
    },
  );
}, 180_000);

test("a disconnected caller cannot release apply ownership while real compensation is running", async () => {
  await withGatewayLifecycleFixture(
    async ({ proxy, remote, startGateway, connectCaller, body, observeAvailability }) => {
      await remote.upsert("upstreams", "unrelated", { type: "roundrobin", nodes: { "127.0.0.1:30001": 1 } });
      const gateway = await startGateway();
      const rejection = proxy.interceptOnce({
        method: "PUT",
        path: "/apisix/admin/routes/tender.api.test",
        action: "reject",
      });
      const recovery = proxy.interceptOnce({ method: "DELETE", path: "/apisix/admin/routes/tender.api.test" });
      const caller = await connectCaller(gateway, body("rejected"));
      await rejection.entered;
      await caller.disconnect();
      rejection.release();
      await recovery.entered;
      const busy = await gateway.apply(body("must-not-run"));
      expect(busy).toMatchObject({ status: 409, body: { code: "GATEWAY_BUSY" } });
      recovery.release();
      await recovery.completed;
      const available = await observeAvailability(gateway);
      expect(available.status).toBe(200);
      const actual = await remote.read();
      expect(actual.routes).toHaveLength(0);
      expect(actual.services).toHaveLength(0);
      expect(actual.upstreams.map((resource) => resource.id)).toEqual(["unrelated"]);
      expect(proxy.journal.filter((entry) => entry.method === "DELETE").map((entry) => entry.path)).toEqual([
        "/apisix/admin/routes/tender.api.test",
        "/apisix/admin/services/tender.test",
        "/apisix/admin/upstreams/tender.api.test",
      ]);
    },
  );
}, 180_000);
