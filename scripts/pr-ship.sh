#!/bin/bash
set -e

echo "Running typecheck..."
pnpm run typecheck

echo "Running tests..."
pnpm run test

echo "Building..."
pnpm run build

echo "Creating PR..."
gh pr create -f

echo "Enabling auto-merge..."
gh pr merge --auto --squash