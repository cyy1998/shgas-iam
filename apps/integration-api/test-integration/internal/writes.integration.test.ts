import { expect, test } from "bun:test";
import { OrganizationLevel, OrganizationType } from "@iam/contracts";
import {
  auditLogs,
  clients,
  employments,
  organizationClosures,
  organizationDocumentOutboxEntries,
  organizations,
  positions,
  userDocumentOutboxEntries,
  users,
} from "@iam/db/schema";
import { createIntegrationApiApp } from "@integration-api/app";
import { eq } from "drizzle-orm";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";

test("legacy writes persist source facts, audit and Outbox before sending the synchronous production welcome SMS", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const observed: unknown[] = [];
  const api = await createIntegrationApiApp({
    env: testEnvironment(pg.databaseUrl, {
      NODE_ENV: "production",
      IAM_INTEGRATION_API_SMS_URL: "https://sms.example.test/send",
      IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: "welcome-test-key",
    }),
    logger: pino({ enabled: false }),
    smsFetch: async (url, init) => {
      const [contact] = await pg.db.select().from(users).where(eq(users.username, "contact-one"));
      const jobs = await pg.db.select().from(userDocumentOutboxEntries);
      const audits = await pg.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "internal.purveyor_contact.register"));
      observed.push({ url, method: init.method, body: JSON.parse(String(init.body)), contact, jobs, audits });
      return new Response(null, { status: 502 });
    },
  });
  try {
    const [parent] = await pg.db
      .insert(organizations)
      .values({
        orgCode: "GY",
        orgName: "Purveyor root",
        path: "",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Company,
      })
      .returning();
    await pg.db
      .update(organizations)
      .set({ path: `/${parent!.id}` })
      .where(eq(organizations.id, parent!.id));
    await pg.db.insert(organizationClosures).values({ ancestorId: parent!.id, descendantId: parent!.id, depth: 0 });
    await pg.db.insert(positions).values({ posCode: "P001", posName: "Supplier Contact" });
    await pg.db.insert(clients).values({
      clientCode: "directory",
      clientName: "Directory",
      clientSecret: "writes-test-key",
      extAttributes: {},
    });
    const write = (method: "POST" | "PUT", path: string, body: unknown) =>
      api.app.request(`/internal/${path}`, {
        method,
        headers: { apikey: "writes-test-key", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const created = await write("POST", "organizations/purveyors", { orgCode: "SUP", orgName: "Supplier" });
    expect(created.status).toBe(200);
    const updated = await write("PUT", "organizations/SUP", { orgName: "Supplier updated" });
    expect(updated.status).toBe(200);
    const [supplier] = await pg.db.select().from(organizations).where(eq(organizations.orgCode, "SUP"));
    expect(supplier?.orgName).toBe("Supplier updated");
    const orgWork = await pg.db.select().from(organizationDocumentOutboxEntries);
    expect(orgWork.length).toBeGreaterThanOrEqual(2);

    const response = await write("POST", "users/purveyor/contacts", {
      orgCode: "SUP",
      username: "contact-one",
      name: "Contact One",
      mobile: "13800000001",
    });
    expect(response.status).toBe(500);
    expect(observed).toMatchObject([
      {
        url: "https://sms.example.test/send",
        method: "POST",
        body: {
          mobile: "13800000001",
          message: expect.stringContaining("尊敬的Contact One："),
          signature: expect.any(String),
        },
        contact: { username: "contact-one" },
        jobs: expect.any(Array),
        audits: [{ actorClientCode: "directory", targetCode: "contact-one" }],
      },
    ]);
    const contact = await pg.db.select().from(users).where(eq(users.username, "contact-one"));
    const assignments = await pg.db.select().from(employments).where(eq(employments.orgId, supplier!.id));
    expect(assignments).toMatchObject([{ userId: contact[0]!.id }]);
    const userWork = await pg.db.select().from(userDocumentOutboxEntries);
    expect(userWork.length).toBeGreaterThanOrEqual(2);
    const orgAudit = await pg.db.select().from(auditLogs).where(eq(auditLogs.action, "internal.purveyor.register"));
    expect(orgAudit).toMatchObject([{ actorClientCode: "directory", targetCode: "SUP" }]);
  } finally {
    await api.close();
    await pg.close();
  }
});
