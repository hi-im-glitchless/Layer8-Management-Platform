#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Layer8 — Production Deployment Script
# Usage: sudo ./launcher.sh {install|start|stop|update|status}
# =============================================================================

APP_DIR="/opt/layer8"
APP_USER="layer8"
APP_GROUP="layer8"
REPO_URL="https://github.com/OWNER/Layer8.git"  # TODO: update with actual repo URL
NODE_VERSION="20"
SERVICE_NAME="layer8"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log_info()  { printf '\033[0;32m[INFO]\033[0m  %s\n' "$*"; }
log_warn()  { printf '\033[0;33m[WARN]\033[0m  %s\n' "$*"; }
log_error() { printf '\033[0;31m[ERROR]\033[0m %s\n' "$*"; }

check_service() {
    systemctl is-active --quiet "$1" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root (use sudo)."
    exit 1
fi

# ---------------------------------------------------------------------------
# do_install
# ---------------------------------------------------------------------------

do_install() {
    # 1. Check if already installed
    if [[ -d "$APP_DIR" ]]; then
        log_error "Layer8 is already installed at $APP_DIR."
        log_error "Use '$0 update' to update an existing installation."
        exit 1
    fi

    log_info "Starting Layer8 installation..."

    # 2. System packages
    log_info "Installing system packages..."
    apt-get update
    apt-get install -y git curl build-essential nginx redis-server certbot python3-certbot-nginx

    # 3. Install Node.js 20 LTS
    log_info "Installing Node.js ${NODE_VERSION} LTS..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y nodejs

    # 4. Create app user
    if ! id "$APP_USER" &>/dev/null; then
        log_info "Creating system user '$APP_USER'..."
        useradd --system --create-home --shell /bin/false "$APP_USER"
    else
        log_info "User '$APP_USER' already exists, skipping creation."
    fi

    # 5. Clone repository
    log_info "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"

    # 6. Set ownership
    chown -R "${APP_USER}:${APP_GROUP}" "$APP_DIR"

    # 7. Install backend dependencies
    log_info "Installing backend dependencies..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install

    # 8. Build backend
    log_info "Building backend..."
    sudo -u "$APP_USER" npm run build

    # 9. Install frontend dependencies
    log_info "Installing frontend dependencies..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install

    # 10. Build frontend
    log_info "Building frontend..."
    sudo -u "$APP_USER" npm run build

    # 11. Generate .env file
    log_info "Generating backend .env file..."
    read -rp "Enter your domain name (e.g. layer8.example.com): " DOMAIN
    if [[ -z "$DOMAIN" ]]; then
        log_error "Domain name is required."
        exit 1
    fi

    local SESSION_SECRET
    SESSION_SECRET=$(openssl rand -hex 32)

    cat > "$APP_DIR/backend/.env" <<EOF
NODE_ENV=production
PORT=3001
DATABASE_URL=file:${APP_DIR}/backend/prod.db
REDIS_URL=redis://localhost:6379
SESSION_SECRET=${SESSION_SECRET}
FRONTEND_URL=https://${DOMAIN}
ENABLE_SANITIZATION=false
ENABLE_DOCUMENT_SANITIZATION=false
ENABLE_ADAPTERS=false
ENABLE_REPORTS=false
EOF

    chmod 600 "$APP_DIR/backend/.env"
    chown "${APP_USER}:${APP_GROUP}" "$APP_DIR/backend/.env"

    # 12. Create uploads directory
    mkdir -p "$APP_DIR/backend/uploads"
    chown "${APP_USER}:${APP_GROUP}" "$APP_DIR/backend/uploads"

    # 13. Initialize database
    log_info "Initializing database..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npx prisma generate
    sudo -u "$APP_USER" npx prisma db push

    # 14. Seed admin user
    log_info "Seeding admin user..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm run seed

    echo ""
    log_info "============================================"
    log_info "  Default admin credentials:"
    log_info "    Username: admin"
    log_info "    Password: Admin123!"
    log_info "  You will be forced to change the password"
    log_info "  on first login."
    log_info "============================================"
    echo ""

    # 15. Install systemd service
    log_info "Installing systemd service..."
    cp "$APP_DIR/deploy/layer8.service" /etc/systemd/system/layer8.service
    systemctl daemon-reload
    systemctl enable layer8

    # 16. Configure nginx
    log_info "Configuring nginx..."
    cp "$APP_DIR/deploy/nginx-layer8.conf" /etc/nginx/sites-available/layer8
    sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" /etc/nginx/sites-available/layer8
    ln -sf /etc/nginx/sites-available/layer8 /etc/nginx/sites-enabled/layer8
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx

    # 17. SSL setup
    local PUBLIC_IP
    PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || echo "<unknown>")

    echo ""
    log_info "============================================"
    log_info "  Before continuing, create a DNS A record:"
    log_info "    ${DOMAIN} → ${PUBLIC_IP}"
    log_info "============================================"
    echo ""
    read -rp "Press Enter when DNS is configured..."

    log_info "Requesting SSL certificate..."
    if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" --redirect; then
        log_info "SSL certificate installed successfully."
    else
        log_warn "Certbot failed. You can run it manually later:"
        log_warn "  certbot --nginx -d ${DOMAIN}"
    fi

    # 18. Start services
    log_info "Starting services..."
    systemctl start redis-server
    systemctl start layer8

    # 19. Print success summary
    echo ""
    log_info "============================================"
    log_info "  Layer8 installation complete!"
    log_info ""
    log_info "  URL:      https://${DOMAIN}"
    log_info "  Admin:    admin / Admin123!"
    log_info "  Note:     Password reset required on first login"
    log_info "============================================"
    echo ""
}

# ---------------------------------------------------------------------------
# do_start
# ---------------------------------------------------------------------------

do_start() {
    log_info "Starting Layer8 services..."
    systemctl start redis-server
    systemctl start layer8
    systemctl start nginx
    log_info "All services started."
    do_status
}

# ---------------------------------------------------------------------------
# do_stop
# ---------------------------------------------------------------------------

do_stop() {
    log_info "Stopping Layer8 services..."
    systemctl stop layer8
    # Don't stop redis or nginx — they may serve other apps
    log_info "Layer8 backend stopped. Redis and nginx left running."
}

# ---------------------------------------------------------------------------
# do_status
# ---------------------------------------------------------------------------

do_status() {
    echo "=== Layer8 Service Status ==="
    echo ""
    printf "%-20s %s\n" "Backend (layer8):" "$(systemctl is-active layer8 2>/dev/null || echo 'not found')"
    printf "%-20s %s\n" "Redis:" "$(systemctl is-active redis-server 2>/dev/null || echo 'not found')"
    printf "%-20s %s\n" "Nginx:" "$(systemctl is-active nginx 2>/dev/null || echo 'not found')"
    echo ""

    # Health check if backend is running
    if check_service layer8; then
        local HTTP_CODE
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/api/health 2>/dev/null || echo "000")
        if [[ "$HTTP_CODE" == "200" ]]; then
            printf "%-20s %s\n" "Health check:" "OK (HTTP 200)"
        else
            printf "%-20s %s\n" "Health check:" "FAILED (HTTP $HTTP_CODE)"
        fi
    fi
}

# ---------------------------------------------------------------------------
# do_update
# ---------------------------------------------------------------------------

do_update() {
    log_info "Updating Layer8..."

    # Verify installation exists
    if [[ ! -d "$APP_DIR" ]]; then
        log_error "Layer8 is not installed at $APP_DIR. Run '$0 install' first."
        exit 1
    fi

    # Backup the database before anything
    local DB_FILE="$APP_DIR/backend/prod.db"
    if [[ -f "$DB_FILE" ]]; then
        local BACKUP="$DB_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$DB_FILE" "$BACKUP"
        log_info "Database backed up to $BACKUP"
    fi

    # Stop backend
    log_info "Stopping backend..."
    systemctl stop layer8 || true

    # Git pull
    log_info "Pulling latest code..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" git pull

    # Backend: install deps + build
    log_info "Building backend..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install
    sudo -u "$APP_USER" npm run build

    # Frontend: install deps + build
    log_info "Building frontend..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install
    sudo -u "$APP_USER" npm run build

    # Prisma: generate client + push schema (non-destructive)
    log_info "Updating database schema..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npx prisma generate
    sudo -u "$APP_USER" npx prisma db push

    # Update systemd unit and nginx config (in case they changed)
    cp "$APP_DIR/deploy/layer8.service" /etc/systemd/system/layer8.service
    systemctl daemon-reload

    # Update nginx config (preserve domain from existing config)
    local CURRENT_DOMAIN
    CURRENT_DOMAIN=$(grep -m1 'server_name' /etc/nginx/sites-available/layer8 | awk '{print $2}' | tr -d ';')
    if [[ -n "$CURRENT_DOMAIN" ]]; then
        cp "$APP_DIR/deploy/nginx-layer8.conf" /etc/nginx/sites-available/layer8
        sed -i "s/DOMAIN_PLACEHOLDER/${CURRENT_DOMAIN}/g" /etc/nginx/sites-available/layer8
        nginx -t && systemctl reload nginx
    fi

    # Restart backend
    log_info "Starting backend..."
    systemctl start layer8

    # Verify
    sleep 2
    do_status

    log_info "Update complete!"
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "${1:-}" in
    install) do_install ;;
    start)   do_start   ;;
    stop)    do_stop    ;;
    update)  do_update  ;;
    status)  do_status  ;;
    *)
        echo "Usage: $0 {install|start|stop|update|status}"
        echo ""
        echo "Commands:"
        echo "  install   Provision a new Layer8 instance on this server"
        echo "  start     Start all Layer8 services"
        echo "  stop      Stop the Layer8 backend service"
        echo "  update    Pull latest code, rebuild, and restart"
        echo "  status    Show service status and health check"
        exit 1
        ;;
esac
