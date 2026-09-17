import type { ThemeConfig } from 'antd';

const formControlTokens = {
  colorText: '#102033',
  colorBgContainer: '#fbfdff',
  colorBorder: '#d9e3ee',
  borderRadius: 8,
  hoverBorderColor: '#a8c8f5',
  activeBorderColor: '#2874f0',
};

const inputTokens = {
  ...formControlTokens,
  activeBg: '#fff',
  hoverBg: '#fbfdff',
  activeShadow: '0 0 0 3px rgba(40, 116, 240, 0.14)',
};

export const adminTheme = {
  token: {
    colorPrimary: '#1554ad',
    colorInfo: '#2874f0',
    colorSuccess: '#1a7f64',
    colorWarning: '#b56a0d',
    colorError: '#b42318',
    colorTextBase: '#102033',
    colorBgLayout: '#eef3f7',
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
      headerBg: '#f6f9fc',
      headerColor: '#596879',
      rowHoverBg: '#f7fbff',
    },
    Input: inputTokens,
    InputNumber: inputTokens,
    DatePicker: inputTokens,
    Mentions: inputTokens,
    Select: {
      ...formControlTokens,
      selectorBg: '#fbfdff',
      activeOutlineColor: 'rgba(40, 116, 240, 0.14)',
      controlOutlineWidth: 3,
    },
  },
} satisfies ThemeConfig;
