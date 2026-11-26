#!/bin/sh
# The native runner executes this in a ready hook. The old runner sources it.
set -eu

iam_hooks_directory=/tmp/iam-sandcastle-hooks
test -r .husky/pre-commit
mkdir -p "$iam_hooks_directory"
printf '%s\n' '#!/bin/sh' 'exec sh .husky/pre-commit "$@"' > "$iam_hooks_directory/pre-commit"
chmod 700 "$iam_hooks_directory/pre-commit"
git config --global core.hooksPath "$iam_hooks_directory"

# An installed host Husky sets a local hooksPath. Native executors get this
# override from their sandbox environment. Legacy callers need it in this shell.
if [ "$(git config --get core.hooksPath)" != "$iam_hooks_directory" ]; then
  iam_git_config_index=${GIT_CONFIG_COUNT:-0}
  export "GIT_CONFIG_KEY_${iam_git_config_index}=core.hooksPath"
  export "GIT_CONFIG_VALUE_${iam_git_config_index}=$iam_hooks_directory"
  export GIT_CONFIG_COUNT=$((iam_git_config_index + 1))
  unset iam_git_config_index
fi
unset iam_hooks_directory
