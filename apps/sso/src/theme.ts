import type { ThemeConfig } from 'antd';

const formControlTokens = {
  colorText: '#102033',
  colorBgContainer: '#fbfdff',
  colorBorder: '#d9e3ee',
  borderRadius: 8,
  hoverBorderColor: '#a8c8f5',
  activeBorderColor: '#2874f0',
};

export const ssoTheme = {
  components: {
    Input: {
      ...formControlTokens,
      activeBg: '#fff',
      hoverBg: '#fbfdff',
      activeShadow: '0 0 0 3px rgba(40, 116, 240, 0.14)',
    },
    Select: {
      ...formControlTokens,
      selectorBg: '#fbfdff',
      activeOutlineColor: 'rgba(40, 116, 240, 0.14)',
      controlOutlineWidth: 3,
    },
  },
} satisfies ThemeConfig;
