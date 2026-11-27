/// <reference types="vitest/jsdom" />

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const nativeGetComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(window, "getComputedStyle", {
  writable: true,
  value: (element: Element) => nativeGetComputedStyle(element),
});

// Mute Ant Design cssinjs dynamic stylesheets in jsdom so getComputedStyle does not
// re-match thousands of visual-only CSS rules on every Testing Library query, while
// keeping Ant Design's class-based visibility rules intact.
const mutedStyleText = new WeakMap<HTMLStyleElement, string>();

function muteDynamicAntdStyle<T extends Node>(node: T): T {
  if (node instanceof HTMLStyleElement && node.hasAttribute("data-rc-order")) {
    mutedStyleText.set(node, node.textContent ?? "");
    node.textContent = "";
    Object.defineProperty(node, "innerHTML", {
      configurable: true,
      get: () => mutedStyleText.get(node) ?? "",
      set: (value: string) => {
        mutedStyleText.set(node, value);
      },
    });
  }
  return node;
}

const antdVisibilityStyle = document.createElement("style");
antdVisibilityStyle.textContent =
  [
    ".ant-drawer-content-wrapper-hidden",
    ".ant-tabs-tabpane-hidden",
    ".ant-tabs-dropdown-hidden",
    ".ant-select-dropdown-hidden",
    ".ant-dropdown-hidden",
    ".ant-dropdown-menu-hidden",
    ".ant-dropdown-menu-submenu-hidden",
    ".ant-menu-hidden",
    ".ant-menu-submenu-hidden",
    ".ant-popover-hidden",
    ".ant-tooltip-hidden",
    ".ant-picker-dropdown-hidden",
    ".ant-cascader-dropdown-hidden",
    ".ant-collapse-content-hidden",
    ".ant-modal-wrap-hidden",
    ".ant-tag-hidden",
    ".ant-spin-hidden",
  ].join(",") + "{display:none!important}";
document.head.appendChild(antdVisibilityStyle);

const nativeHeadAppendChild = document.head.appendChild.bind(document.head);
const nativeHeadInsertBefore = document.head.insertBefore.bind(document.head);
document.head.appendChild = ((node: Node) =>
  nativeHeadAppendChild(muteDynamicAntdStyle(node))) as typeof document.head.appendChild;
document.head.insertBefore = ((node: Node, child: Node | null) =>
  nativeHeadInsertBefore(muteDynamicAntdStyle(node), child)) as typeof document.head.insertBefore;

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: IntersectionObserverMock,
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: vi.fn(),
});

beforeEach(() => window.history.replaceState(null, "", "/portal/"));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
