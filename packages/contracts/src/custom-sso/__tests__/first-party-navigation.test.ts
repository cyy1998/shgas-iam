import { describe, expect, mock, test } from "bun:test";
import {
  restoreFirstPartySsoBrowserNavigation,
  splitFirstPartySsoNavigation,
} from "../first-party-navigation";

class TestPopStateEvent {
  constructor(
    readonly type: "popstate",
    readonly init: { readonly state: unknown },
  ) {}
}

describe("first-party Custom SSO navigation", () => {
  test("restores the same-path query and hash after a trusted callback", () => {
    const navigation = splitFirstPartySsoNavigation(
      "https://iam.example.com/portal/users?tab=enabled#details",
    );
    const callback = new URL(navigation.redirectUrl);
    callback.searchParams.set("token", "local-session");
    callback.searchParams.set("state", navigation.state!);
    const replaceState = mock(() => undefined);
    const dispatchEvent = mock(() => undefined);
    const historyState = { callback: true };

    expect(restoreFirstPartySsoBrowserNavigation(
      callback.toString(),
      { replaceState, state: historyState },
      { dispatchEvent },
      TestPopStateEvent,
    )).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(
      historyState,
      "",
      "/portal/users?tab=enabled#details",
    );
    expect(dispatchEvent).toHaveBeenCalledWith(new TestPopStateEvent(
      "popstate",
      { state: historyState },
    ));
  });

  test("does not mutate navigation for an untrusted state", () => {
    const replaceState = mock(() => undefined);
    const dispatchEvent = mock(() => undefined);

    expect(restoreFirstPartySsoBrowserNavigation(
      "https://iam.example.com/portal/users?token=local-session&state=https://evil.example/",
      { replaceState, state: null },
      { dispatchEvent },
      TestPopStateEvent,
    )).toBe(false);
    expect(replaceState).not.toHaveBeenCalled();
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
