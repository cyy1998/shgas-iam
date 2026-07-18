import type { ThemeConfig } from 'antd';

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
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
  },
} satisfies ThemeConfig;
