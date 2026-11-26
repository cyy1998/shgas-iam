#!/bin/sh
set -eu

iam_hooks_directory=/tmp/iam-sandcastle-hooks
test -r .husky/pre-commit
mkdir -p "$iam_hooks_directory"
printf '%s\n' '#!/bin/sh' 'exec sh .husky/pre-commit "$@"' > "$iam_hooks_directory/pre-commit"
chmod 700 "$iam_hooks_directory/pre-commit"
