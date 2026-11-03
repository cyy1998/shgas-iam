import ResignByUserModal from "@admin/pages/employments/components/ResignByUserModal";
import { AdminMutationCommittedError } from "@admin/services/admin-mutation";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "~admin/test/render";

const mocks = vi.hoisted(() => ({ resignUser: vi.fn(), searchUsers: vi.fn() }));
vi.mock("@admin/services/employment", () => ({ resignUser: mocks.resignUser }));
vi.mock("@admin/services/user", () => ({ searchUsers: mocks.searchUsers }));

function deferredSearch() {
  let resolve!: (value: { result: { username: string; name: string }[]; total: number }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ result: { username: string; name: string }[]; total: number }>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

async function submit() {
  mocks.searchUsers.mockResolvedValue({
    result: [{ username: "zhangsan", name: "张三" }],
    total: 1,
  });
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const onCommitted = vi.fn();
  const { user } = render(<ResignByUserModal open onClose={onClose} onSuccess={onSuccess} onCommitted={onCommitted} />);
  await user.type(screen.getByRole("combobox"), "zhangsan");
  await user.click(await screen.findByTitle("张三 (zhangsan)"));
  await user.click(screen.getByRole("button", { name: "确认离职" }));
  return { onClose, onSuccess, onCommitted };
}

describe("ResignByUserModal", () => {
  it("ignores search responses superseded by a later keyword or a cleared search", async () => {
    const first = deferredSearch();
    const second = deferredSearch();
    const cleared = deferredSearch();
    mocks.searchUsers.mockImplementation(({ conditions }: { conditions: { fuzzyConditions: { text: string } } }) => {
      const text = conditions.fuzzyConditions.text;
      return text === "old"
        ? first.promise
        : text === "new"
          ? second.promise
          : text === "cleared"
            ? cleared.promise
            : Promise.resolve({ result: [], total: 0 });
    });
    const { user } = render(<ResignByUserModal open onClose={vi.fn()} onCommitted={vi.fn()} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "old");
    await user.clear(input);
    await user.type(input, "new");
    await act(async () => second.resolve({ result: [{ username: "new", name: "新用户" }], total: 1 }));
    expect(await screen.findByTitle("新用户 (new)")).toBeInTheDocument();
    await act(async () => first.resolve({ result: [{ username: "old", name: "旧用户" }], total: 1 }));
    expect(screen.queryByTitle("旧用户 (old)")).not.toBeInTheDocument();
    expect(screen.getByTitle("新用户 (new)")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "cleared");
    await user.clear(input);
    await act(async () => cleared.resolve({ result: [{ username: "cleared", name: "已清空用户" }], total: 1 }));
    expect(screen.queryByTitle("已清空用户 (cleared)")).not.toBeInTheDocument();
    expect(mocks.resignUser).not.toHaveBeenCalled();
  });

  it("discards searches when the dialog closes and starts a new session without stale options or errors", async () => {
    const previous = deferredSearch();
    mocks.searchUsers.mockReturnValue(previous.promise);
    const onClose = vi.fn();
    const onCommitted = vi.fn();
    const { user, rerender } = render(<ResignByUserModal open onClose={onClose} onCommitted={onCommitted} />);
    await user.type(screen.getByRole("combobox"), "old");
    rerender(<ResignByUserModal open={false} onClose={onClose} onCommitted={onCommitted} />);
    await act(async () => previous.reject(new Error("过期搜索错误")));
    rerender(<ResignByUserModal open onClose={onClose} onCommitted={onCommitted} />);
    expect(screen.queryAllByText("过期搜索错误")).toHaveLength(0);
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "确认离职" })).toBeDisabled();
    expect(mocks.resignUser).not.toHaveBeenCalled();
  });
  it.each([true, false])("reports changed=%s", async (changed) => {
    mocks.resignUser.mockResolvedValue({ changed, result: null });
    const { onClose, onSuccess, onCommitted } = await submit();
    expect(await screen.findByText(changed ? "离职已完成" : "已处于离职状态，无需修改")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onCommitted).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledExactlyOnceWith("zhangsan");
  });

  it("hands committed failure to the owner for refresh and persistent warning", async () => {
    const error = new AdminMutationCommittedError(null);
    mocks.resignUser.mockRejectedValue(error);
    const { onClose, onSuccess, onCommitted } = await submit();
    await waitFor(() => expect(onCommitted).toHaveBeenCalledExactlyOnceWith(error));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary rejection available for correction", async () => {
    mocks.resignUser.mockRejectedValue(new Error("离职资格已变化"));
    const { onClose, onSuccess, onCommitted } = await submit();
    expect(await screen.findByText("离职资格已变化")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(mocks.resignUser).toHaveBeenCalledTimes(1);
  });
});
