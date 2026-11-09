export type ManualImage = {
  file: string;
  alt: string;
  width: number;
  height: number;
  marks: { x: number; y: number; label: string }[];
};

export const hrManualImages: Record<string, ManualImage[]> = {
  users: [
    {
      file: "users-list.png",
      alt: "查找用户并打开详情",
      width: 1184,
      height: 270,
      marks: [
        { x: 19.3, y: 15.6, label: "按姓名或工号搜索" },
        { x: 90.8, y: 47.4, label: "查看用户" },
      ],
    },
    {
      file: "user-detail.png",
      alt: "在用户详情维护资料和任职",
      width: 840,
      height: 665,
      marks: [
        { x: 75.4, y: 2.1, label: "编辑资料" },
        { x: 97.6, y: 2.1, label: "重置密码" },
        { x: 95.6, y: 60.1, label: "新增雇佣" },
      ],
    },
  ],
  employments: [
    {
      file: "employments.png",
      alt: "查找任职与筛选历史",
      width: 1184,
      height: 325,
      marks: [
        { x: 68.2, y: 12.9, label: "按任职状态筛选" },
        { x: 87.1, y: 10.8, label: "新增雇佣" },
        { x: 91.7, y: 39.7, label: "查看详情" },
      ],
    },
    {
      file: "employment-create.png",
      alt: "填写新增任职表单",
      width: 800,
      height: 562,
      marks: [
        { x: 93.3, y: 30.1, label: "选择任职组织" },
        { x: 8.5, y: 59.3, label: "选择是否设为主岗" },
        { x: 97, y: 90, label: "核对后提交" },
      ],
    },
  ],
  transfer: [
    {
      file: "employment-transfer.png",
      alt: "确认转岗目标和新任职主岗",
      width: 800,
      height: 670,
      marks: [
        { x: 4.9, y: 66.4, label: "明确选择新任职是否为主岗" },
        { x: 97, y: 91.6, label: "核对原任职与新任职后提交" },
      ],
    },
  ],
  "primary-employment": [
    {
      file: "employment-primary.png",
      alt: "确认设为主岗",
      width: 416,
      height: 142,
      marks: [{ x: 94.2, y: 60.6, label: "确认替换原主岗标记" }],
    },
  ],
  resignation: [
    {
      file: "user-resignation.png",
      alt: "核对离职对象和操作影响",
      width: 416,
      height: 164,
      marks: [{ x: 94.2, y: 65.9, label: "确认办理离职" }],
    },
  ],
  organizations: [
    {
      file: "organizations.png",
      alt: "定位组织与维护入口",
      width: 1184,
      height: 510,
      marks: [
        { x: 18.7, y: 23.5, label: "选中目标组织" },
        { x: 78.3, y: 8, label: "新增下级组织" },
        { x: 84.4, y: 8, label: "编辑当前组织" },
      ],
    },
    {
      file: "organization-edit.png",
      alt: "编辑组织名称和类型",
      width: 800,
      height: 436,
      marks: [
        { x: 93.5, y: 38.8, label: "修改组织名称" },
        { x: 97, y: 87.2, label: "核对后保存" },
      ],
    },
  ],
  responsibilities: [
    {
      file: "responsibility-create.png",
      alt: "选择责任目标、类型与任职",
      width: 800,
      height: 354,
      marks: [
        { x: 93.3, y: 24.6, label: "目标组织" },
        { x: 93.3, y: 47.7, label: "责任类型" },
        { x: 93.3, y: 70.9, label: "承担责任的任职" },
        { x: 97, y: 84.2, label: "核对后提交" },
      ],
    },
    {
      file: "responsibility-result.png",
      alt: "查询已创建的责任任命",
      width: 1184,
      height: 330,
      marks: [
        { x: 87.1, y: 10.6, label: "新建责任任命" },
        { x: 94.8, y: 38.8, label: "查看任命详情" },
      ],
    },
  ],
};
