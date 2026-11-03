import type { ThemeConfig } from "antd";

const formControlTokens = {
  colorText: "#182535",
  colorBgContainer: "#fff",
  colorBorder: "#d9dde2",
  borderRadius: 8,
  hoverBorderColor: "#657282",
  activeBorderColor: "#182535",
};

const inputTokens = {
  ...formControlTokens,
  activeBg: "#fff",
  hoverBg: "#fff",
  activeShadow: "0 0 0 3px rgba(24, 37, 53, 0.12)",
};

export const adminTheme = {
  token: {
    colorPrimary: "#182535",
    colorLink: "#182535",
    colorLinkHover: "#304154",
    colorLinkActive: "#101820",
    colorInfo: "#596879",
    colorSuccess: "#1a7f64",
    colorWarning: "#b56a0d",
    colorError: "#b42318",
    colorTextBase: "#182535",
    colorTextSecondary: "#596879",
    colorTextPlaceholder: "#657282",
    colorBgLayout: "#f4f6f8",
    borderRadius: 8,
    wireframe: false,
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 36,
    },
    Card: {
      borderRadiusLG: 8,
    },
    Table: {
      headerBg: "#fff",
      cellPaddingBlockSM: 8,
      cellFontSizeSM: 14,
      headerColor: "#596879",
      rowHoverBg: "#f7f8fa",
    },
    Input: inputTokens,
    InputNumber: inputTokens,
    DatePicker: inputTokens,
    Mentions: inputTokens,
    Select: {
      ...formControlTokens,
      selectorBg: "#fff",
      activeOutlineColor: "rgba(24, 37, 53, 0.12)",
      controlOutlineWidth: 3,
    },
  },
} satisfies ThemeConfig;
