export type ManualImage = {
  file: string;
  alt: string;
  width: number;
  height: number;
  marks: { x: number; y: number; label: string }[];
};

export const hrManualImages = {
  "users-list": {
    file: "users-list.png",
    width: 1184,
    height: 270,
    marks: [
      {
        x: 19.3,
        y: 15.6,
        label: "姓名或工号",
      },
      {
        x: 90.8,
        y: 47.4,
        label: "查看",
      },
    ],
    alt: "查找用户并打开详情",
  },
  "user-detail": {
    file: "user-detail.png",
    width: 840,
    height: 665,
    marks: [
      {
        x: 75.4,
        y: 2.1,
        label: "编辑",
      },
      {
        x: 97.6,
        y: 2.1,
        label: "重置密码",
      },
      {
        x: 95.6,
        y: 60.1,
        label: "新增雇佣",
      },
      {
        x: 87.9,
        y: 89.9,
        label: "离职",
      },
      {
        x: 84.9,
        y: 2.1,
        label: "状态",
      },
      {
        x: 66,
        y: 60.7,
        label: "显示已结束任职",
      },
    ],
    alt: "在用户详情维护资料和任职",
  },
  employments: {
    file: "employments.png",
    width: 1184,
    height: 325,
    marks: [
      {
        x: 68.2,
        y: 12.9,
        label: "雇佣状态",
      },
      {
        x: 87.1,
        y: 10.8,
        label: "新增雇佣",
      },
      {
        x: 91.7,
        y: 39.7,
        label: "查看",
      },
    ],
    alt: "查找任职与筛选历史",
  },
  "employment-create": {
    file: "employment-create.png",
    width: 800,
    height: 562,
    marks: [
      {
        x: 93.3,
        y: 30.1,
        label: "任职组织",
      },
      {
        x: 8.5,
        y: 59.3,
        label: "主岗",
      },
      {
        x: 97,
        y: 90,
        label: "确定",
      },
      {
        x: 93.3,
        y: 15.5,
        label: "用户",
      },
      {
        x: 93.3,
        y: 44.7,
        label: "岗位",
      },
    ],
    alt: "填写新增任职表单",
  },
  "employment-transfer": {
    file: "employment-transfer.png",
    width: 800,
    height: 670,
    marks: [
      {
        x: 4.9,
        y: 66.4,
        label: "新任职主岗",
      },
      {
        x: 97,
        y: 91.6,
        label: "确定",
      },
    ],
    alt: "确认转岗目标和新任职主岗",
  },
  "employment-primary": {
    file: "employment-primary.png",
    width: 416,
    height: 142,
    marks: [
      {
        x: 94.2,
        y: 60.6,
        label: "设为主岗",
      },
    ],
    alt: "确认设为主岗",
  },
  "user-resignation": {
    file: "user-resignation.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "确定离职",
      },
    ],
    alt: "核对离职对象和操作影响",
  },
  organizations: {
    file: "organizations.png",
    width: 1184,
    height: 510,
    marks: [
      {
        x: 18.7,
        y: 23.5,
        label: "组织树",
      },
      {
        x: 78.3,
        y: 8,
        label: "下级组织",
      },
      {
        x: 84.4,
        y: 8,
        label: "编辑",
      },
      {
        x: 90.5,
        y: 8,
        label: "状态不可变更",
      },
      {
        x: 96.5,
        y: 8,
        label: "不可删除",
      },
      {
        x: 44,
        y: 19.8,
        label: "责任任命",
      },
      {
        x: 48.2,
        y: 42,
        label: "组织路径",
      },
    ],
    alt: "定位组织与维护入口",
  },
  "organization-edit": {
    file: "organization-edit.png",
    width: 800,
    height: 436,
    marks: [
      {
        x: 93.5,
        y: 38.8,
        label: "组织名称",
      },
      {
        x: 97,
        y: 87.2,
        label: "确定",
      },
    ],
    alt: "编辑组织名称和类型",
  },
  "responsibility-create": {
    file: "responsibility-create.png",
    width: 800,
    height: 354,
    marks: [
      {
        x: 93.3,
        y: 24.6,
        label: "目标组织",
      },
      {
        x: 93.3,
        y: 47.7,
        label: "责任类型",
      },
      {
        x: 93.3,
        y: 70.9,
        label: "任职",
      },
      {
        x: 97,
        y: 84.2,
        label: "确定",
      },
    ],
    alt: "选择责任目标、类型与任职",
  },
  "responsibility-result": {
    file: "responsibility-result.png",
    width: 1136,
    height: 222,
    marks: [
      {
        x: 88.6,
        y: 5,
        label: "新建责任任命",
      },
      {
        x: 96.7,
        y: 46.8,
        label: "详情",
      },
    ],
    alt: "查询已创建的责任任命",
  },
  "user-edit": {
    file: "user-edit.png",
    width: 800,
    height: 368,
    marks: [
      {
        x: 45,
        y: 24.6,
        label: "基本资料",
      },
      {
        x: 88.4,
        y: 59.6,
        label: "保存",
      },
    ],
    alt: "编辑用户基本资料并保存",
  },
  "password-reset-confirm": {
    file: "password-reset-confirm.png",
    width: 416,
    height: 142,
    marks: [
      {
        x: 94.2,
        y: 60.6,
        label: "重置",
      },
    ],
    alt: "确认重置所选用户的密码",
  },
  "password-reset-result": {
    file: "password-reset-result.png",
    width: 480,
    height: 292,
    marks: [
      {
        x: 92.3,
        y: 46.2,
        label: "复制密码",
      },
      {
        x: 95,
        y: 80.8,
        label: "我已复制",
      },
    ],
    alt: "复制新密码并确认交接（密码区域已遮挡）",
  },
  "user-status": {
    file: "user-status.png",
    width: 840,
    height: 235,
    marks: [
      {
        x: 84.9,
        y: 6,
        label: "状态菜单",
      },
      {
        x: 89.4,
        y: 24.7,
        label: "目标状态",
      },
    ],
    alt: "选择用户账号状态",
  },
  "user-employment-history": {
    file: "user-employment-history.png",
    width: 800,
    height: 236,
    marks: [
      {
        x: 66.8,
        y: 8.4,
        label: "显示已结束任职",
      },
      {
        x: 46.2,
        y: 79.4,
        label: "结束时间",
      },
    ],
    alt: "查看用户已结束的任职",
  },
  "user-resignation-result": {
    file: "user-resignation-result.png",
    width: 840,
    height: 780,
    marks: [
      {
        x: 22.2,
        y: 2.8,
        label: "账号停用",
      },
      {
        x: 46.4,
        y: 64.9,
        label: "任职已结束",
      },
    ],
    alt: "确认离职后的账号状态和任职历史",
  },
  "organization-blocked": {
    file: "organization-blocked.png",
    width: 1440,
    height: 280,
    marks: [
      {
        x: 92.2,
        y: 37.5,
        label: "不可操作的按钮",
      },
      {
        x: 97.2,
        y: 24,
        label: "受限原因",
      },
    ],
    alt: "查看组织操作被阻止的原因",
  },
  "organization-create": {
    file: "organization-create.png",
    width: 800,
    height: 518,
    marks: [
      {
        x: 93.5,
        y: 16.8,
        label: "组织编码与名称",
      },
      {
        x: 93.5,
        y: 64.3,
        label: "上级组织",
      },
      {
        x: 97,
        y: 89.2,
        label: "确定",
      },
    ],
    alt: "填写新建下级组织表单",
  },
  "organization-status": {
    file: "organization-status.png",
    width: 1136,
    height: 240,
    marks: [
      {
        x: 92.2,
        y: 7.1,
        label: "状态菜单",
      },
      {
        x: 96.4,
        y: 25.4,
        label: "目标状态",
      },
    ],
    alt: "选择组织目标状态",
  },
  "organization-status-confirm": {
    file: "organization-status-confirm.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "确认变更",
      },
    ],
    alt: "确认组织状态变更",
  },
  "organization-delete": {
    file: "organization-delete.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "确认删除",
      },
    ],
    alt: "确认删除组织",
  },
  "employment-create-result": {
    file: "employment-create-result.png",
    width: 1136,
    height: 251,
    marks: [
      {
        x: 18.1,
        y: 54.6,
        label: "用户",
      },
      {
        x: 93.5,
        y: 58.2,
        label: "查看",
      },
    ],
    alt: "核对新增任职的用户和状态",
  },
  "employment-detail": {
    file: "employment-detail.png",
    width: 840,
    height: 540,
    marks: [
      {
        x: 70.1,
        y: 2.6,
        label: "转岗",
      },
      {
        x: 95.6,
        y: 29.6,
        label: "编辑备注",
      },
      {
        x: 88,
        y: 2.6,
        label: "暂停",
      },
      {
        x: 97.6,
        y: 2.6,
        label: "结束",
      },
      {
        x: 78.8,
        y: 2.6,
        label: "设主岗",
      },
    ],
    alt: "核对任职详情及可用操作",
  },
  "employment-note": {
    file: "employment-note.png",
    width: 800,
    height: 446,
    marks: [
      {
        x: 97.8,
        y: 46.3,
        label: "备注",
      },
      {
        x: 88.9,
        y: 67.6,
        label: "保存",
      },
    ],
    alt: "编辑并保存任职备注",
  },
  "employment-primary-clear": {
    file: "employment-primary-clear.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "取消主岗",
      },
    ],
    alt: "确认取消主岗",
  },
  "employment-pause": {
    file: "employment-pause.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "暂停任职",
      },
    ],
    alt: "确认暂停任职",
  },
  "employment-resume": {
    file: "employment-resume.png",
    width: 840,
    height: 505,
    marks: [
      {
        x: 27.8,
        y: 4.4,
        label: "暂停状态",
      },
      {
        x: 88,
        y: 2.8,
        label: "恢复",
      },
    ],
    alt: "恢复暂停中的任职",
  },
  "employment-end": {
    file: "employment-end.png",
    width: 416,
    height: 164,
    marks: [
      {
        x: 94.2,
        y: 65.9,
        label: "结束任职",
      },
    ],
    alt: "确认结束任职",
  },
  "employment-transfer-result": {
    file: "employment-transfer-result.png",
    width: 840,
    height: 505,
    marks: [
      {
        x: 22.3,
        y: 4.4,
        label: "主岗标记",
      },
      {
        x: 48.1,
        y: 52.1,
        label: "新组织与岗位",
      },
    ],
    alt: "核对转岗后的新组织、岗位和主岗",
  },
  "employment-history": {
    file: "employment-history.png",
    width: 1136,
    height: 251,
    marks: [
      {
        x: 67.2,
        y: 7.2,
        label: "结束状态",
      },
      {
        x: 90.2,
        y: 42.2,
        label: "结束时间",
      },
      {
        x: 93.5,
        y: 41.8,
        label: "查看",
      },
    ],
    alt: "筛选并核对已结束任职",
  },
  "responsibility-detail": {
    file: "responsibility-detail.png",
    width: 840,
    height: 665,
    marks: [
      {
        x: 48.1,
        y: 29.4,
        label: "责任类型与目标组织",
      },
      {
        x: 82.9,
        y: 2.1,
        label: "暂停任命",
      },
      {
        x: 97.6,
        y: 2.1,
        label: "结束任命",
      },
    ],
    alt: "核对责任任命详情及操作",
  },
  "responsibility-resume": {
    file: "responsibility-resume.png",
    width: 840,
    height: 665,
    marks: [
      {
        x: 22.7,
        y: 3.3,
        label: "暂停状态",
      },
      {
        x: 82.9,
        y: 2.1,
        label: "恢复任命",
      },
    ],
    alt: "恢复暂停中的责任任命",
  },
  "responsibility-end": {
    file: "responsibility-end.png",
    width: 1440,
    height: 350,
    marks: [
      {
        x: 62.8,
        y: 59.4,
        label: "确认结束",
      },
    ],
    alt: "确认结束责任任命",
  },
  "responsibility-history": {
    file: "responsibility-history.png",
    width: 1136,
    height: 222,
    marks: [
      {
        x: 64.7,
        y: 8.1,
        label: "已结束",
      },
      {
        x: 96.7,
        y: 46.8,
        label: "详情",
      },
    ],
    alt: "查询已结束的责任任命",
  },
  positions: {
    file: "positions.png",
    width: 1136,
    height: 207,
    marks: [
      {
        x: 30.5,
        y: 46.4,
        label: "岗位名称与编码",
      },
      {
        x: 76.5,
        y: 27.5,
        label: "状态",
      },
    ],
    alt: "查询职位目录和岗位状态",
  },
  "responsibility-types": {
    file: "responsibility-types.png",
    width: 1136,
    height: 223,
    marks: [
      {
        x: 33.3,
        y: 48.4,
        label: "责任类型",
      },
      {
        x: 85.7,
        y: 30.9,
        label: "任命基数",
      },
    ],
    alt: "查阅责任类型和任命基数",
  },
  "supervisor-create": {
    file: "supervisor-create.png",
    width: 800,
    height: 354,
    marks: [
      {
        x: 93.3,
        y: 24.6,
        label: "目标组织",
      },
      {
        x: 93.3,
        y: 47.7,
        label: "责任类型",
      },
      {
        x: 93.3,
        y: 70.9,
        label: "任职",
      },
      {
        x: 97,
        y: 84.2,
        label: "确定",
      },
    ],
    alt: "新建分管领导任命",
  },
  "supervisor-result": {
    file: "supervisor-result.png",
    width: 1136,
    height: 222,
    marks: [
      {
        x: 88.6,
        y: 5,
        label: "新建责任任命",
      },
      {
        x: 96.7,
        y: 46.8,
        label: "详情",
      },
    ],
    alt: "核对分管领导任命",
  },
  "supervisor-detail": {
    file: "supervisor-detail.png",
    width: 840,
    height: 665,
    marks: [
      {
        x: 48.1,
        y: 29.4,
        label: "责任类型与目标组织",
      },
      {
        x: 82.9,
        y: 2.1,
        label: "暂停任命",
      },
      {
        x: 97.6,
        y: 2.1,
        label: "结束任命",
      },
    ],
    alt: "查看分管领导任命详情",
  },
  "supervisor-resume": {
    file: "supervisor-resume.png",
    width: 840,
    height: 665,
    marks: [
      {
        x: 24.3,
        y: 3.3,
        label: "暂停状态",
      },
      {
        x: 82.9,
        y: 2.1,
        label: "恢复任命",
      },
    ],
    alt: "恢复暂停的分管领导任命",
  },
  "supervisor-end": {
    file: "supervisor-end.png",
    width: 1440,
    height: 350,
    marks: [
      {
        x: 62.8,
        y: 59.4,
        label: "确认结束",
      },
    ],
    alt: "结束分管领导任命",
  },
  "supervisor-history": {
    file: "supervisor-history.png",
    width: 1136,
    height: 222,
    marks: [
      {
        x: 64.7,
        y: 8.1,
        label: "已结束",
      },
      {
        x: 96.7,
        y: 46.8,
        label: "详情",
      },
    ],
    alt: "查询分管领导任命历史",
  },
} satisfies Record<string, ManualImage>;

export type ManualImageId = keyof typeof hrManualImages;
