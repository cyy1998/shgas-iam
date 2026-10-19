import { StyleProvider } from "@ant-design/cssinjs";
import { restoreLoginRedirectState } from "@sso/utils/url";
import { createElement, type ReactNode } from "react";

if (typeof window !== "undefined") {
  restoreLoginRedirectState();
}

export function rootContainer(container: ReactNode) {
  return createElement(StyleProvider, { hashPriority: "high" }, container);
}
