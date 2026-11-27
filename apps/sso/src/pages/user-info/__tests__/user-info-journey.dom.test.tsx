import { ApiErrorCode, OrganizationType } from "@iam/contracts";
import * as navigation from "@sso/utils/navigation";
import { HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import { ok, serviceFailure } from "~sso/test/mocks/auth";
import { currentUserInfo } from "~sso/test/mocks/fixtures";
import { server } from "~sso/test/mocks/server";
import { fireEvent, screen, waitFor } from "~sso/test/render";
import { registerSsoAppLifecycle, renderSsoApp } from "~sso/test/render-app";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();
registerSsoAppLifecycle();

const userInfoPath = "*/api/iam/sso/user-info";

it("recovers mobile binding after a missing response and a spent SMS code", async () => {
  const writes: { phoneNumber: string; code: string }[] = [];
  server.use(
    http.post<never, { phoneNumber: string; code: string }>("*/api/iam/auth/account/mobile", async ({ request }) => {
      writes.push(await request.json());
      if (writes.length === 1) return HttpResponse.error();
      if (writes.length === 2) return serviceFailure(400, ApiErrorCode.InvalidVerificationCode, "验证码错误");
      return ok(null);
    }),
  );
  const { user } = renderSsoApp("/portal/userInfo");
  await user.click(await screen.findByRole("tab", { name: /绑定手机号/ }));
  fireEvent.change(screen.getByPlaceholderText("请输入手机号"), { target: { value: "13900000001" } });
  const code = screen.getByPlaceholderText("请输入验证码");
  fireEvent.change(code, { target: { value: "123456" } });
  const submit = screen.getByRole("button", { name: "保存设置" });
  await user.click(submit);
  expect(await screen.findByText(/请先确认变更是否已生效.*重新获取验证码/)).toBeVisible();
  expect(writes).toHaveLength(1);

  await user.click(submit);
  expect(await screen.findByText("验证码无效，请检查输入，或重新获取验证码。")).toBeVisible();
  const send = screen.getByRole("button", { name: "获取验证码" });
  expect(send).toBeEnabled();
  await user.click(send);
  await screen.findByRole("button", { name: /^\d+ s$/ });
  fireEvent.change(code, { target: { value: "234567" } });
  await user.click(submit);
  expect(await screen.findByText("更换成功！")).toBeVisible();
  expect(writes).toEqual(["123456", "123456", "234567"].map((code) => ({ phoneNumber: "13900000001", code })));
});

it("keeps a malformed organization projection unavailable until explicitly retried", async () => {
  let reads = 0;
  server.use(
    http.get(userInfoPath, () => {
      reads++;
      return ok({
        ...currentUserInfo,
        profile: {
          ...currentUserInfo.profile,
          employments: [
            {
              isPrimary: true,
              organization: {
                code: "FIN",
                name: "财务部",
                type: OrganizationType.Department,
                path: [
                  { code: "ROOT", name: "总部", type: OrganizationType.Company, level: 1, distanceToTarget: 1 },
                  {
                    code: "FIN",
                    name: "财务部",
                    type: OrganizationType.Department,
                    level: reads === 1 ? 1 : 2,
                    distanceToTarget: 0,
                  },
                ],
              },
              position: { code: "FIN-1", name: "会计" },
              responsibilities: [],
            },
          ],
        },
      });
    }),
  );
  const { user } = renderSsoApp("/portal/userInfo");
  expect(await screen.findByRole("alert")).toHaveTextContent("个人信息加载失败");
  expect(screen.queryByRole("button", { name: "保存设置" })).not.toBeInTheDocument();
  expect(reads).toBe(1);
  await user.click(screen.getByRole("button", { name: /重\s*试/ }));
  expect(await screen.findByText("总部 / 财务部", { exact: true })).toBeVisible();
  expect(screen.getByRole("button", { name: "保存设置" })).toBeVisible();
  expect(reads).toBe(2);
});

it("logs out through the discovered endpoint preserving the business destination", async () => {
  const assign = vi.spyOn(navigation, "assignBrowserLocation").mockImplementation(() => {});
  const redirectUrl = "https://business.example/after-logout?keep=yes";
  const client = "iam";
  server.use(
    http.get("*/sso/.well-known/authentication-configuration", () =>
      ok({ authorizationEndpoint: "/sso/authorize", logoutEndpoint: `${location.origin}/sso/logout` }),
    ),
  );
  const { user } = renderSsoApp(`/portal/userInfo?${new URLSearchParams({ client, redirectUrl })}`);
  await screen.findByRole("tab", { name: /绑定手机号/ });
  await user.hover(screen.getByText("张三", { selector: ".topbar-user-name" }));
  await user.click(await screen.findByText("退出登录", { exact: true }));
  expect(assign).toHaveBeenCalledTimes(1);
  const target = new URL(assign.mock.calls[0][0], location.origin);
  expect(target.origin).toBe(location.origin);
  expect(target.pathname).toBe("/sso/logout");
  expect(Object.fromEntries(target.searchParams)).toEqual({ client, redirectUrl });
});

it("redirects an anonymous profile request to login with the first-party destination", async () => {
  server.use(http.get(userInfoPath, () => serviceFailure(401, ApiErrorCode.Unauthorized, "未登录")));
  renderSsoApp("/portal/userInfo");
  await waitFor(() => expect(location.pathname).toBe("/portal/login"));
  expect(Object.fromEntries(new URLSearchParams(location.search))).toEqual({
    client: "iam",
    redirectUrl: `${location.origin}/portal/userInfo`,
  });
});
