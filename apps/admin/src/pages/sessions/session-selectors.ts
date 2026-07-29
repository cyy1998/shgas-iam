import { searchUsers, type UserVo } from '@admin/services/user';

type SelectRequestParams = {
  keyWords?: string;
};

function toUserOption(user: UserVo) {
  return {
    label: `${user.name}（${user.username}）`,
    value: user.id,
  };
}

export async function requestUserOptions(params: SelectRequestParams) {
  const text = params.keyWords?.trim();
  if (!text) return [];

  const response = await searchUsers({
    pageNum: 1,
    pageSize: 20,
    conditions: {
      fuzzyConditions: { text },
      exactConditions: {},
    },
  });
  return response.result.map(toUserOption);
}
