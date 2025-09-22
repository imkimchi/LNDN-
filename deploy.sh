#!/usr/bin/env bash

# Deploy backend to Render and frontend to Vercel concurrently.
#
# Usage:
#   ./deploy.sh
#
# Env vars (read from environment and optionally from .env if present):
#   Backend (Render):
#     - RENDER_DEPLOY_HOOK_URL   Preferred. Render Deploy Hook URL for the backend service.
#     - or RENDER_API_KEY + RENDER_SERVICE_ID  Fallback to Render API trigger.
#
#   Frontend (Vercel):
#     - VERCEL_DEPLOY_HOOK_URL   Preferred. Vercel Deploy Hook URL for the frontend project.
#     - or VERCEL_TOKEN + FRONTEND_DIR (+ vercel CLI installed)  Fallback using Vercel CLI.
#
# Notes:
#   - Both deploys run in parallel. The script summarizes results and exits non‑zero if any fails.
#   - Secrets are never echoed.

set -euo pipefail

# Load .env.deploy if available (export variables). Avoid sourcing general .env.
if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env.deploy
  set +a
fi

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

log() {
  local level="$1"; shift
  printf '[%s] %s\n' "$level" "$*"
}

deploy_render() {
  local name="render"
  if [[ -n "${RENDER_DEPLOY_HOOK_URL:-}" ]]; then
    log info "Triggering Render deploy via hook (backend)"
    curl -fsS -X POST -H 'Content-Type: application/json' -d '{}' "$RENDER_DEPLOY_HOOK_URL" >/dev/null
    log info "Render hook accepted"
    return 0
  fi

  if [[ -n "${RENDER_API_KEY:-}" && -n "${RENDER_SERVICE_ID:-}" ]]; then
    log info "Triggering Render deploy via API (service $RENDER_SERVICE_ID)"
    curl -fsS -X POST \
      -H "Authorization: Bearer $RENDER_API_KEY" \
      -H 'Content-Type: application/json' \
      "https://api.render.com/v1/services/${RENDER_SERVICE_ID}/deploys" >/dev/null
    log info "Render API accepted"
    return 0
  fi

  log warn "Render deploy skipped: set RENDER_DEPLOY_HOOK_URL or RENDER_API_KEY + RENDER_SERVICE_ID"
  return 3
}

deploy_vercel() {
  local name="vercel"
  if [[ -n "${VERCEL_DEPLOY_HOOK_URL:-}" ]]; then
    log info "Triggering Vercel deploy via hook (frontend)"
    curl -fsS -X POST -H 'Content-Type: application/json' -d '{}' "$VERCEL_DEPLOY_HOOK_URL" >/dev/null
    log info "Vercel hook accepted"
    return 0
  fi

  if command_exists vercel && [[ -n "${VERCEL_TOKEN:-}" ]]; then
    local dir="${FRONTEND_DIR:-frontend}"
    if [[ -d "$dir" ]]; then
      log info "Triggering Vercel deploy via CLI in '$dir'"
      (
        cd "$dir"
        vercel deploy --prod --yes --token "$VERCEL_TOKEN"
      )
      log info "Vercel CLI deploy initiated"
      return 0
    else
      log warn "Vercel CLI fallback skipped: FRONTEND_DIR '$dir' not found"
      return 4
    fi
  fi

  log warn "Vercel deploy skipped: set VERCEL_DEPLOY_HOOK_URL or install CLI and set VERCEL_TOKEN (+ FRONTEND_DIR)"
  return 3
}

# Kick off both deploys in parallel
render_status=0
vercel_status=0

deploy_render &
pid_render=$!

deploy_vercel &
pid_vercel=$!

wait $pid_render || render_status=$?
wait $pid_vercel || vercel_status=$?

echo
log info "Summary: Render=$render_status, Vercel=$vercel_status"

if [[ $render_status -ne 0 || $vercel_status -ne 0 ]]; then
  log warn "One or more deploys were skipped or failed. See logs above."
  exit 1
fi

log info "Both deploys triggered successfully."
exit 0
