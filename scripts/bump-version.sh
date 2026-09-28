#!/usr/bin/env bash
set -e

# Resolve repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Default to 'patch' if no argument provided
BUMP_TYPE="${1:-patch}"

# Check for uncommitted changes in git
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Error: Working tree has uncommitted changes. Please commit or stash them first."
  exit 1
fi

# Ensure GitHub CLI is installed and authenticated
if ! command -v gh &> /dev/null; then
  echo "❌ Error: GitHub CLI ('gh') is not installed."
  exit 1
fi

if ! gh auth status &> /dev/null; then
  echo "❌ Error: GitHub CLI ('gh') is not logged in. Please run 'gh auth login' first."
  exit 1
fi

echo "🔄 Bumping version ($BUMP_TYPE)..."

# Bump version in package.json without creating git tag/commit automatically
RAW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version)
VERSION="${RAW_VERSION#v}"
TAG="v${VERSION}"

# Check if tag already exists locally or on remote
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Error: Git tag '$TAG' already exists locally."
  git checkout package.json
  exit 1
fi

if git ls-remote --tags origin "$TAG" | grep -q "$TAG"; then
  echo "❌ Error: Git tag '$TAG' already exists on remote origin."
  git checkout package.json
  exit 1
fi

echo "📦 New version: ${VERSION} (${TAG})"

# Update version in src-tauri/tauri.conf.json
node -e "
const fs = require('fs');
const file = 'src-tauri/tauri.conf.json';
const content = fs.readFileSync(file, 'utf8');
const updated = content.replace(/\"version\":\s*\"[^\"]+\"/, '\"version\": \"${VERSION}\"');
fs.writeFileSync(file, updated, 'utf8');
"
echo "📝 Updated package.json and src-tauri/tauri.conf.json"

# Stage modified files
git add package.json src-tauri/tauri.conf.json

# Commit changes
COMMIT_MSG="[release] bump version ${VERSION}"
git commit -m "$COMMIT_MSG"
echo "✅ Committed: $COMMIT_MSG"

# Get current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Push commit and new tag to origin
echo "🚀 Pushing to origin/${CURRENT_BRANCH}..."
git tag "$TAG"
git push origin "$CURRENT_BRANCH" --tags

# Create GitHub release
echo "🎉 Creating GitHub release ${TAG}..."
gh release create "$TAG" --title "$TAG" --generate-notes

echo "✨ Successfully released ${TAG}!"
