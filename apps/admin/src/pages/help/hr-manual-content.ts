import type { ManualImageId } from "./hr-manual-images";

export type ManualStep = string | { text: string; image: ManualImageId; highlights?: number[] };

export type ManualSection = {
  id: string;
  title: string;
  intro?: string;
  tasks: {
    id?: string;
    title: string;
    prerequisites?: string[];
    steps: ManualStep[];
    result?: string;
    notes?: string[];
  }[];
  links?: { label: string; to: string }[];
};

export const hrManualSections: ManualSection[] = [
  {
    id: "users",
    title: "用户信息维护",
    intro: "HR 可维护现有账号。新建、删除用户和调整角色，请联系具备相应权限的管理员。",
    links: [
      {
        label: "打开用户管理",
        to: "/users",
      },
    ],
    tasks: [
      {
        title: "按姓名或工号查找用户",
        steps: [
          "在「用户管理」的「搜索姓名或工号」输入关键词，按回车或点击搜索。需要缩小结果时，使用「全部类型」和「全部状态」筛选。",
          {
            text: "核对工号后，点击该行「查看」。在「用户信息」中查看基本信息和「雇佣信息」。",
            image: "users-list",
          },
          {
            text: "查看任职历史时，勾选「显示已结束任职」。重新查询前可使用「清除筛选」。",
            image: "user-employment-history",
          },
        ],
        notes: ["用户详情中的范围外任职仅供查看，不能修改。"],
      },
      {
        title: "更新用户资料",
        prerequisites: ["用户至少有一条在你管理范围内的未结束任职。暂停中的任职也算，已结束的任职不算。"],
        steps: [
          {
            text: "在用户详情顶部点击「编辑」。",
            image: "user-detail",
            highlights: [1],
          },
          {
            text: "修改「姓名」「用户类型」「手机号」或「微信 ID」，核对后点击「保存」。",
            image: "user-edit",
          },
        ],
      },
      {
        title: "修改账号状态",
        prerequisites: ["用户有未结束任职，且所有未结束任职都在你当前的管理范围内。"],
        steps: [
          "在用户详情核对所有未结束任职，包括暂停中的任职。",
          {
            text: "打开顶部「状态」菜单，选择所需状态。选项为「正常」「暂停」「停用」中的其他状态，选择后即提交。",
            image: "user-status",
          },
        ],
        notes: [
          "停用账号不会自动结束任职。",
          "账号停用且仅有历史任职时，请完整管理员恢复账号后再新增任职。",
          "修改自己的账号或任职可能影响后续登录和管理权限。",
        ],
      },
    ],
  },
  {
    id: "reset-password",
    title: "重置密码",
    links: [
      {
        label: "打开用户管理",
        to: "/users",
      },
    ],
    tasks: [
      {
        title: "查找用户并重置密码",
        prerequisites: ["用户状态为「正常」，且至少有一条在你管理范围内的未结束任职。"],
        steps: [
          {
            text: "在「用户管理」按姓名或工号搜索，核对用户后点击「查看」。",
            image: "users-list",
          },
          {
            text: "在用户详情顶部点击「重置密码」。",
            image: "user-detail",
            highlights: [2],
          },
          {
            text: "在重置确认弹窗中核对目标用户和影响，点击「重置」。",
            image: "password-reset-confirm",
          },
          {
            text: "在「新密码已生成」弹窗点击「复制密码」，按组织规定安全交接给该用户。",
            image: "password-reset-result",
          },
          "关闭前查看弹窗中的会话处理结果，若有失败或结果未知的项目，按提示刷新确认，必要时联系管理员。确认已复制密码并读完结果后，再点击「我已复制」。",
        ],
        notes: [
          "新密码只显示一次，关闭弹窗前请复制。",
          "重置密码会尝试撤销已有会话；重置自己的密码时保留当前登录。",
          "有范围外任职不影响重置；暂停或停用账号不能重置。",
          "如提示密码已重置但未能交付，联系管理员修复后再重置。",
        ],
      },
    ],
  },
  {
    id: "employments",
    title: "设置任职",
    intro: "「任职」指人员在某个组织担任某个岗位的一段记录，在「雇佣关系」页面维护。",
    links: [
      {
        label: "打开雇佣关系",
        to: "/employments",
      },
      {
        label: "打开职位管理",
        to: "/positions",
      },
    ],
    tasks: [
      {
        title: "新增任职",
        prerequisites: ["用户已在系统中建档，账号未停用。目标组织在你的管理范围内，目标组织和岗位均为正常状态。"],
        steps: [
          "在「雇佣关系」点击「新增雇佣」，按工号或姓名查找用户。也可在用户详情的「雇佣信息」点击「+ 新增雇佣」，直接沿用该用户。",
          {
            text: "选择「任职组织」和「岗位」，按实际情况选择是否「设为主岗」，需要时填写备注。",
            image: "employment-create",
          },
          "核对用户、组织路径和岗位，点击「确定」。",
          {
            text: "提交成功后，在列表中找到新建的任职，核对用户、组织、岗位和「正常」状态。",
            image: "employment-create-result",
          },
        ],
        notes: ["同一用户在同一组织、同一岗位下只能有一条未结束任职。需要从旧组织或旧岗位调往新岗位时，使用「转岗」。"],
      },
      {
        title: "设置与取消主岗",
        prerequisites: ["目标任职未结束且位于你的管理范围内。调整前先核对该用户已有的主岗。"],
        steps: [
          {
            text: "在「雇佣关系」打开目标任职详情。要设为主岗，点击「设主岗」，再点击弹窗中的「设为主岗」。",
            image: "employment-primary",
          },
          {
            text: "要取消主岗，打开已标记为主岗的任职，点击「取消主岗」并在弹窗中确认。",
            image: "employment-primary-clear",
          },
          "重新查看该用户的任职，核对「主岗」标记。",
        ],
        notes: [
          "每位用户最多有一个未结束的主岗，也可以没有主岗。",
          "设为主岗会清除该用户其他任职的主岗标记，包括范围外任职；只能直接操作范围内任职。",
          "取消后，系统不会自动选择新的主岗。",
        ],
        id: "primary-employment",
      },
      {
        title: "修改任职备注",
        prerequisites: ["目标任职尚未结束，且在你的管理范围内。"],
        steps: [
          {
            text: "在「雇佣关系」查到任职，点击「查看」，在「任职信息」中点击「编辑备注」。",
            image: "employment-detail",
            highlights: [2],
          },
          {
            text: "修改备注后点击「保存」。",
            image: "employment-note",
          },
        ],
      },
      {
        title: "暂停或恢复任职",
        steps: [
          {
            text: "在「雇佣关系」打开任职详情，需要暂停时点击「暂停」。",
            image: "employment-detail",
            highlights: [3],
          },
          {
            text: "在确认弹窗中阅读对责任任命的影响，再点击「暂停任职」。",
            image: "employment-pause",
          },
          {
            text: "需要恢复时，打开暂停中的任职详情，核对记录后点击「恢复」。",
            image: "employment-resume",
          },
          "恢复任职后，进入「组织责任」核对仍暂停的责任任命，按实际需要逐条恢复。",
        ],
        notes: ["暂停任职会同时暂停其启用中的责任任命；恢复任职不会自动恢复这些任命。"],
      },
      {
        title: "为返聘人员建立新任职",
        prerequisites: ["请具备完整管理权限的管理员先恢复已停用的原账号。"],
        steps: [
          "在「用户管理」查到原账号，确认已恢复为「正常」或「暂停」。",
          {
            text: "选择返聘人员的原账号，填写新的组织、岗位和主岗设置。需要组织责任时，另行新建任命。",
            image: "employment-create",
          },
        ],
        result: "返聘需建立新任职，原任职和责任任命保留为历史。",
      },
      {
        title: "查找可用岗位",
        steps: [
          {
            text: "打开「职位管理」，按岗位编码或名称搜索。核对「岗位编码」「岗位名称」「描述」和「状态」。",
            image: "positions",
          },
        ],
        result: "任职和转岗从全局职位目录选择「正常」岗位。",
        id: "catalogs",
      },
    ],
  },
  {
    id: "end-employment",
    title: "结束任职",
    intro: "结束指定任职，保留账号和其他任职。人员整体离职请使用「离职」。",
    links: [
      {
        label: "打开雇佣关系",
        to: "/employments",
      },
    ],
    tasks: [
      {
        title: "查找要结束的任职",
        steps: [
          "打开「雇佣关系」，输入工号或姓名并搜索。可按组织范围、主岗和雇佣状态缩小结果。",
          {
            text: "在列表中核对用户和岗位，点击目标记录的「查看」。",
            image: "employments",
            highlights: [3],
          },
          {
            text: "在任职详情中核对组织路径、岗位、主岗、开始时间和结束时间。",
            image: "employment-detail",
            highlights: [],
          },
        ],
      },
      {
        title: "结束一条任职",
        prerequisites: ["目标任职尚未结束。"],
        steps: [
          {
            text: "点击「结束」，阅读影响后点击「结束任职」确认。",
            image: "employment-end",
          },
          {
            text: "回到列表，按雇佣状态「结束」筛选，核对该记录的结束时间。",
            image: "employment-history",
            highlights: [1, 2],
          },
        ],
        notes: ["结束任职会同时结束其未结束责任任命，无法恢复。账号和其他任职不受影响。如需重新任职，新增一条记录。"],
      },
      {
        title: "提交超时、提示无需修改或后续处理失败",
        steps: [
          "「无需修改」表示目标已经是所需状态，核对记录即可。提示明确拒绝时，按错误信息检查范围、输入或状态。",
          {
            text: "提交后断网、超时或结果未知时，先刷新列表或重新打开详情，核对实际状态、新旧记录及结束时间，避免重复提交。",
            image: "employment-history",
            highlights: [1, 2],
          },
          "若提示「操作已生效，但后续处理失败」，先确认业务记录，再按提示联系管理员处理会话、密码交付等后续问题。",
        ],
        result: "联系管理员时提供操作时间、对象和错误提示，不要附带密码。",
      },
    ],
  },
  {
    id: "transfer",
    title: "转岗",
    intro: "转岗会结束原任职，同时建立新任职。",
    links: [
      {
        label: "打开雇佣关系",
        to: "/employments",
      },
    ],
    tasks: [
      {
        title: "把原任职调整到新组织或岗位",
        prerequisites: [
          "原任职未结束且用户账号未停用。原组织和目标组织都在你当前的管理范围内，可以分属你同时管理的不同一级组织。",
          "目标组织和岗位均为正常状态。提前确认新任职是否是主岗，以及需要重新任命的责任。",
        ],
        steps: [
          {
            text: "在「雇佣关系」查找原任职，点击「查看」后选择「转岗」。也可从用户详情的「雇佣信息」找到该条记录并点击「转岗」。",
            image: "employment-detail",
            highlights: [1],
          },
          "核对弹窗中的原组织路径、原岗位和原主岗，选择「新任职组织」与「新岗位」。",
          {
            text: "在「新任职主任职」中明确选择「主任职」或「非主任职」。按需填写「备注」，点击「确定」。",
            image: "employment-transfer",
          },
          {
            text: "查看新任职详情，核对新的组织、岗位、主岗和「正常」状态。",
            image: "employment-transfer-result",
          },
          {
            text: "再用「结束」状态筛选原任职，核对原任职的结束时间。若新任职需要承担组织责任，另行新建任命。",
            image: "employment-history",
            highlights: [1, 2],
          },
        ],
        notes: [
          "转岗会结束原任职及其未结束责任任命，新任职需重新任命责任。",
          "新任职需明确选择是否为主岗。选择「主任职」会清除该用户其他任职的主岗标记。",
        ],
      },
    ],
  },
  {
    id: "resignation",
    title: "离职",
    intro: "离职会停用账号，结束全部未结束任职及相关责任任命，并尝试撤销已有会话。",
    links: [
      {
        label: "打开用户管理",
        to: "/users",
      },
    ],
    tasks: [
      {
        title: "为用户办理离职",
        prerequisites: [
          "首次办理时，用户至少有一条未结束任职，且全部未结束任职（含暂停任职）都在你的管理范围内。存在范围外未结束任职时，请联系具备完整管理权限的管理员处理。",
        ],
        steps: [
          {
            text: "在「用户管理」查找用户并点击「查看」，核对账号和全部未结束任职。",
            image: "users-list",
          },
          {
            text: "在「用户信息」底部的「危险操作」点击「离职」。",
            image: "user-detail",
            highlights: [4],
          },
          {
            text: "阅读「办理用户……离职？」弹窗，核对对象和影响后确认。",
            image: "user-resignation",
          },
          {
            text: "重新查看用户，核对状态是否为「停用」。在「雇佣信息」勾选「显示已结束任职」，核对结束时间。",
            image: "user-resignation-result",
          },
        ],
        notes: [
          "只结束一条任职，请在任职详情点「结束」；只停用账号，请在用户详情改「状态」。",
          "会话撤销失败不影响已完成的离职。核对结果后联系管理员；账号已停用、无未结束任职且范围内仍有历史任职时，可重新办理离职以补做撤销，原结束时间不变。",
        ],
      },
    ],
  },
  {
    id: "organizations",
    title: "新建与调整组织",
    intro: "HR 可维护管理范围内的组织。新增一级组织请联系有权限的管理员。",
    links: [
      {
        label: "打开组织管理",
        to: "/organizations",
      },
    ],
    tasks: [
      {
        title: "查找要维护的组织",
        steps: [
          "在「组织管理」展开左侧「组织树」，或使用「搜索组织名称或编码」选择结果。",
          {
            text: "在「组织详情」核对组织编码、完整路径、上级和状态。",
            image: "organizations",
            highlights: [1, 7],
          },
        ],
        id: "getting-started",
        notes: ["管理范围包含所负责的一级组织及其全部下级组织，由授予 HR 权限的有效任职决定。其他任职不会扩大范围。"],
      },
      {
        title: "新增下级组织",
        prerequisites: [
          "上级组织位于你的管理范围内，且处于「正常」状态。第五级组织下不能再创建下级。提前确认新组织编码、名称和类型。",
        ],
        steps: [
          {
            text: "从组织树或搜索结果选中上级组织，点击详情顶部的「+ 下级组织」。",
            image: "organizations",
            highlights: [2],
          },
          {
            text: "在「新建下级组织」填写「组织编码」「组织名称」「组织类型」，核对「上级组织」和「状态」后点击「确定」。",
            image: "organization-create",
          },
        ],
      },
      {
        title: "修改组织名称或类型",
        steps: [
          "选中组织并核对编码和路径，点击详情顶部的「编辑」。",
          {
            text: "在「编辑组织」更新「组织名称」或「组织类型」，点击「确定」。",
            image: "organization-edit",
          },
        ],
        result: "组织编码和上级关系不能在此修改。",
      },
      {
        title: "修改组织状态或删除组织",
        prerequisites: [
          "暂停、停用或删除前，检查该组织和所有下级组织中是否还有未结束任职，或是否仍是未结束责任任命的目标。暂停中的任职和任命也属于未结束记录。",
          "删除还要求没有下级组织和未结束的应用委托。若提示存在你无法管理的关联记录，请联系具备完整管理权限的管理员。",
        ],
        steps: [
          {
            text: "选中目标组织并核对完整路径。修改状态时打开「状态」菜单，选择要切换的状态（正常、暂停或停用）。",
            image: "organization-status",
          },
          {
            text: "若弹出确认，阅读影响后点击「确认变更」。",
            image: "organization-status-confirm",
          },
          {
            text: "确需删除时点击「删除」，在弹窗中核对名称与检查说明后确认。",
            image: "organization-delete",
          },
        ],
      },
      {
        title: "组织操作不可用时",
        steps: [
          {
            text: "查看灰色按钮的提示，检查组织状态、管理范围及未结束的关联记录。",
            image: "organization-blocked",
          },
          "权限最近发生变化时，刷新页面再查看。若关联记录不在你的管理范围内，请联系完整管理员处理。",
        ],
        id: "troubleshooting",
      },
    ],
  },
  {
    id: "responsibilities",
    title: "设置部门负责人",
    intro: "使用「负责人」责任类型，每个部门最多有一条未结束的负责人任命。",
    links: [
      {
        label: "打开责任任命",
        to: "/organization-responsibilities/assignments",
      },
      {
        label: "责任类型目录",
        to: "/organization-responsibilities/types",
      },
    ],
    tasks: [
      {
        title: "任命部门负责人",
        prerequisites: ["任职与目标部门均为「正常」，任职所属组织和目标部门都在你的管理范围内。"],
        steps: [
          "打开「组织责任」→「责任任命」，点击「新建责任任命」。",
          {
            text: "在「目标组织」选择需要设置部门负责人的部门，「责任类型」选择「负责人」，再按姓名或工号选择该人员的任职。",
            image: "responsibility-create",
            highlights: [1, 2, 3],
          },
          "核对持有人、任职组织、岗位和目标组织后，点击「确定」。",
          {
            text: "在列表中确认「责任类型」为「负责人」、状态为「启用」，再点击「详情」。",
            image: "responsibility-result",
            highlights: [2],
          },
          {
            text: "核对目标部门、持有人及绑定的任职。",
            image: "responsibility-detail",
            highlights: [1],
          },
        ],
        notes: ["责任任命不授予系统角色或操作权限。任职、目标组织和责任类型创建后不能修改。"],
      },
      {
        title: "更换或结束部门负责人",
        steps: [
          {
            text: "按目标部门、「负责人」和「进行中」筛选，打开要结束的任命详情。",
            image: "responsibility-result",
            highlights: [2],
          },
          {
            text: "点击「结束任命」，核对持有人和目标组织，再点击「确认结束」。",
            image: "responsibility-end",
          },
          "更换负责人时，先结束旧任命，再为新任职新建「负责人」任命。",
        ],
        notes: ["已结束任命不能恢复，历史记录会保留。"],
      },
      {
        title: "暂停与恢复任命",
        steps: [
          {
            text: "暂时中止责任时，在详情中点击「暂停任命」。",
            image: "responsibility-detail",
            highlights: [2],
          },
          {
            text: "恢复前确认任职和目标组织均为「正常」，再点击「恢复任命」。",
            image: "responsibility-resume",
          },
        ],
        notes: ["暂停仍占用负责人名额；需要换人时应结束原任命。"],
      },
      {
        title: "查询部门负责人任命历史",
        steps: [
          {
            text: "按目标部门和「负责人」筛选，将生命周期切换为「已结束」或「全部生命周期」。",
            image: "responsibility-history",
          },
          "点击「详情」查看持有人、任职和起止时间。历史按当前管理范围展示，只能查看。",
        ],
      },
      {
        title: "提示负责人名额已满时",
        steps: [
          {
            text: "在「责任任命」按目标部门和「负责人」查询「进行中」记录，检查已有任命是否启用或暂停。两种状态都占用名额。",
            image: "responsibility-resume",
            highlights: [1],
          },
          "需要换人时，结束旧任命后再创建。若看不到占用记录，请联系完整管理员处理。",
        ],
      },
    ],
  },
  {
    id: "supervisors",
    title: "设置分管领导",
    intro: "同一组织可以设置多位分管领导，但同一任职不能重复任命。",
    links: [
      {
        label: "打开责任任命",
        to: "/organization-responsibilities/assignments",
      },
      {
        label: "责任类型目录",
        to: "/organization-responsibilities/types",
      },
    ],
    tasks: [
      {
        title: "新增分管领导",
        prerequisites: ["任职与目标组织均为「正常」，任职所属组织和目标组织都在你的管理范围内。"],
        steps: [
          "打开「组织责任」→「责任任命」，点击「新建责任任命」。",
          {
            text: "在「目标组织」选择需要设置分管领导的组织，「责任类型」选择「分管领导」，再按姓名或工号选择该人员的任职。",
            image: "supervisor-create",
            highlights: [1, 2, 3],
          },
          "核对持有人、任职组织、岗位和目标组织后，点击「确定」。",
          {
            text: "在列表中确认「责任类型」为「分管领导」、状态为「启用」，再点击「详情」。",
            image: "supervisor-result",
            highlights: [2],
          },
          {
            text: "核对目标组织、持有人及绑定的任职。",
            image: "supervisor-detail",
            highlights: [1],
          },
        ],
        notes: ["责任任命不授予系统角色或操作权限。任职、目标组织和责任类型创建后不能修改。"],
      },
      {
        title: "撤换或结束一位分管领导",
        steps: [
          {
            text: "按目标组织、「分管领导」和「进行中」筛选，打开要结束的任命详情。",
            image: "supervisor-result",
            highlights: [2],
          },
          {
            text: "点击「结束任命」，核对持有人和目标组织，再点击「确认结束」。",
            image: "supervisor-end",
          },
          "需要换人时，为新任职新建一条「分管领导」任命；其他分管领导的任命继续保留。",
        ],
        notes: ["已结束任命不能恢复，历史记录会保留。"],
      },
      {
        title: "暂停与恢复任命",
        steps: [
          {
            text: "暂时中止责任时，在详情中点击「暂停任命」。",
            image: "supervisor-detail",
            highlights: [2],
          },
          {
            text: "恢复前确认任职和目标组织均为「正常」，再点击「恢复任命」。",
            image: "supervisor-resume",
          },
        ],
        notes: ["暂停的任命仍未结束，同一任职不能重复添加同一组织的分管领导任命。"],
      },
      {
        title: "查询分管领导任命历史",
        steps: [
          {
            text: "按目标组织和「分管领导」筛选，将生命周期切换为「已结束」或「全部生命周期」。",
            image: "supervisor-history",
          },
          "点击「详情」查看持有人、任职和起止时间。历史按当前管理范围展示，只能查看。",
        ],
      },
    ],
  },
];
