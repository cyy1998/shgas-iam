import { DelegationStatus } from "@iam/delegation/wire";
import DelegationSettings from "@sso/pages/user-info/_components/DelegationSettings";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";
import { delegationRecord } from "~sso/test/mocks/delegation";
import { server } from "~sso/test/mocks/server";
import { fireEvent, render, screen, waitFor, within } from "~sso/test/render";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();
test("switching to received delegations requests that direction and removes every management action", async () => {
  const directions: unknown[] = [];
  server.use(
    http.post("*/public/delegations/search", async ({ request }) => {
      directions.push(await request.json());
      return HttpResponse.json({ code: 200, data: [delegationRecord] });
    }),
  );
  render(<DelegationSettings />);
  await screen.findByRole("button", { name: "编辑" });
  fireEvent.click(screen.getByRole("tab", { name: "委托给我的" }));
  await waitFor(() => expect(directions).toEqual([{ direction: "outgoing" }, { direction: "incoming" }]));
  expect(screen.queryByRole("button", { name: "新建委托" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "暂停" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "结束" })).not.toBeInTheDocument();
});
test("creates a delegation with selected safe identities and refreshes the managed list", async () => {
  let submitted: Record<string, unknown> | undefined;
  let searches = 0;
  server.use(
    http.post("*/public/delegations/search", () => {
      searches += 1;
      return HttpResponse.json({ code: 200, data: submitted ? [delegationRecord] : [] });
    }),
    http.get("*/public/delegations/choices/clients", () =>
      HttpResponse.json({ code: 200, data: [{ id: 7, clientCode: "expenses", clientName: "报销系统" }] }),
    ),
    http.get("*/public/delegations/choices/users", () =>
      HttpResponse.json({ code: 200, data: [{ id: 2, username: "bob", name: "Bob" }] }),
    ),
    http.get("*/public/delegations/choices/organizations", () =>
      HttpResponse.json({ code: 200, data: [{ id: 9, orgCode: "FINANCE", orgName: "财务部" }] }),
    ),
    http.post("*/public/delegations", async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ code: 200, data: { changed: true, result: delegationRecord } });
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(screen.getByRole("button", { name: "新建委托" }));
  await screen.findByRole("dialog");
  for (const [label, text] of [
    ["应用", "报销系统（expenses）"],
    ["受托人", "Bob（bob）"],
    ["组织范围", "财务部（FINANCE）"],
  ]) {
    fireEvent.mouseDown(screen.getByLabelText(label));
    fireEvent.click(await screen.findByText(text));
  }
  for (const [label, value] of [
    ["开始时间", "2030-02-01 09:00"],
    ["结束时间", "2030-02-02 09:00"],
  ]) {
    const input = screen.getByLabelText(label);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.blur(input);
  }
  fireEvent.change(screen.getByLabelText("说明"), { target: { value: "外出代办" } });
  fireEvent.click(screen.getByRole("button", { name: "保存委托" }));
  await screen.findByRole("button", { name: "编辑" });
  expect(submitted).toMatchObject({
    clientId: 7,
    delegateeUsername: "bob",
    orgCode: "FINANCE",
    description: "外出代办",
    startTime: new Date("2030-02-01T09:00").toISOString(),
    endTime: new Date("2030-02-02T09:00").toISOString(),
  });
  expect(submitted).not.toHaveProperty("delegatorUsername");
  expect(submitted).not.toHaveProperty("delegatorUserId");
  expect(searches).toBe(2);
});
test("editing changes only the period and description and refreshes the current row", async () => {
  let submitted: Record<string, unknown> | undefined;
  server.use(
    http.post("*/public/delegations/search", () =>
      HttpResponse.json({ code: 200, data: [{ ...delegationRecord, description: submitted?.description ?? "出差" }] }),
    ),
    http.patch("*/public/delegations/42", async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ code: 200, data: { changed: true, result: { ...delegationRecord, ...submitted } } });
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByLabelText("应用")).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText("受托人")).not.toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("说明"), { target: { value: "延期代办" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存委托" }));
  await screen.findByText("延期代办");
  expect(Object.keys(submitted!)).toEqual(["startTime", "endTime", "description"]);
});
test("pause and resume refresh available actions, and ending removes further management", async () => {
  let status = DelegationStatus.Enable;
  const patches: unknown[] = [];
  server.use(
    http.post("*/public/delegations/search", () =>
      HttpResponse.json({
        code: 200,
        data: [{ ...delegationRecord, startTime: "2000-01-01T00:00:00Z", endTime: "2050-01-01T00:00:00Z", status }],
      }),
    ),
    http.patch("*/public/delegations/42", async ({ request }) => {
      const patch = (await request.json()) as { status: DelegationStatus };
      patches.push(patch);
      status = patch.status;
      return HttpResponse.json({ code: 200, data: { changed: true, result: { ...delegationRecord, status } } });
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "暂停" }));
  await screen.findByText("暂停（期间内）");
  expect(screen.queryByText("暂停（生效中）")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "恢复" }));
  await screen.findByRole("button", { name: "暂停" });
  expect(screen.getByText("生效中")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "结束" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认结束" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument());
  expect(patches).toEqual([
    { status: DelegationStatus.Pause },
    { status: DelegationStatus.Enable },
    { status: DelegationStatus.Disable },
  ]);
});
test("history filters keep expired open records manageable and ended records read-only", async () => {
  server.use(
    http.post("*/public/delegations/search", () =>
      HttpResponse.json({
        code: 200,
        data: [
          {
            ...delegationRecord,
            description: "未来委托",
            startTime: "2050-01-01T00:00:00Z",
            endTime: "2050-02-01T00:00:00Z",
          },
          {
            ...delegationRecord,
            id: 43,
            description: "到期委托",
            startTime: "2000-01-01T00:00:00Z",
            endTime: "2000-02-01T00:00:00Z",
          },
          { ...delegationRecord, id: 44, description: "结束委托", status: DelegationStatus.Disable },
        ],
      }),
    ),
  );
  render(<DelegationSettings />);
  await screen.findByText("到期委托");
  expect(screen.queryByText("结束委托")).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByLabelText("委托状态筛选"));
  fireEvent.click(await screen.findByText("已结束"));
  await screen.findByText("结束委托");
  expect(screen.queryByText("到期委托")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument();
  fireEvent.mouseDown(screen.getByLabelText("委托状态筛选"));
  fireEvent.click(await screen.findByText("已到期"));
  await screen.findByText("到期委托");
  expect(screen.getByRole("button", { name: "编辑" })).toBeEnabled();
  expect(screen.queryByText("未来委托")).not.toBeInTheDocument();
});
test("a rejected write stays visible and manual refresh reads facts without replaying the command", async () => {
  let patches = 0;
  let ended = false;
  server.use(
    http.post("*/public/delegations/search", () =>
      HttpResponse.json({
        code: 200,
        data: [{ ...delegationRecord, status: ended ? DelegationStatus.Disable : DelegationStatus.Enable }],
      }),
    ),
    http.patch("*/public/delegations/42", () => {
      patches += 1;
      ended = true;
      return HttpResponse.json({ code: "ENDED", message: "委托已结束，不能修改" }, { status: 409 });
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "暂停" }));
  await screen.findByText("委托已结束，不能修改");
  fireEvent.click(screen.getByRole("button", { name: "刷新委托" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "编辑" })).not.toBeInTheDocument());
  expect(patches).toBe(1);
  expect(screen.getByText("委托已结束，不能修改")).toBeInTheDocument();
});
test("editing a description preserves the original period precision", async () => {
  const precise = { ...delegationRecord, startTime: "2026-10-20T00:01:23.456Z", endTime: "2026-10-30T00:02:34.567Z" };
  let submitted: Record<string, unknown> | undefined;
  server.use(
    http.post("*/public/delegations/search", () => HttpResponse.json({ code: 200, data: [precise] })),
    http.patch("*/public/delegations/42", async ({ request }) => {
      submitted = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ code: 200, data: { changed: true, result: precise } });
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "编辑" }));
  fireEvent.change(await screen.findByLabelText("说明"), { target: { value: "只改说明" } });
  fireEvent.click(screen.getByRole("button", { name: "保存委托" }));
  await waitFor(() => expect(submitted).toBeDefined());
  expect(submitted?.startTime).toBe("2026-10-20T00:01:23.456Z");
  expect(submitted?.endTime).toBe("2026-10-30T00:02:34.567Z");
});
test("a pending or unknown write cannot be automatically replayed and can be followed by an explicit read", async () => {
  let release!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  let patches = 0;
  let searches = 0;
  server.use(
    http.post("*/public/delegations/search", () => {
      searches += 1;
      return HttpResponse.json({ code: 200, data: [delegationRecord] });
    }),
    http.patch("*/public/delegations/42", async () => {
      patches += 1;
      await responseReady;
      return HttpResponse.error();
    }),
  );
  render(<DelegationSettings />);
  fireEvent.click(await screen.findByRole("button", { name: "暂停" }));
  await waitFor(() => expect(patches).toBe(1));
  expect(screen.getByRole("button", { name: "暂停" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "暂停" }));
  release();
  await screen.findByText("操作结果未确认，请刷新列表确认后再操作");
  fireEvent.click(screen.getByRole("button", { name: "刷新委托" }));
  await waitFor(() => expect(searches).toBe(2));
  expect(patches).toBe(1);
});
