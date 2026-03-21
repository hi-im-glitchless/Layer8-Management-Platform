#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Layer8 — Production Deployment Script (Cloudflare Edition)
# Usage: sudo ./launcher.sh {install|start|stop|update|status}
#
# This script assumes the app will sit behind Cloudflare (proxied).
# SSL is handled via a Cloudflare Origin Certificate — not Let's Encrypt.
# Compression is handled by Cloudflare at the edge — nginx does not compress.
# Backups, monitoring, and log rotation are set up automatically.
# =============================================================================

APP_DIR="/opt/layer8"
APP_USER="layer8"
APP_GROUP="layer8"
REPO_URL="https://github.com/hi-im-glitchless/Layer8-Management-Platform.git"
NODE_VERSION="20"
SERVICE_NAME="layer8"
SCRIPTS_DIR="$APP_DIR/scripts"
BACKUP_DIR="$APP_DIR/backups"
LOGS_DIR="$APP_DIR/logs"

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
    apt-get install -y git curl build-essential nginx redis-server sqlite3 awscli mailutils

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

    # 16. Configure nginx (Cloudflare-optimized — no compression)
    log_info "Configuring nginx for Cloudflare..."
    setup_nginx "$DOMAIN"

    # 17. SSL — Cloudflare Origin Certificate
    setup_ssl "$DOMAIN"

    # 18. Set up backups, monitoring, and log rotation
    setup_backups
    setup_monitoring
    setup_log_rotation

    # 19. Start services
    log_info "Starting services..."
    systemctl start redis-server
    systemctl start layer8

    # 20. Print success summary
    local PUBLIC_IP
    PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || echo "<unknown>")

    echo ""
    log_info "============================================"
    log_info "  Layer8 installation complete!"
    log_info ""
    log_info "  Domain:   ${DOMAIN}"
    log_info "  Admin:    admin / Admin123!"
    log_info "  Note:     Password reset required on first login"
    log_info ""
    log_info "  NEXT STEPS (Cloudflare):"
    log_info "  1. Add your domain to Cloudflare"
    log_info "  2. Create an A record:"
    log_info "       ${DOMAIN} → ${PUBLIC_IP}  (Proxied / orange cloud)"
    log_info "  3. Set SSL/TLS mode to Full (Strict)"
    log_info "  4. Deploy the Cloudflare Worker (see deployment guide)"
    log_info ""
    log_info "  Once Cloudflare is active:"
    log_info "    https://${DOMAIN}"
    log_info "============================================"
    echo ""
}

# ---------------------------------------------------------------------------
# setup_nginx — Cloudflare-optimized (no compression, real IP restoration)
# ---------------------------------------------------------------------------

setup_nginx() {
    local DOMAIN="$1"

    cat > /etc/nginx/sites-available/layer8 <<'NGINX_CONF'
# Layer8 — nginx config (behind Cloudflare)
#
# Compression is OFF — Cloudflare handles gzip/brotli at the edge.
# Doing it here would double-compress and waste CPU for no benefit.
#
# Real client IPs are restored from Cloudflare's CF-Connecting-IP header.

# Restore real visitor IP from Cloudflare
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name DOMAIN_PLACEHOLDER;

    ssl_certificate     /etc/ssl/layer8/origin.pem;
    ssl_certificate_key /etc/ssl/layer8/origin-key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # No gzip/brotli — Cloudflare compresses at the edge
    gzip off;

    # HSTS — enforce HTTPS for 1 year
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    root /opt/layer8/frontend/dist;
    index index.html;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Uploads proxy
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name DOMAIN_PLACEHOLDER;
    return 301 https://$host$request_uri;
}
NGINX_CONF

    sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" /etc/nginx/sites-available/layer8
    ln -sf /etc/nginx/sites-available/layer8 /etc/nginx/sites-enabled/layer8
    rm -f /etc/nginx/sites-enabled/default

    # Don't reload yet — SSL cert may not exist
}

# ---------------------------------------------------------------------------
# setup_ssl — Cloudflare Origin Certificate
# ---------------------------------------------------------------------------

setup_ssl() {
    local DOMAIN="$1"
    local SSL_DIR="/etc/ssl/layer8"

    mkdir -p "$SSL_DIR"

    echo ""
    log_info "============================================"
    log_info "  SSL Setup — Cloudflare Origin Certificate"
    log_info "============================================"
    echo ""
    log_info "Since this server sits behind Cloudflare, we use a Cloudflare"
    log_info "Origin Certificate instead of Let's Encrypt. It's simpler"
    log_info "(valid for up to 15 years, no renewal cron needed) and works"
    log_info "because only Cloudflare ever connects to your origin."
    echo ""
    log_info "To generate one:"
    log_info "  1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server"
    log_info "  2. Click 'Create Certificate'"
    log_info "  3. Keep the defaults (RSA 2048, 15 years)"
    log_info "  4. Cloudflare will show you the certificate and private key"
    echo ""

    read -rp "Do you have the Origin Certificate ready? (y/n): " HAS_CERT

    if [[ "$HAS_CERT" =~ ^[Yy] ]]; then
        echo ""
        log_info "Paste the Origin Certificate PEM (the certificate, not the key)."
        log_info "End with an empty line after -----END CERTIFICATE-----"
        echo ""

        local CERT_CONTENT=""
        while IFS= read -r line; do
            [[ -z "$line" ]] && break
            CERT_CONTENT+="$line"$'\n'
        done
        echo "$CERT_CONTENT" > "$SSL_DIR/origin.pem"

        echo ""
        log_info "Paste the Private Key PEM."
        log_info "End with an empty line after -----END PRIVATE KEY-----"
        echo ""

        local KEY_CONTENT=""
        while IFS= read -r line; do
            [[ -z "$line" ]] && break
            KEY_CONTENT+="$line"$'\n'
        done
        echo "$KEY_CONTENT" > "$SSL_DIR/origin-key.pem"

        chmod 600 "$SSL_DIR/origin-key.pem"
        chmod 644 "$SSL_DIR/origin.pem"

        # Test nginx config
        if nginx -t 2>/dev/null; then
            systemctl reload nginx
            log_info "SSL configured and nginx reloaded successfully."
        else
            log_error "nginx config test failed. Check your certificate files."
            log_error "  Certificate: $SSL_DIR/origin.pem"
            log_error "  Private key: $SSL_DIR/origin-key.pem"
            log_error "Run 'nginx -t' to see the error, fix the files, then 'systemctl reload nginx'."
        fi
    else
        # Generate a self-signed cert as placeholder so nginx can start
        log_warn "No Origin Certificate provided. Generating a temporary self-signed cert."
        log_warn "The app will work but Cloudflare Full (Strict) mode will fail."
        log_warn "Replace with a real Origin Certificate as soon as possible."
        echo ""

        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$SSL_DIR/origin-key.pem" \
            -out "$SSL_DIR/origin.pem" \
            -subj "/CN=${DOMAIN}" 2>/dev/null

        chmod 600 "$SSL_DIR/origin-key.pem"
        chmod 644 "$SSL_DIR/origin.pem"

        nginx -t && systemctl reload nginx

        log_warn "Self-signed cert installed. Replace it by running:"
        log_warn "  sudo $0 setup-ssl"
    fi
}

# ---------------------------------------------------------------------------
# setup_backups — SQLite backup cron
# ---------------------------------------------------------------------------

setup_backups() {
    log_info "Setting up automated backups..."

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$SCRIPTS_DIR"
    chown "${APP_USER}:${APP_GROUP}" "$BACKUP_DIR"

    cat > "$SCRIPTS_DIR/backup.sh" <<'BACKUP_SCRIPT'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/layer8/backups"
DB_PATH="/opt/layer8/backend/prod.db"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
MAX_LOCAL_BACKUPS=7

mkdir -p "$BACKUP_DIR"

# Create consistent backup using SQLite's built-in backup command
sqlite3 "$DB_PATH" ".backup $BACKUP_DIR/layer8-$TIMESTAMP.db"

# Compress it
gzip "$BACKUP_DIR/layer8-$TIMESTAMP.db"

# Remove local backups older than MAX_LOCAL_BACKUPS days
find "$BACKUP_DIR" -name "layer8-*.db.gz" -mtime +$MAX_LOCAL_BACKUPS -delete

echo "[$(date)] Backup complete: layer8-$TIMESTAMP.db.gz"

# Uncomment the following lines after configuring AWS CLI to enable S3 offsite backups:
# S3_BUCKET="layer8-backups-CHANGE-ME"
# aws s3 cp "$BACKUP_DIR/layer8-$TIMESTAMP.db.gz" "s3://$S3_BUCKET/layer8-$TIMESTAMP.db.gz"
BACKUP_SCRIPT

    chmod +x "$SCRIPTS_DIR/backup.sh"

    # Daily at 2 AM
    echo "0 2 * * * root $SCRIPTS_DIR/backup.sh >> /var/log/layer8-backup.log 2>&1" \
        > /etc/cron.d/layer8-backup

    log_info "Backup cron installed (daily at 2 AM). Backups stored in $BACKUP_DIR."
    log_info "To enable S3 offsite backups, edit $SCRIPTS_DIR/backup.sh and uncomment the S3 lines."
}

# ---------------------------------------------------------------------------
# setup_monitoring — health check cron
# ---------------------------------------------------------------------------

setup_monitoring() {
    log_info "Setting up health monitoring..."

    mkdir -p "$SCRIPTS_DIR"

    cat > "$SCRIPTS_DIR/health-check.sh" <<'HEALTH_SCRIPT'
#!/bin/bash

# Layer8 health check — runs every 5 minutes via cron.
# Alerts are logged to /var/log/layer8-health.log.
#
# To receive alerts via email, install mailutils and set ALERT_EMAIL.
# To receive alerts via Slack/Discord, replace the alert() function with a curl webhook.

ALERT_EMAIL=""  # Set to your email address to enable email alerts
HOSTNAME=$(hostname)

alert() {
    local MESSAGE="$1"
    local SUBJECT="$2"
    echo "[$(date)] $MESSAGE"
    if [[ -n "$ALERT_EMAIL" ]]; then
        echo "$MESSAGE" | mail -s "$SUBJECT" "$ALERT_EMAIL" 2>/dev/null || true
    fi
}

# Check disk usage (alert if > 85%)
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 85 ]; then
    alert "Disk usage at ${DISK_USAGE}% on $HOSTNAME" "[Layer8] Disk Alert"
fi

# Check if Node.js process is running
if ! pgrep -f "node.*layer8" > /dev/null 2>&1; then
    # Verify via systemd before alerting (process name may vary)
    if ! systemctl is-active --quiet layer8 2>/dev/null; then
        alert "Layer8 backend is not running on $HOSTNAME" "[Layer8] Process Down"
    fi
fi

# Check if Redis is running
if ! systemctl is-active --quiet redis-server 2>/dev/null; then
    alert "Redis is not running on $HOSTNAME" "[Layer8] Redis Down"
fi

# Check if nginx is running
if ! systemctl is-active --quiet nginx 2>/dev/null; then
    alert "nginx is not running on $HOSTNAME" "[Layer8] nginx Down"
fi

# Check memory usage (alert if available < 100MB)
AVAILABLE_MB=$(free -m | awk '/^Mem:/{print $7}')
if [ "$AVAILABLE_MB" -lt 100 ]; then
    alert "Low memory (${AVAILABLE_MB}MB available) on $HOSTNAME" "[Layer8] Memory Alert"
fi

# Health endpoint check
if systemctl is-active --quiet layer8 2>/dev/null; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3001/api/health 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" != "200" ]]; then
        alert "Health endpoint returned HTTP $HTTP_CODE on $HOSTNAME" "[Layer8] Health Check Failed"
    fi
fi
HEALTH_SCRIPT

    chmod +x "$SCRIPTS_DIR/health-check.sh"

    # Every 5 minutes
    echo "*/5 * * * * root $SCRIPTS_DIR/health-check.sh >> /var/log/layer8-health.log 2>&1" \
        > /etc/cron.d/layer8-health

    log_info "Health check cron installed (every 5 minutes)."
    log_info "Alerts logged to /var/log/layer8-health.log."
    log_info "To enable email alerts, edit $SCRIPTS_DIR/health-check.sh and set ALERT_EMAIL."
}

# ---------------------------------------------------------------------------
# setup_log_rotation
# ---------------------------------------------------------------------------

setup_log_rotation() {
    log_info "Setting up log rotation..."

    mkdir -p "$LOGS_DIR"
    chown "${APP_USER}:${APP_GROUP}" "$LOGS_DIR"

    cat > /etc/logrotate.d/layer8 <<'LOGROTATE_CONF'
/opt/layer8/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 layer8 layer8
    postrotate
        systemctl reload layer8 > /dev/null 2>&1 || true
    endscript
}

/var/log/layer8-*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
LOGROTATE_CONF

    log_info "Log rotation configured (app logs daily/14d, system logs weekly/4w)."
}

# ---------------------------------------------------------------------------
# do_setup_ssl — standalone command to (re)configure Origin Certificate
# ---------------------------------------------------------------------------

do_setup_ssl() {
    local CURRENT_DOMAIN
    CURRENT_DOMAIN=$(grep -m1 'server_name' /etc/nginx/sites-available/layer8 2>/dev/null | awk '{print $2}' | tr -d ';')

    if [[ -z "$CURRENT_DOMAIN" ]]; then
        read -rp "Enter your domain name: " CURRENT_DOMAIN
    fi

    setup_ssl "$CURRENT_DOMAIN"
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

    # SSL status
    echo ""
    if [[ -f /etc/ssl/layer8/origin.pem ]]; then
        local ISSUER
        ISSUER=$(openssl x509 -in /etc/ssl/layer8/origin.pem -noout -issuer 2>/dev/null | sed 's/issuer=//')
        local EXPIRY
        EXPIRY=$(openssl x509 -in /etc/ssl/layer8/origin.pem -noout -enddate 2>/dev/null | sed 's/notAfter=//')
        printf "%-20s %s\n" "SSL cert:" "$ISSUER"
        printf "%-20s %s\n" "SSL expires:" "$EXPIRY"
    else
        printf "%-20s %s\n" "SSL cert:" "NOT FOUND"
    fi

    # Backup status
    echo ""
    local LATEST_BACKUP
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/layer8-*.db.gz 2>/dev/null | head -1)
    if [[ -n "$LATEST_BACKUP" ]]; then
        printf "%-20s %s\n" "Latest backup:" "$(basename "$LATEST_BACKUP")"
    else
        printf "%-20s %s\n" "Latest backup:" "No backups found"
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
    log_info "Running pre-update backup..."
    if [[ -f "$SCRIPTS_DIR/backup.sh" ]]; then
        bash "$SCRIPTS_DIR/backup.sh"
    else
        local DB_FILE="$APP_DIR/backend/prod.db"
        if [[ -f "$DB_FILE" ]]; then
            local BACKUP="$DB_FILE.backup.$(date +%Y%m%d_%H%M%S)"
            cp "$DB_FILE" "$BACKUP"
            log_info "Database backed up to $BACKUP"
        fi
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

    # Update systemd unit (in case it changed)
    cp "$APP_DIR/deploy/layer8.service" /etc/systemd/system/layer8.service
    systemctl daemon-reload

    # Update nginx config (preserve domain and SSL from existing config)
    local CURRENT_DOMAIN
    CURRENT_DOMAIN=$(grep -m1 'server_name' /etc/nginx/sites-available/layer8 | awk '{print $2}' | tr -d ';')
    if [[ -n "$CURRENT_DOMAIN" ]]; then
        setup_nginx "$CURRENT_DOMAIN"
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
# do_backup — manual backup trigger
# ---------------------------------------------------------------------------

do_backup() {
    if [[ -f "$SCRIPTS_DIR/backup.sh" ]]; then
        log_info "Running manual backup..."
        bash "$SCRIPTS_DIR/backup.sh"
        log_info "Backup complete."
    else
        log_error "Backup script not found. Run '$0 install' first."
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

case "${1:-}" in
    install)    do_install   ;;
    start)      do_start     ;;
    stop)       do_stop      ;;
    update)     do_update    ;;
    status)     do_status    ;;
    setup-ssl)  do_setup_ssl ;;
    backup)     do_backup    ;;
    *)
        echo "Usage: $0 {install|start|stop|update|status|setup-ssl|backup}"
        echo ""
        echo "Commands:"
        echo "  install     Provision a new Layer8 instance (app + backups + monitoring)"
        echo "  start       Start all Layer8 services"
        echo "  stop        Stop the Layer8 backend service"
        echo "  update      Pull latest code, rebuild, and restart"
        echo "  status      Show service status, health check, SSL, and backup info"
        echo "  setup-ssl   Install or replace the Cloudflare Origin Certificate"
        echo "  backup      Run a manual database backup"
        exit 1
        ;;
esac