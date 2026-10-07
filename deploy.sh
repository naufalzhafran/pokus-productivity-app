#!/usr/bin/env bash
# Pull the latest main, back up PocketBase data, then rebuild and redeploy.
# Usage: ./deploy.sh [all|web|backend]   (default: all)

set -Eeuo pipefail

readonly REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly BRANCH="${BRANCH:-main}"
readonly LOCK_FILE="${LOCK_FILE:-/tmp/pokus-redeploy.lock}"
readonly BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/pocketbase}"
readonly KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
readonly TARGET="${1:-all}"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

case "$TARGET" in
  all)     services=(pokus pocketbase) ;;
  web)     services=(pokus) ;;
  backend) services=(pocketbase) ;;
  *) fail "Usage: $0 [all|web|backend]" ;;
esac

for command in git docker sudo flock; do
  command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command"
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another deploy is already running."

cd "$REPO_DIR"
[[ "$(git branch --show-current)" == "$BRANCH" ]] || \
  fail "Expected branch '$BRANCH'; currently on '$(git branch --show-current)'."
if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "Tracked files have uncommitted changes. Commit or stash them first."
fi

log "Pulling origin/$BRANCH..."
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"

if [[ " ${services[*]} " == *" pocketbase "* ]]; then
  if sudo docker volume inspect pocketbase_data >/dev/null 2>&1; then
    mkdir -p "$BACKUP_DIR"
    backup="pb_data-pre-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
    log "Backing up pocketbase_data to $BACKUP_DIR/$backup..."
    sudo docker run --rm -v pocketbase_data:/data:ro -v "$BACKUP_DIR":/backup \
      alpine:3.22 tar czf "/backup/$backup" -C /data .
    sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR/$backup"
    chmod 600 "$BACKUP_DIR/$backup"
    # shellcheck disable=SC2012
    ls -1t "$BACKUP_DIR"/pb_data-pre-deploy-*.tar.gz | tail -n +"$((KEEP_BACKUPS + 1))" | xargs -r rm -f --
  else
    fail "Docker volume pocketbase_data not found; refusing to start PocketBase on an empty volume."
  fi

  # One-time migration: a container started with `docker run` blocks compose's
  # fixed container name. The data lives in the named volume, so removing it is safe.
  legacy="$(sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' pocketbase 2>/dev/null || echo compose)"
  if [[ -z "$legacy" ]]; then
    log "Replacing the pre-compose 'pocketbase' container (volume is kept)..."
    sudo docker stop pocketbase
    sudo docker rm pocketbase
  fi
fi

log "Building: ${services[*]}..."
sudo docker compose build "${services[@]}"

log "Starting: ${services[*]}..."
sudo docker compose up -d --no-build --remove-orphans "${services[@]}"

for service in "${services[@]}"; do
  log "Waiting for $service to become healthy..."
  health=""
  for _ in {1..30}; do
    health="$(sudo docker inspect --format '{{.State.Health.Status}}' "$service" 2>/dev/null || true)"
    [[ "$health" == "healthy" ]] && break
    [[ "$health" == "unhealthy" ]] && fail "$service is unhealthy."
    sleep 2
  done
  [[ "$health" == "healthy" ]] || fail "$service did not become healthy."
done

log "Done. Web: https://pokus.madebynz.xyz  API: https://pb1.madebynz.xyz"
log "If backend/pb_schema.json changed, re-import it (Settings → Import collections, keep 'Delete missing' off)."
