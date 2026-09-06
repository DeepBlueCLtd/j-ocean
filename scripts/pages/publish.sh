#!/usr/bin/env bash
# Publish to the gh-pages branch.
#
#   publish.sh site <sha>          the documentation site at /, the application at /app/
#   publish.sh preview <number>    one pull request's static instance at /pr-preview/pr-N/
#   publish.sh preview-remove <n>  take that instance away again when the pull request closes
#
# Written as a script rather than inline in the workflows so that the two of them cannot
# drift apart, and so that it can be read without reading YAML. It uses plain git and the
# runner's own token: no third-party publishing action, and therefore nothing to audit
# beyond this file.
set -euo pipefail

mode="${1:?usage: publish.sh <site|preview|preview-remove> <argument>}"
argument="${2:?usage: publish.sh <site|preview|preview-remove> <argument>}"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="${root}/.gh-pages"

git -C "${root}" fetch origin gh-pages --depth 1 2>/dev/null || true
rm -rf "${work}"

if git -C "${root}" show-ref --verify --quiet refs/remotes/origin/gh-pages; then
  git -C "${root}" worktree add --force "${work}" origin/gh-pages
  git -C "${work}" checkout -B gh-pages
else
  # First publish: an orphan branch, so the site's history is its own and not the code's.
  git -C "${root}" worktree add --force --detach "${work}"
  git -C "${work}" checkout --orphan gh-pages
  git -C "${work}" rm -rf . >/dev/null 2>&1 || true
fi

case "${mode}" in
  site)
    # Everything but the previews is rebuilt from this commit; the previews belong to open
    # pull requests and are not this workflow's to remove.
    find "${work}" -mindepth 1 -maxdepth 1 \
      ! -name '.git' ! -name 'pr-preview' -exec rm -rf {} +
    cp -R "${root}/dist-site/." "${work}/"
    mkdir -p "${work}/app"
    cp -R "${root}/dist/." "${work}/app/"
    printf '%s\n' "${argument}" > "${work}/BUILD_SHA"
    message="Publish the documentation site and the application from ${argument}"
    ;;
  preview)
    target="${work}/pr-preview/pr-${argument}"
    rm -rf "${target}"
    mkdir -p "${target}"
    cp -R "${root}/dist/." "${target}/"
    message="Preview the application for pull request #${argument}"
    ;;
  preview-remove)
    rm -rf "${work}/pr-preview/pr-${argument}"
    message="Remove the preview for pull request #${argument}"
    ;;
  *)
    echo "unknown mode: ${mode}" >&2
    exit 2
    ;;
esac

touch "${work}/.nojekyll"

git -C "${work}" add --all
if git -C "${work}" diff --cached --quiet; then
  echo "gh-pages is already up to date; nothing to publish"
else
  git -C "${work}" commit -m "${message}"
  git -C "${work}" push origin gh-pages
  echo "published: ${message}"
fi

git -C "${root}" worktree remove --force "${work}"
