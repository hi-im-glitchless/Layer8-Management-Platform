#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Layer8 — Local development helper
# Usage: ./launch-local.sh {start|stop|restart|status|rebuild|reset-password|disable-mfa|enable-mfa|logs}
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
# Used for reset-password, disable-mfa and enable-mfa. Callers pass user/password
# data via exported L8_USERS / L8_PASSWORD env vars (never interpolated into the
# script string) so usernames and passwords can contain arbitrary characters.
run_backend_script() {
    require_node
    local script="$1"
    (
        cd "$BACKEND_DIR"
        PATH="$NODE_BIN:$PATH" npx --yes tsx -e "$script"
    )
}

# Ensure the pinned Node version is available, installing it via nvm if missing.
ensure_node() {
    if [[ -x "$NODE_BIN/node" ]]; then
        return 0
    fi
    c_warn "Node $NODE_VERSION not found at $NODE_BIN — attempting install via nvm..."
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck disable=SC1091
        . "$HOME/.nvm/nvm.sh"
        nvm install "${NODE_VERSION#v}" || { c_error "nvm install ${NODE_VERSION#v} failed."; exit 1; }
    else
        c_error "nvm not found at ~/.nvm/nvm.sh."
        c_error "Install nvm first: https://github.com/nvm-sh/nvm#installing-and-updating"
        exit 1
    fi
    if [[ ! -x "$NODE_BIN/node" ]]; then
        c_error "Node $NODE_VERSION still not present at $NODE_BIN after install."
        c_error "A different patch version may have been installed; update NODE_VERSION in this script."
        exit 1
    fi
}

# Print a 64-char random hex secret (for SESSION_SECRET).
gen_secret() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        od -An -tx1 -N32 /dev/urandom | tr -d ' \n'
    fi
}

# First-time setup — install prerequisites, dependencies and the local DB.
# Idempotent: existing node_modules / backend/.env / dev.db are left in place
# (use `rebuild` for a destructive from-scratch reinstall).
cmd_install() {
    ensure_node

    # Create backend/.env from the example (with a generated SESSION_SECRET) if absent.
    if [[ ! -f "$BACKEND_DIR/.env" ]]; then
        if [[ -f "$BACKEND_DIR/.env.example" ]]; then
            c_info "Creating backend/.env from .env.example..."
            local secret
            secret=$(gen_secret)
            sed "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" \
                "$BACKEND_DIR/.env.example" > "$BACKEND_DIR/.env"
            c_info "Wrote backend/.env (generated SESSION_SECRET)."
        else
            c_warn "backend/.env.example not found — skipping .env creation."
        fi
    else
        c_info "backend/.env already exists — leaving it untouched."
    fi

    c_info "Installing backend dependencies..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npm install )

    c_info "Installing frontend dependencies..."
    ( cd "$FRONTEND_DIR" && PATH="$NODE_BIN:$PATH" npm install )

    c_info "Generating Prisma client..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npx --yes prisma generate )

    c_info "Applying database migrations..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npx --yes prisma migrate deploy )

    c_info "Seeding admin user..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npm run seed )

    # Redis is required at runtime but is a system service this script won't install.
    if redis-cli ping >/dev/null 2>&1; then
        c_info "Redis is up on localhost:6379."
    else
        c_warn "Redis is not responding on localhost:6379."
        c_warn "Install + start it, e.g.: sudo apt install redis-server && sudo systemctl enable --now redis-server"
    fi

    c_info "Install complete. Start the stack with: $0 start"
}

# Full clean rebuild — wipe deps + local DB and reinstall from scratch.
cmd_rebuild() {
    local assume_yes=0
    while (( $# )); do
        case "$1" in
            -y|--yes) assume_yes=1 ;;
            *) c_error "Unknown rebuild option: $1"; exit 1 ;;
        esac
        shift
    done

    require_node

    c_warn "Rebuild starts the project from scratch. It will:"
    c_warn "  - stop running backend/frontend"
    c_warn "  - delete backend/ and frontend/ node_modules (and dist)"
    c_warn "  - delete the local SQLite database ($BACKEND_DIR/dev.db) — ALL local data lost"
    c_warn "  - npm install, prisma generate, prisma migrate deploy, seed admin"
    if (( ! assume_yes )); then
        printf '\033[0;33m[WARN]\033[0m  Continue? [y/N] '
        local reply=""
        read -r reply || reply=""
        case "$reply" in
            y|Y|yes|YES) ;;
            *) c_info "Aborted."; return 0 ;;
        esac
    fi

    c_info "Stopping any running services..."
    cmd_stop || true

    c_info "Removing dependencies and build artifacts..."
    rm -rf "$BACKEND_DIR/node_modules" "$FRONTEND_DIR/node_modules"
    rm -rf "$BACKEND_DIR/dist" "$FRONTEND_DIR/dist"
    rm -f "$BACKEND_DIR/dev.db" "$BACKEND_DIR/dev.db-journal" \
          "$BACKEND_DIR/dev.db-wal" "$BACKEND_DIR/dev.db-shm"

    c_info "Installing backend dependencies..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npm install )

    c_info "Installing frontend dependencies..."
    ( cd "$FRONTEND_DIR" && PATH="$NODE_BIN:$PATH" npm install )

    c_info "Generating Prisma client..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npx --yes prisma generate )

    c_info "Applying database migrations..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npx --yes prisma migrate deploy )

    c_info "Seeding admin user..."
    ( cd "$BACKEND_DIR" && PATH="$NODE_BIN:$PATH" npm run seed )

    c_info "Rebuild complete. Start the stack with: $0 start"
}

# reset-password [-p|--password PASS] [username ...]
# Defaults: password Admin123!, user 'admin'. Affected users are forced to
# change their password on next login.
cmd_reset_password() {
    local password="Admin123!"
    local users=()
    while (( $# )); do
        case "$1" in
            -p|--password) shift; password="${1:-}" ;;
            --) shift; while (( $# )); do users+=("$1"); shift; done; break ;;
            -*) c_error "Unknown reset-password option: $1"; exit 1 ;;
            *) users+=("$1") ;;
        esac
        shift
    done
    (( ${#users[@]} == 0 )) && users=("admin")
    if [[ -z "$password" ]]; then
        c_error "--password requires a value."
        exit 1
    fi
    c_info "Resetting password for: ${users[*]}"
    export L8_PASSWORD="$password"
    export L8_USERS="${users[*]}"
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const { hashPassword } = await import('./src/services/auth.js');
  const password = process.env.L8_PASSWORD || 'Admin123!';
  const users = (process.env.L8_USERS || 'admin').trim().split(/[ ,]+/).filter(Boolean);
  const passwordHash = await hashPassword(password);
  for (const username of users) {
    try {
      const u = await prisma.user.update({
        where: { username },
        data: {
          passwordHash,
          mustResetPassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      console.log('Reset:', u.username, '| mustResetPassword:', u.mustResetPassword, '| totpEnabled:', u.totpEnabled);
    } catch (e) {
      console.error('Failed to reset', username, '-', (e && e.message) || e);
    }
  }
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
    c_info "Done. New password for ${users[*]}: $password (forced to change on next login)."
}

# disable-mfa [username ...]  (defaults to 'admin')
cmd_disable_mfa() {
    local users=("$@")
    (( ${#users[@]} == 0 )) && users=("admin")
    c_info "Disabling MFA for: ${users[*]}"
    export L8_USERS="${users[*]}"
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const users = (process.env.L8_USERS || 'admin').trim().split(/[ ,]+/).filter(Boolean);
  for (const username of users) {
    try {
      const u = await prisma.user.update({
        where: { username },
        data: { totpEnabled: false, totpSecret: null },
      });
      console.log('MFA disabled for:', u.username, '| totpEnabled:', u.totpEnabled);
    } catch (e) {
      console.error('Failed to disable MFA for', username, '-', (e && e.message) || e);
    }
  }
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
}

# enable-mfa <username> [username ...]
# Generates a fresh TOTP secret per user, enables MFA, and prints the base32
# secret + otpauth URI so it can be loaded into an authenticator app.
cmd_enable_mfa() {
    local users=("$@")
    if (( ${#users[@]} == 0 )); then
        c_error "enable-mfa requires at least one username."
        c_error "Usage: $0 enable-mfa <username> [username ...]"
        exit 1
    fi
    c_info "Enabling MFA for: ${users[*]}"
    export L8_USERS="${users[*]}"
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const { generateSecret, generateURI } = await import('otplib');
  const users = (process.env.L8_USERS || '').trim().split(/[ ,]+/).filter(Boolean);
  for (const username of users) {
    try {
      const secret = generateSecret();
      const uri = generateURI({ issuer: 'Layer8 - Management Platform', label: username, secret });
      const u = await prisma.user.update({
        where: { username },
        data: { totpEnabled: true, totpSecret: secret },
      });
      console.log('MFA enabled for:', u.username);
      console.log('  Secret (base32):', secret);
      console.log('  otpauth URI:   ', uri);
    } catch (e) {
      console.error('Failed to enable MFA for', username, '-', (e && e.message) || e);
    }
  }
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
    c_info "Load the printed base32 secret (or otpauth URI) into an authenticator app."
}

# mfa-token <username> [username ...]
# Print the CURRENT 6-digit TOTP code for users with MFA enabled. Reads each
# user's totpSecret from the DB and computes the code with the same TOTP instance
# the backend verifies against (otplib Noble crypto + Scure base32, default
# 6-digit / 30s, exact-match no skew), so the printed code is what login expects.
cmd_mfa_token() {
    local users=("$@")
    if (( ${#users[@]} == 0 )); then
        c_error "mfa-token requires at least one username."
        c_error "Usage: $0 mfa-token <username> [username ...]"
        exit 1
    fi
    export L8_USERS="${users[*]}"
    run_backend_script "
(async () => {
  const { prisma } = await import('./src/db/prisma.js');
  const { TOTP, NobleCryptoPlugin, ScureBase32Plugin } = await import('otplib');
  const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });
  const users = (process.env.L8_USERS || '').trim().split(/[ ,]+/).filter(Boolean);
  for (const username of users) {
    try {
      const u = await prisma.user.findUnique({
        where: { username },
        select: { username: true, totpEnabled: true, totpSecret: true },
      });
      if (!u) { console.error('No such user:', username); continue; }
      if (!u.totpEnabled || !u.totpSecret) {
        console.error('MFA not enabled for:', username, '- run: enable-mfa ' + username);
        continue;
      }
      const token = await totp.generate({ secret: u.totpSecret });
      const secondsLeft = 30 - Math.floor((Date.now() / 1000) % 30);
      const note = secondsLeft <= 5 ? '  <- expiring, re-run for a fresh code' : '';
      console.log(username + ': ' + token + '  (valid ~' + secondsLeft + 's)' + note);
    } catch (e) {
      console.error('Failed for', username, '-', (e && e.message) || e);
    }
  }
  await prisma.\$disconnect();
})().catch(async (e) => { console.error(e); process.exit(1); });
"
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

usage() {
    cat <<USAGE
Usage: $0 <command>

Commands:
  start                       Start backend + frontend dev servers
  stop                        Stop backend + frontend
  restart                     Stop then start
  status                      Show service status and health
  install                     First-time setup: install Node/deps, create backend/.env,
                              generate Prisma client, migrate and seed (idempotent)
  rebuild                     Start from 0: wipe node_modules + local DB, reinstall,
                              migrate and seed (use -y/--yes to skip confirmation)
  reset-password              Reset password for users (default user: admin)
                              [-p|--password PASS] [username ...]
  disable-mfa                 Clear TOTP for users so login skips MFA
                              [username ...]   (default user: admin)
  enable-mfa                  Generate a TOTP secret and enable MFA for users
                              <username> [username ...]
  mfa-token                   Print the current TOTP login code for users
                              <username> [username ...]
  logs                        Tail backend+frontend logs
                              (args: backend|frontend, -n/--no-follow, <lines>)

Examples:
  $0 start
  $0 install                       # one-time setup on a fresh checkout
  $0 rebuild                       # confirm prompt, then full clean rebuild
  $0 rebuild --yes                 # rebuild without confirmation
  $0 reset-password                # reset admin to Admin123!
  $0 reset-password alice bob      # reset alice and bob to Admin123!
  $0 reset-password -p 'S3cret!' alice
  $0 disable-mfa                   # disable admin MFA
  $0 disable-mfa alice bob
  $0 enable-mfa alice              # enable MFA, print secret + otpauth URI
  $0 mfa-token e2e_pm              # print e2e_pm's current login TOTP code
  $0 mfa-token e2e_admin e2e_normal  # codes for several users at once
  $0 logs                          # follow both
  $0 logs backend                  # follow backend only
  $0 logs --no-follow 500          # last 500 lines, no follow
USAGE
}

case "${1:-}" in
    start)           cmd_start ;;
    install)         cmd_install ;;
    stop)            cmd_stop ;;
    restart)         cmd_restart ;;
    status)          cmd_status ;;
    rebuild)         shift; cmd_rebuild "$@" ;;
    reset-password)  shift; cmd_reset_password "$@" ;;
    logs)            shift; cmd_logs "$@" ;;
    disable-mfa)     shift; cmd_disable_mfa "$@" ;;
    enable-mfa)      shift; cmd_enable_mfa "$@" ;;
    mfa-token)       shift; cmd_mfa_token "$@" ;;
    -h|--help|help|"") usage ;;
    *) usage; exit 1 ;;
esac
