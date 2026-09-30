#!/bin/sh
# Source this file in the same shell that starts the agent: child-process exports
# cannot configure the agent's later Git commands. Everything written is private
# to this container; the checkout and its shared Git metadata stay untouched.
set -eu

iam_hooks_directory=/tmp/iam-sandcastle-hooks

iam_enable_git_hooks() {
  if [ ! -r .husky/pre-commit ] || [ ! -r lint-staged.config.mjs ]; then
    echo "Sandcastle hook 预检失败：缺少仓库提交入口或 lint-staged 配置。" >&2
    return 1
  fi

  # Validate existing process entries before appending ours. Git also rejects
  # missing KEY/VALUE entries; never replace or silently discard that input.
  iam_git_config_count=${GIT_CONFIG_COUNT:-0}
  case "$iam_git_config_count" in
    ''|*[!0-9]*)
      echo "Sandcastle hook 预检失败：GIT_CONFIG_COUNT 必须是非负整数。" >&2
      return 1
      ;;
  esac
  git config --list >/dev/null || return 1
  iam_git_config_next=$(expr "$iam_git_config_count" + 1) || return 1
  iam_git_config_count=$(expr "$iam_git_config_next" - 1) || [ "$iam_git_config_count" = 0 ] || return 1

  # Check real executables without applying format/lint to the checkout. This
  # catches missing dependencies and a Biome binary for the wrong platform.
  timeout --kill-after=5s 30s sh -c '
    set -e
    node node_modules/lint-staged/bin/lint-staged.js --version
    node node_modules/@biomejs/biome/bin/biome --version
    node node_modules/prettier/bin/prettier.cjs --version
    node node_modules/stylelint/bin/stylelint.mjs --version
    node --input-type=module -e '\''await import("./lint-staged.config.mjs")'\''
  ' </dev/null || return 1

  mkdir -p "$iam_hooks_directory" || return 1
  iam_hook_temporary=$(mktemp "$iam_hooks_directory/pre-commit.XXXXXX") || return 1
  if ! printf '%s\n' '#!/bin/sh' 'set -eu' 'exec sh .husky/pre-commit "$@"' >"$iam_hook_temporary" ||
    ! chmod 700 "$iam_hook_temporary" ||
    ! mv -f "$iam_hook_temporary" "$iam_hooks_directory/pre-commit"; then
    rm -f "$iam_hook_temporary"
    return 1
  fi

  export "GIT_CONFIG_KEY_${iam_git_config_count}=core.hooksPath"
  export "GIT_CONFIG_VALUE_${iam_git_config_count}=$iam_hooks_directory"
  GIT_CONFIG_COUNT=$iam_git_config_next
  export GIT_CONFIG_COUNT
  [ "$(git config --get core.hooksPath)" = "$iam_hooks_directory" ]
}

if ! iam_enable_git_hooks; then
  echo "Sandcastle hook 初始化失败；agent 未启动。修复上述错误后重新初始化容器。" >&2
  exit 1
fi
unset iam_hooks_directory iam_git_config_count iam_git_config_next iam_hook_temporary
unset -f iam_enable_git_hooks
