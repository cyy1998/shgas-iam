import { expect, test } from "bun:test";
import { createOrganizationSearchJobProducer } from "../../src/jobs";

test("repeated wakeups enqueue distinct attempts for the same durable change and rebuild version", async () => {
  const attempts: Array<{ name: string; data: unknown; opts?: { jobId?: string } }> = [];
  const producer = createOrganizationSearchJobProducer({
    async addBulk(jobs) {
      attempts.push(...jobs);
      return jobs;
    },
  });
  const change = { changeId: "601d400e-247f-4e75-af78-c07b661b0c1f" };
  const rebuild = { organizationId: 7, version: "2" };
  const first = await producer.enqueueSourceChanges([change]);
  const second = await producer.enqueueSourceChanges([change]);
  await producer.enqueueRebuilds([rebuild]);
  await producer.enqueueRebuilds([rebuild]);
  expect(first).toEqual({ enqueued: 1 });
  expect(second).toEqual({ enqueued: 1 });
  expect(attempts.map(({ name, data }) => ({ name, data }))).toEqual([
    { name: "expand-change", data: change },
    { name: "expand-change", data: change },
    { name: "rebuild-document", data: rebuild },
    { name: "rebuild-document", data: rebuild },
  ]);
  expect(new Set(attempts.map((job) => job.opts?.jobId)).size).toBe(4);
});
