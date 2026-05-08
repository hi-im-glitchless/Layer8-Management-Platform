#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Layer8 — Local development helper
# Usage: ./launch-local.sh {start|stop|restart|status|reset-password|disable-mfa}
#
# - Backend (port 3001) and frontend (port 5173) run via npm run dev
# - Uses Node 20 from nvm
# - Logs: /tmp/layer8-backend.log, /tmp/layer8-frontend.log
# - PIDs: /tmp/layer8-backend.pid, /tmp/layer8-frontend.pid
# - Requires Redis on localhost:6379 (sudo systemctl start redis-server)
# - Sanitization service is NOT started by this script
# =============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"

NODE_VERSION="v20.20.2"
NODE_BIN="$HOME/.nvm/versions/node/$NODE_VERSION/bin"

BACKEND_LOG="/tmp/layer8-backend.log"
FRONTEND_LOG="/tmp/layer8-frontend.log"
BACKEND_PID="/tmp/layer8-backend.pid"
FRONTEND_PID="/tmp/layer8-frontend.pid"

c_info()  { printf '\033[0;32m[INFO]\033[0m  %s\n' "$*"; }
c_warn()  { printf '\033[0;33m[WARN]\033[0m  %s\n' "$*"; }
c_error() { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*"; }

require_node() {
    if [[ ! -x "$NODE_BIN/node" ]]; then
        c_error "Node $NODE_VERSION not found at $NODE_BIN."
        c_error "Install it with: source ~/.nvm/nvm.sh && nvm install 20"
        exit 1
    fi
}

require_redis() {
    if ! redis-cli ping >/dev/null 2>&1; then
        c_error "Redis is not responding on localhost:6379."
        c_error "Start it with: sudo systemctl start redis-server"
        exit 1
    fi
}

is_running() {
    local pidfile="$1"
    [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_backend() {
    if is_running "$BACKEND_PID"; then
        c_warn "Backend already running (PID $(cat "$BACKEND_PID"))."
        return 0
    fi
    require_node
    require_redis
    c_info "Starting backend (Node $NODE_VERSION) on port 3001..."
    : > "$BACKEND_LOG"
    (
        cd "$BACKEND_DIR"
        PATH="$NODE_BIN:$PATH" nohup npm run dev >"$BACKEND_LOG" 2>&1 &
        echo $! > "$BACKEND_PID"
    )

    # Wait for "Server running on port" or fail after timeout
    local timeout=30
    while (( timeout-- > 0 )); do
        if grep -q "Server running on port" "$BACKEND_LOG" 2>/dev/null; then
            c_info "Backend ready: http://localhost:3001"
            return 0
        fi
        if ! is_running "$BACKEND_PID"; then
            c_error "Backend exited unexpectedly. Last log lines:"
            tail -n 20 "$BACKEND_LOG" >&2
            return 1
        fi
        sleep 1
    done
    c_warn "Backend did not signal readiness within 30s. Check $BACKEND_LOG."
}

start_frontend() {
    if is_running "$FRONTEND_PID"; then
        c_warn "Frontend already running (PID $(cat "$FRONTEND_PID"))."
        return 0
    fi
    require_node
    c_info "Starting frontend (Node $NODE_VERSION) on port 5173..."
    : > "$FRONTEND_LOG"
    (
        cd "$FRONTEND_DIR"
        PATH="$NODE_BIN:$PATH" nohup npm run dev >"$FRONTEND_LOG" 2>&1 &
        echo $! > "$FRONTEND_PID"
    )

    local timeout=30
    while (( timeout-- > 0 )); do
        if grep -q "Local:.*http" "$FRONTEND_LOG" 2>/dev/null; then
            local url
            url=$(grep -oE "http://localhost:[0-9]+" "$FRONTEND_LOG" | head -1)
            c_info "Frontend ready: ${url:-http://localhost:5173}"
            if [[ -n "$url" && "$url" != "http://localhost:5173" ]]; then
                c_warn "Vite fell back to a non-default port — backend CORS may reject this origin."
                c_warn "Free port 5173 (or update FRONTEND_URL in backend/.env) and restart."
            fi
            return 0
        fi
        if ! is_running "$FRONTEND_PID"; then
            c_error "Frontend exited unexpectedly. Last log lines:"
            tail -n 20 "$FRONTEND_LOG" >&2
            return 1
        fi
        sleep 1
    done
    c_warn "Frontend did not signal readiness within 30s. Check $FRONTEND_LOG."
}

stop_one() {
    local name="$1" pidfile="$2"
    if is_running "$pidfile"; then
        local pid
        pid=$(cat "$pidfile")
        c_info "Stopping $name (PID $pid)..."
        # Kill the whole process group — npm spawns child node, child tsx, etc.
        kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        sleep 1
        # Force-kill any stragglers matching this app
        case "$name" in
            backend)  pkill -f "tsx watch src/index.ts" 2>/dev/null || true ;;
            frontend) pkill -f "node .*frontend/node_modules/.bin/vite" 2>/dev/null || true ;;
        esac
        rm -f "$pidfile"
    else
        c_info "$name not running."
        rm -f "$pidfile"
    fi
}

cmd_start() {
    start_backend
    start_frontend
    cmd_status
}

cmd_stop() {
    stop_one frontend "$FRONTEND_PID"
    stop_one backend  "$BACKEND_PID"
}

cmd_restart() {
    cmd_stop
    sleep 1
    cmd_start
}

cmd_status() {
    echo "=== Layer8 (local dev) ==="
    if is_running "$BACKEND_PID"; then
        printf "%-12s running (PID %s)\n" "Backend:"  "$(cat "$BACKEND_PID")"
    else
        printf "%-12s stopped\n" "Backend:"
    fi
    if is_running "$FRONTEND_PID"; then
        printf "%-12s running (PID %s)\n" "Frontend:" "$(cat "$FRONTEND_PID")"
    else
        printf "%-12s stopped\n" "Frontend:"
    fi
    if redis-cli ping >/dev/null 2>&1; then
        printf "%-12s up\n" "Redis:"
    else
        printf "%-12s down\n" "Redis:"
    fi
    if is_running "$BACKEND_PID"; then
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3001/api/health 2>/dev/null || echo "000")
        printf "%-12s HTTP %s\n" "Health:" "$code"
    fi
}

# Run a one-off tsx script against the backend Prisma client.
# Used for reset-password and disable-mfa.
run_backend_script() {
    require_node
    local script="$1"
    (
        cd "$BACKEND_DIR"
        PATH="$NODE_BIN:$PATH" npx --yes tsx -e "$script"
    )
}

cmd_reset_password() {
    local new_password="${1:-Admin123!}"
    c_info "Resetting admin password to: $new_password"
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const { hashPassword } = await import('./src/services/auth.js');
  const passwordHash = await hashPassword('$new_password');
  const u = await prisma.user.update({
    where: { username: 'admin' },
    data: {
      passwordHash,
      mustResetPassword: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log('Reset admin:', u.username, '| mustResetPassword:', u.mustResetPassword, '| totpEnabled:', u.totpEnabled);
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
    c_info "Done. Login: admin / $new_password (will be forced to change)."
}

cmd_logs() {
    local target="both"
    local lines=200
    local follow=1

    while (( $# )); do
        case "$1" in
            backend|be)       target="backend" ;;
            frontend|fe)      target="frontend" ;;
            both|all)         target="both" ;;
            --no-follow|-n)   follow=0 ;;
            -[0-9]*)          lines="${1#-}" ;;
            [0-9]*)           lines="$1" ;;
            *) c_error "Unknown logs option: $1"; exit 1 ;;
        esac
        shift
    done

    local files=()
    case "$target" in
        backend)  files=("$BACKEND_LOG") ;;
        frontend) files=("$FRONTEND_LOG") ;;
        both)     files=("$BACKEND_LOG" "$FRONTEND_LOG") ;;
    esac

    local missing=0
    for f in "${files[@]}"; do
        if [[ ! -f "$f" ]]; then
            c_warn "Log not found: $f"
            missing=1
        fi
    done
    (( missing )) && [[ ${#files[@]} -eq 1 ]] && exit 1

    if (( follow )); then
        c_info "Tailing $target logs (Ctrl-C to stop, last $lines lines + follow)..."
        tail -F -n "$lines" "${files[@]}" 2>/dev/null
    else
        for f in "${files[@]}"; do
            [[ -f "$f" ]] || continue
            echo "==> $f <=="
            tail -n "$lines" "$f"
            echo
        done
    fi
}

cmd_disable_mfa() {
    c_info "Disabling MFA for admin..."
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const u = await prisma.user.update({
    where: { username: 'admin' },
    data: { totpEnabled: false, totpSecret: null },
  });
  console.log('MFA disabled for:', u.username, '| totpEnabled:', u.totpEnabled);
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
}

usage() {
    cat <<USAGE
Usage: $0 <command>

Commands:
  start              Start backend + frontend dev servers
  stop               Stop backend + frontend
  restart            Stop then start
  status             Show service status and health
  reset-password     Reset admin password to Admin123! (or arg 2)
  disable-mfa        Clear admin TOTP so login skips MFA
  logs               Tail backend+frontend logs (args: backend|frontend, -n/--no-follow, <lines>)

Examples:
  $0 start
  $0 reset-password
  $0 reset-password 'MyNewPass123!'
  $0 disable-mfa
  $0 logs                       # follow both
  $0 logs backend               # follow backend only
  $0 logs --no-follow 500       # last 500 lines, no follow
USAGE
}

case "${1:-}" in
    start)           cmd_start ;;
    stop)            cmd_stop ;;
    restart)         cmd_restart ;;
    status)          cmd_status ;;
    reset-password)  shift; cmd_reset_password "${1:-}" ;;
    logs)            shift; cmd_logs "$@" ;;
    disable-mfa)     cmd_disable_mfa ;;
    -h|--help|help|"") usage ;;
    *) usage; exit 1 ;;
esac
