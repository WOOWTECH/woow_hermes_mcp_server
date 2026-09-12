#!/usr/bin/env bash
# Compare this chart with what is running. Exit 0 = in sync, 1 = drift.
#   1. repo    vs release : helm template (this chart) <-> helm get manifest
#   2. cluster vs chart   : kubectl diff of the rendered chart against live objects
# Extra arguments are passed to `helm template`, e.g. --set-string ...
#   CONTEXT=woow-k3s RELEASE=hermes-mcp-admin NAMESPACE=hermes-mcp-admin \
#     VALUES=../../deploy/woow-k3s/hermes-mcp-admin.yaml scripts/check-drift.sh
#
# Step 1 is skipped while the instance is still managed by kubectl apply (no
# Helm release yet); step 2 works either way.
set -euo pipefail

CONTEXT="${CONTEXT:-woow-k3s}"
RELEASE="${RELEASE:-hermes-mcp-admin}"
NAMESPACE="${NAMESPACE:-hermes-mcp-admin}"
VALUES="${VALUES:-../../deploy/woow-k3s/hermes-mcp-admin.yaml}"
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

helm template "$RELEASE" . -n "$NAMESPACE" --skip-tests -f "$VALUES" "$@" > "$tmp/repo.yaml"

rc=0
if helm --kube-context "$CONTEXT" get manifest "$RELEASE" -n "$NAMESPACE" > "$tmp/release.yaml" 2>/dev/null; then
  # -B: helm get manifest ends with an extra blank line that helm template does not.
  if diff -u -B "$tmp/release.yaml" "$tmp/repo.yaml" > "$tmp/repo.diff"; then
    echo "1. repo == release ${RELEASE}"
  else
    echo "1. DRIFT: this chart renders differently from release ${RELEASE}:"
    cat "$tmp/repo.diff"
    rc=1
  fi
else
  echo "1. skipped: no Helm release ${RELEASE} in ${NAMESPACE} yet"
fi

set +e
kubectl --context "$CONTEXT" diff -f "$tmp/repo.yaml" > "$tmp/live.diff" 2>&1
krc=$?
set -e
case "$krc" in
  0) echo "2. cluster == chart (context ${CONTEXT})" ;;
  1) echo "2. DRIFT: live objects differ from the chart:"; cat "$tmp/live.diff"; rc=1 ;;
  *) cat "$tmp/live.diff" >&2; exit "$krc" ;;
esac
exit $rc
