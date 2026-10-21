import UserInfoPage from "@sso/pages/user-info";
import { HttpResponse, http } from "msw";
import { expect, test, vi } from "vitest";
import { currentUserInfo } from "~sso/test/mocks/fixtures";
import { server } from "~sso/test/mocks/server";
import { __setModel } from "~sso/test/mocks/umijs-max";
import { render, screen, waitFor } from "~sso/test/render";
import { registerMswLifecycle } from "~sso/test/setup-msw";

registerMswLifecycle();

test("loads delegations on tab entry and preserves security drafts across switches", async () => {
  __setModel("sso", { userInfo: currentUserInfo, userInfoStatus: "success", loadUserInfo: vi.fn() });
  let searches = 0;
  server.use(
    http.post("*/public/delegations/search", () => {
      searches += 1;
      return HttpResponse.json({ code: 200, data: [] });
    }),
  );
  const { user } = render(<UserInfoPage />);
  const password = screen.getByPlaceholderText("请输入当前密码");
  await user.type(password, "unsaved-password");
  expect(searches).toBe(0);
  expect(screen.queryByRole("region", { name: "委托设置" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "委托设置" }));
  await waitFor(() => expect(searches).toBe(1));
  expect(screen.getByRole("region", { name: "委托设置" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "保存设置" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("tab", { name: "账号安全" }));
  expect(password).toBeVisible();
  expect(password).toHaveValue("unsaved-password");
  expect(screen.queryByRole("region", { name: "委托设置" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: /绑定手机号/ }));
  expect(screen.getByPlaceholderText("请输入手机号")).toBeVisible();

  await user.click(screen.getByRole("tab", { name: "委托设置" }));
  expect(screen.getByRole("button", { name: "新建委托" })).toBeVisible();
  expect(searches).toBe(1);
});
