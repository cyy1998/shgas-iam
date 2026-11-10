import RoleFormModal from "@admin/pages/roles/components/RoleFormModal";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import type { ComponentProps } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "~admin/test/render";

const createRole = vi.hoisted(() => vi.fn());
vi.mock("@admin/services/role", () => ({ createRole }));
vi.mock("@admin/pages/roles/role-selectors", () => ({
  requestClientOptions: async () => [
    { label: "采招系统", value: "tender" },
    { label: "门户", value: "portal" },
    { label: "长编码应用", value: "x".repeat(64) },
  ],
}));
vi.mock("@ant-design/pro-components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ant-design/pro-components")>();
  const ModalForm = (props: ComponentProps<typeof actual.ModalForm>) => (
    <actual.ModalForm {...props} modalProps={{ ...props.modalProps, transitionName: "", maskTransitionName: "" }} />
  );
  return { ...actual, ModalForm, default: { ...actual, ModalForm } };
});
afterEach(cleanup);
beforeEach(() => {
  createRole.mockReset().mockResolvedValue({ changed: true, result: { roleCode: "tender:admin" } });
});

async function setup() {
  const onSuccess = vi.fn();
  const onCommitted = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          重新创建
        </button>
        <RoleFormModal open={open} onOpenChange={setOpen} onSuccess={onSuccess} onCommitted={onCommitted} />
      </>
    );
  }
  const view = render(<Harness />);
  const dialog = within(await screen.findByRole("dialog"));
  const selectClient = async (name: string) => {
    await view.user.click(dialog.getByRole("combobox", { name: "所属应用" }));
    await view.user.click(await screen.findByText(name, { selector: ".ant-select-item-option-content" }));
  };
  await selectClient("采招系统");
  await view.user.type(dialog.getByRole("textbox", { name: "角色名称" }), "管理员");
  return { ...view, dialog, selectClient, onSuccess, onCommitted };
}

describe("RoleFormModal application prefix", () => {
  it("switches to a Global Role, hides the selected application and adds the prefix once", async () => {
    const { user, dialog } = await setup();
    await user.click(dialog.getByRole("combobox", { name: "角色类型" }));
    await user.click(await screen.findByText("全局角色", { selector: ".ant-select-item-option-content" }));
    expect(dialog.queryByRole("combobox", { name: "所属应用" })).not.toBeInTheDocument();
    const code = dialog.getByRole("textbox", { name: "角色编码" });
    await user.click(code);
    await user.paste("global:reviewer");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith({
        roleType: "global",
        roleCode: "global:reviewer",
        roleName: "管理员",
        status: 1,
        description: null,
      }),
    );
  });

  it("submits one application prefix and preserves the role name", async () => {
    const { user, dialog, onSuccess } = await setup();
    await user.type(dialog.getByRole("textbox", { name: "角色编码" }), "admin");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith({
        roleType: "client",
        clientCode: "tender",
        roleCode: "tender:admin",
        roleName: "管理员",
        status: 1,
        description: null,
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith("tender:admin");
  });

  it("replaces the prefix when changing applications without replacing the suffix", async () => {
    const { user, dialog, selectClient } = await setup();
    await user.type(dialog.getByRole("textbox", { name: "角色编码" }), "admin");
    await selectClient("门户");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith(
        expect.objectContaining({ clientCode: "portal", roleCode: "portal:admin" }),
      ),
    );
  });

  it("accepts a pasted complete code without repeating its prefix and reports that code after a committed failure", async () => {
    const error = new AdminMutationCommittedError(new Error("repair required"));
    createRole.mockRejectedValue(error);
    const { user, dialog, onCommitted } = await setup();
    await user.click(dialog.getByRole("textbox", { name: "角色编码" }));
    await user.paste(" tender:admin ");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() => expect(onCommitted).toHaveBeenCalledWith(error, "tender:admin"));
    expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ roleCode: "tender:admin" }));
  });

  it.each(["   ", "a".repeat(58)])(
    "rejects an empty suffix or a full code beyond 64 characters: %s",
    async (suffix) => {
      const { user, dialog } = await setup();
      await user.type(dialog.getByRole("textbox", { name: "角色编码" }), suffix);
      await user.click(dialog.getByRole("button", { name: "确 定" }));
      await screen.findByText(suffix.trim() ? "角色编码含应用前缀不能超过 64 个字符" : "请输入角色编码");
      expect(createRole).not.toHaveBeenCalled();
    },
  );

  it("allows a 64-character complete code and rejects an application whose prefix leaves no room", async () => {
    const { user, dialog, selectClient } = await setup();
    const input = dialog.getByRole("textbox", { name: "角色编码" });
    await user.type(input, "a".repeat(57));
    await selectClient("长编码应用");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await screen.findByText("角色编码含应用前缀不能超过 64 个字符");
    expect(createRole).not.toHaveBeenCalled();
    await selectClient("采招系统");
    await user.click(dialog.getByRole("button", { name: "确 定" }));
    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ roleCode: `tender:${"a".repeat(57)}` })),
    );
  });

  it("clears the suffix and application when the modal is reopened", async () => {
    const { user, dialog } = await setup();
    await user.type(dialog.getByRole("textbox", { name: "角色编码" }), "admin");
    await user.click(dialog.getByRole("button", { name: "取 消" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "重新创建" }));
    const reopened = within(await screen.findByRole("dialog"));
    expect(reopened.getByRole("textbox", { name: "角色编码" })).toHaveValue("");
    await user.type(reopened.getByRole("textbox", { name: "角色编码" }), "admin");
    await user.type(reopened.getByRole("textbox", { name: "角色名称" }), "管理员");
    await user.click(reopened.getByRole("button", { name: "确 定" }));
    await screen.findByText("请选择所属应用");
    expect(createRole).not.toHaveBeenCalled();
  });
});
