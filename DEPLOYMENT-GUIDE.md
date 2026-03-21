# Layer8 Production Deployment Guide

## Overview

This guide covers deploying Layer8 on AWS EC2 behind Cloudflare with advanced client fingerprinting to protect against scanners, bots, and tools like Burp Suite.

The app is intended for a small team of PMs. It has its own login and MFA. The goal of the infrastructure layer is to make the app as hostile as possible to automated tools and attackers, while remaining invisible to legitimate users.

Architecture:
```
[User] --> [Cloudflare CDN + Worker] --> [EC2 Instance (nginx + Express)]
                |
        JA4 fingerprinting
        Header order analysis
        Bot/scanner detection
        Honeypot path trapping
        Geo/ASN filtering
```

---

## Part 1: AWS Account and EC2 Instance Setup

This section walks through everything from creating an AWS account to having a running server you can SSH into. If you already have an AWS account, skip to section 1.3.

### 1.1 Create an AWS Account

1. Go to **https://aws.amazon.com** and click **Create an AWS Account**
2. Enter your email address and choose an account name (e.g., `layer8-prod`)
3. Verify your email with the code AWS sends you
4. Set a strong **root user password** — store it in a password manager
5. Choose **Personal** account type (unless this is for an organization)
6. Enter your contact information
7. Enter a **payment method** (credit or debit card) — AWS requires this even for the free tier. You won't be charged until you exceed free tier limits.
8. Verify your identity via phone (SMS or voice call)
9. Select the **Basic Support — Free** plan
10. Click **Complete sign up**

You'll land on the AWS Management Console. You're now on the **AWS Free Tier** for the first 12 months, which includes 750 hours/month of `t4g.micro` (enough to run 24/7).

### 1.2 Secure Your Account and Set Up Billing Alerts

Before launching anything, lock down your account and make sure you won't get surprise bills.

#### 1.2.1 Enable MFA on the Root Account

Your root account has unrestricted access to everything. Protect it.

1. Click your account name (top right) > **Security credentials**
2. Under **Multi-factor authentication (MFA)**, click **Assign MFA device**
3. Name it (e.g., `root-mfa`), select **Authenticator app**
4. Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
5. Enter two consecutive codes and click **Add MFA**

#### 1.2.2 Create an IAM User (Don't Use Root for Daily Work)

The root account should only be used for billing and account-level changes. Create an IAM user for day-to-day work.

1. Go to **IAM** (search "IAM" in the top search bar)
2. In the left sidebar, click **Users** > **Create user**
3. **User name:** `layer8-admin`
4. Check **Provide user access to the AWS Management Console**
5. Select **I want to create an IAM user** (not Identity Center unless you need it)
6. Set a custom password or auto-generate one
7. Uncheck **User must create a new password at next sign-in** (unless you're sharing this)
8. Click **Next**
9. **Set permissions:** Select **Attach policies directly**
10. Search for and check these policies:
    - `AmazonEC2FullAccess`
    - `AmazonS3FullAccess` (needed later for backups)
    - `AmazonVPCFullAccess`
    - `CloudWatchFullAccess` (optional, for monitoring)
11. Click **Next** > **Create user**
12. **Save the sign-in URL, username, and password** — you'll use this IAM user from now on
13. **Enable MFA on this user too:** Go to Users > `layer8-admin` > Security credentials > Assign MFA device

From now on, sign in at the IAM sign-in URL (it looks like `https://123456789012.signin.aws.amazon.com/console`) with your IAM user, not root.

#### 1.2.3 Set a Billing Budget (Prevent Surprise Bills)

This is critical — without it, a misconfiguration could cost you money without any warning.

1. Go to **Billing and Cost Management** (search "Billing" in the top bar)
2. In the left sidebar, click **Budgets** > **Create a budget**
3. Select **Use a template** > **Monthly cost budget**
4. **Budget name:** `layer8-monthly`
5. **Budgeted amount:** `$25` (this gives headroom above the expected ~$14/mo)
6. **Email recipients:** your email address
7. Click **Create budget**

AWS will email you when your costs hit 85% and 100% of $25.

#### 1.2.4 Enable Free Tier Usage Alerts

1. Still in Billing, go to **Billing preferences** (left sidebar, or under **Preferences**)
2. Check **Receive Free Tier Usage Alerts**
3. Enter your email address
4. Click **Save preferences**

AWS will now warn you before any free-tier service is about to exceed its limit.

### 1.3 Choose Your Region

AWS has data centers worldwide. Pick the region closest to your users for lowest latency.

1. In the top right of the console, click the region dropdown (it might say `N. Virginia`)
2. Select **EU (Ireland) — eu-west-1** (good for European users, relatively cheap)

> **Tip:** If your PMs are mostly in Portugal/Spain, `eu-west-1` (Ireland) or `eu-south-2` (Spain) are good choices. If they're in the US, use `us-east-1` (Virginia). All pricing in this guide assumes `eu-west-1`.

**Important:** Everything you create (instances, security groups, key pairs, Elastic IPs) is region-specific. Make sure you stay in the same region throughout this guide.

### 1.4 Create a Key Pair (for SSH Access)

You need a key pair to SSH into your server. Create it before launching the instance so you can select it during launch.

1. Go to **EC2** (search "EC2" in the top bar)
2. In the left sidebar, click **Key Pairs** (under Network & Security)
3. Click **Create key pair**
4. **Name:** `layer8-key`
5. **Key pair type:** RSA
6. **Private key file format:**
   - If you're on **macOS/Linux:** select `.pem`
   - If you're on **Windows** (using PuTTY): select `.ppk`
7. Click **Create key pair**
8. The private key file will automatically download. **Save it somewhere safe** — you cannot download it again.

On macOS/Linux, move it and set permissions:
```bash
mv ~/Downloads/layer8-key.pem ~/.ssh/layer8-key.pem
chmod 400 ~/.ssh/layer8-key.pem
```

On Windows with PuTTY, keep the `.ppk` file in a known location (e.g., `C:\Users\YourName\.ssh\layer8-key.ppk`).

### 1.5 Create a Security Group

A security group is a firewall for your instance. We'll create one that only allows SSH from your IP and HTTP/HTTPS from Cloudflare.

1. In the EC2 dashboard left sidebar, click **Security Groups** (under Network & Security)
2. Click **Create security group**
3. **Security group name:** `layer8-sg`
4. **Description:** `Layer8 production - SSH from admin, HTTP/HTTPS from Cloudflare only`
5. **VPC:** Leave the default VPC selected

#### Inbound Rules

Click **Add rule** for each of these:

**Rule 1 — SSH access (your IP only):**
- Type: **SSH**
- Port range: **22** (auto-filled)
- Source: **My IP** (AWS will auto-detect your current IP)
- Description: `Admin SSH access`

> **Note:** "My IP" only adds your current public IP. If your IP changes (e.g., you're on a different network), you'll need to update this rule. To update: go to the security group > Edit inbound rules > change the SSH source IP.

**Rules 2+ — HTTP/HTTPS from Cloudflare:**

You need to add Cloudflare's IP ranges for ports 80 and 443. Cloudflare publishes these at https://www.cloudflare.com/ips/

For each of the following CIDR blocks, add **two rules** (one for port 80, one for port 443):

```
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

For each CIDR:
- Type: **HTTP** (port 80), Source: **Custom**, paste the CIDR, Description: `Cloudflare`
- Type: **HTTPS** (port 443), Source: **Custom**, paste the CIDR, Description: `Cloudflare`

Also add these IPv6 ranges (same process, ports 80 and 443 each):
```
2400:cb00::/32
2606:4700::/32
2803:f800::/32
2405:b500::/32
2405:8100::/32
2a06:98c0::/29
2c0f:f248::/32
```

This is tedious the first time but you only do it once. The weekly cron script (section 1.9) will keep it updated automatically after that.

#### Outbound Rules

Leave the default: **All traffic, All ports, 0.0.0.0/0** (the instance needs to reach the internet for npm, apt, etc.)

Click **Create security group**. Note the **Security group ID** (it looks like `sg-0abc1234def56789`) — you'll need it for the auto-update script.

### 1.6 Launch the EC2 Instance

Now create the actual server.

1. Go to **EC2 Dashboard** > click **Launch instance** (the orange button)

2. **Name and tags:**
   - Name: `layer8-prod`

3. **Application and OS Images (AMI):**
   - Click **Ubuntu** (in the Quick Start tabs)
   - Select **Ubuntu Server 24.04 LTS**
   - **Important:** Under Architecture, select **64-bit (Arm)** — this is required for the t4g instance type
   - The AMI ID will look like `ami-xxxxxxxxx` — the exact ID varies by region, just make sure it says Ubuntu 24.04 LTS and Arm64

4. **Instance type:**
   - Select **t4g.small** (2 vCPU, 2 GB RAM)
   - If you want to start on the free tier: select **t4g.micro** instead (2 vCPU, 1 GB RAM, free for first 12 months)

5. **Key pair (login):**
   - Select `layer8-key` (the one you created in section 1.4)

6. **Network settings:**
   - Click **Edit** (top right of the Network settings section)
   - **VPC:** Leave default
   - **Subnet:** Leave "No preference" (AWS picks an availability zone)
   - **Auto-assign public IP:** **Enable** (you'll replace this with an Elastic IP later, but you need an IP to SSH in initially)
   - **Firewall (security groups):** Select **Select existing security group**
   - Choose `layer8-sg` (the one you created in section 1.5)

7. **Configure storage:**
   - Change the root volume to **20 GiB**
   - Volume type: **gp3** (this is the default and cheapest option)
   - Delete on termination: **Yes** (if you terminate the instance, the disk goes with it)

8. **Advanced details** (expand this section):
   - Everything can stay at defaults
   - Optionally, under **Credit specification**, select **Standard** to avoid burst charges. By default, t4g instances use "Unlimited" credits which can incur small charges if you sustain high CPU. Standard mode caps performance instead. For this workload, you'll never hit the limit either way.

9. **Summary** (right panel):
   - Verify: Ubuntu 24.04 ARM64, t4g.small, 20 GiB gp3, layer8-key, layer8-sg
   - Number of instances: **1**
   - Click **Launch instance**

10. Click **View all instances**. Your instance will show **Pending** for a minute, then **Running**.

### 1.7 Allocate and Associate an Elastic IP

The public IP assigned at launch is temporary — it changes if you stop/start the instance. An Elastic IP is a static IP that stays the same.

1. In the EC2 left sidebar, click **Elastic IPs** (under Network & Security)
2. Click **Allocate Elastic IP address**
3. Leave defaults (Amazon's pool of IPv4 addresses, your current region)
4. Click **Allocate**
5. Select the new Elastic IP (it'll appear in the list)
6. Click **Actions** > **Associate Elastic IP address**
7. **Resource type:** Instance
8. **Instance:** Select your `layer8-prod` instance
9. Click **Associate**

Note this IP address — this is your server's permanent public IP. You'll use it in DNS records and to SSH.

> **Warning:** An Elastic IP is free only while it's associated with a **running** instance. If you stop the instance or disassociate the IP, it costs $0.005/hr (~$3.60/mo). If you ever terminate the instance, go back and **release** the Elastic IP.

### 1.8 SSH Into Your Instance

Now connect to your server.

**macOS / Linux:**
```bash
ssh -i ~/.ssh/layer8-key.pem ubuntu@<your-elastic-ip>
```

If you get a "Permission denied (publickey)" error, make sure the key has the right permissions:
```bash
chmod 400 ~/.ssh/layer8-key.pem
```

**Windows (PuTTY):**
1. Open PuTTY
2. **Host Name:** `ubuntu@<your-elastic-ip>`
3. **Port:** 22
4. In the left panel, go to **Connection > SSH > Auth > Credentials**
5. **Private key file for authentication:** Browse to your `.ppk` file
6. Click **Open**

**Windows (PowerShell / OpenSSH):**
```powershell
ssh -i C:\Users\YourName\.ssh\layer8-key.pem ubuntu@<your-elastic-ip>
```

The first time you connect, you'll see a fingerprint confirmation — type `yes` to continue.

You should now see a prompt like:
```
ubuntu@ip-172-31-xx-xx:~$
```

You're in. Leave this terminal open — you'll use it in section 1.10 to run the installer.

> **If SSH times out:** Your IP may have changed since you created the security group. Go back to EC2 > Security Groups > `layer8-sg` > Edit inbound rules > Update the SSH rule's source to your current IP (select "My IP" again).

### 1.9 Automate Security Group Updates for Cloudflare IPs

The Cloudflare IP ranges you entered in section 1.5 can change over time. This script keeps them current automatically.

First, install the AWS CLI on your instance (you'll need IAM credentials):

```bash
# On your EC2 instance (via SSH)
sudo apt update && sudo apt install -y awscli

# Configure with your IAM user's access keys
# To get access keys: IAM > Users > layer8-admin > Security credentials > Create access key
aws configure
# AWS Access Key ID: (paste your key)
# AWS Secret Access Key: (paste your secret)
# Default region name: eu-west-1
# Default output format: json
```

Create the update script:
```bash
sudo mkdir -p /opt/layer8/scripts

sudo tee /opt/layer8/scripts/update-cloudflare-sg.sh > /dev/null <<'SCRIPT'
#!/bin/bash
# Updates the security group with current Cloudflare IP ranges

SECURITY_GROUP_ID="sg-xxxxxxxxx"  # Replace with your SG ID from section 1.5
REGION="eu-west-1"

# Fetch current Cloudflare IPs
CF_IPV4=$(curl -s https://www.cloudflare.com/ips-v4)
CF_IPV6=$(curl -s https://www.cloudflare.com/ips-v6)

# Revoke all existing HTTP/HTTPS rules
echo "Revoking old rules..."
aws ec2 describe-security-group-rules \
  --filters "Name=group-id,Values=$SECURITY_GROUP_ID" \
  --query "SecurityGroupRules[?FromPort==\`80\` || FromPort==\`443\`].SecurityGroupRuleId" \
  --output text --region $REGION | tr '\t' '\n' | while read rule_id; do
    [ -n "$rule_id" ] && aws ec2 revoke-security-group-ingress \
      --group-id $SECURITY_GROUP_ID \
      --security-group-rule-ids "$rule_id" \
      --region $REGION 2>/dev/null
done

# Add current Cloudflare IPs
echo "Adding current Cloudflare IPs..."
for cidr in $CF_IPV4; do
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress \
      --group-id $SECURITY_GROUP_ID \
      --protocol tcp --port $port \
      --cidr "$cidr" --region $REGION 2>/dev/null
  done
done

for cidr in $CF_IPV6; do
  for port in 80 443; do
    aws ec2 authorize-security-group-ingress \
      --group-id $SECURITY_GROUP_ID \
      --protocol tcp --port $port \
      --ipv6-cidr "$cidr" --region $REGION 2>/dev/null
  done
done

echo "Security group updated at $(date)"
SCRIPT

sudo chmod +x /opt/layer8/scripts/update-cloudflare-sg.sh
```

**Edit the script** to replace `sg-xxxxxxxxx` with your actual security group ID:
```bash
sudo nano /opt/layer8/scripts/update-cloudflare-sg.sh
# Change SECURITY_GROUP_ID="sg-xxxxxxxxx" to your real SG ID
# Save: Ctrl+O, Enter, Ctrl+X
```

Set up the weekly cron job:
```bash
echo "0 3 * * 0 root /opt/layer8/scripts/update-cloudflare-sg.sh >> /var/log/cloudflare-sg-update.log 2>&1" | sudo tee /etc/cron.d/cloudflare-sg-update
```

Test it once manually:
```bash
sudo /opt/layer8/scripts/update-cloudflare-sg.sh
```

You should see "Adding current Cloudflare IPs..." and no errors. The security group will now be refreshed every Sunday at 3 AM.

### 1.10 Install Layer8

Before running the installer, you'll need a **Cloudflare Origin Certificate**. If you haven't set up Cloudflare yet (Part 2), you can skip the certificate for now — the installer will generate a temporary self-signed cert — and come back to replace it with `sudo bash launcher.sh setup-ssl` after completing Part 2.

If you do have the Origin Certificate ready (see section 2.3 for how to generate one), have the certificate PEM and private key PEM copied to your clipboard.

```bash
# On your EC2 instance (via SSH)
git clone https://github.com/<your-user>/Layer8.git /opt/layer8
cd /opt/layer8
sudo bash launcher.sh install
```

The installer will prompt you for:
1. Your domain name (e.g., `layer8.example.com`)
2. The Cloudflare Origin Certificate PEM (paste it, or skip to use a temporary self-signed cert)
3. The private key PEM

It will then automatically:
- Install system packages (Node.js 20, nginx, Redis, SQLite)
- Build the backend and frontend
- Initialize the database and create the admin user (`admin` / `Admin123!`)
- Configure nginx optimized for Cloudflare (no compression, real IP restoration)
- Set up daily SQLite backups (`/opt/layer8/backups/`)
- Set up health monitoring (process, disk, memory checks every 5 minutes)
- Set up log rotation
- Start all services

At the end, the script prints your Elastic IP and the next steps for Cloudflare setup.

**Verify everything is running:**
```bash
sudo bash launcher.sh status
```

You should see:
```
=== Layer8 Service Status ===

Backend (layer8):    active
Redis:               active
Nginx:               active

Health check:        OK (HTTP 200)

SSL cert:            ...
SSL expires:         ...

Latest backup:       No backups found
```

> **Post-install tips:**
> - To enable S3 offsite backups: edit `/opt/layer8/scripts/backup.sh` and uncomment the S3 lines after running `aws configure`
> - To enable email/Slack alerts: edit `/opt/layer8/scripts/health-check.sh` and set `ALERT_EMAIL` or add a webhook curl

**Other launcher commands:**
```bash
sudo bash launcher.sh status      # Service status, health check, SSL info, latest backup
sudo bash launcher.sh start       # Start all services
sudo bash launcher.sh stop        # Stop the backend
sudo bash launcher.sh update      # Git pull, rebuild, restart (auto-backs up first)
sudo bash launcher.sh backup      # Run a manual backup
sudo bash launcher.sh setup-ssl   # Install or replace the Origin Certificate
```

### 1.11 Billing: Predictable Costs and Savings Plans

Now that your instance is running, here's what you're paying and how to reduce it.

#### Current On-Demand Costs

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t4g.small (on-demand) | ~$12.26 |
| EBS 20GB gp3 | ~$1.60 |
| Elastic IP (attached to running instance) | Free |
| Data transfer (first 100 GB/mo out) | Free |
| **Total** | **~$13.86/mo** |

> **Free tier note:** If you're in your first 12 months and chose `t4g.micro`, the EC2 cost is $0 for up to 750 hrs/mo, so you'd only pay for EBS (~$1.60/mo).

#### Set Up a Savings Plan (After You're Stable)

Once you've confirmed everything works and you plan to keep this running, a Savings Plan locks in a lower rate:

| Plan | Commitment | Monthly Cost | Annual Cost | Savings |
|------|-----------|-------------|------------|---------|
| On-Demand | None | ~$12.26 | ~$147 | — |
| Compute Savings Plan (1yr, no upfront) | 1 year | ~$8.50 | ~$102 | ~30% |
| Compute Savings Plan (1yr, all upfront) | 1 year | ~$7.30 | ~$88 | ~40% |

To purchase:
1. Go to **AWS Cost Management** > **Savings Plans** (search "Savings Plans" in the top bar)
2. Click **Purchase Savings Plan**
3. **Savings Plan type:** Compute Savings Plans (more flexible than EC2 Instance Savings Plans — lets you change instance type/region later)
4. **Term:** 1 year
5. **Payment option:** 
   - **No upfront:** Pay monthly, ~30% savings. Best if you want flexibility.
   - **All upfront:** Pay once for the year, ~40% savings. Best value.
6. **Hourly commitment:** Enter `$0.0116` (this covers a t4g.small in eu-west-1; the wizard will show you the recommendation)
7. Review and purchase

> **Don't rush this.** Run on-demand for 2-4 weeks first. Make sure the instance type and region are right. A Savings Plan is a 1-year commitment — you can't cancel it.

---

## Part 2: Cloudflare Setup

### 2.1 Add Your Domain

1. Buy domain on Namecheap (or wherever)
2. Go to **https://dash.cloudflare.com** and sign up (or log in)
3. Click **Add a Site**
4. Enter your domain (e.g., `layer8.example.com`), click **Add site**
5. Select the **Free** plan, click **Continue**
6. Cloudflare will scan existing DNS records — you can remove any it finds (they're from the registrar's defaults)
7. Cloudflare will give you **two nameservers** (e.g., `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`)
8. **Change nameservers on your registrar:**
   - **Namecheap:** Go to Dashboard > Domain List > your domain > click **Manage** > Nameservers > select **Custom DNS** > paste the two Cloudflare nameservers > click the green checkmark
   - **Other registrars:** Look for "DNS" or "Nameservers" in your domain settings
9. Back in Cloudflare, click **Done, check nameservers**
10. Wait 5-60 minutes for propagation. Cloudflare will email you when it's active.

### 2.2 DNS Records

Once the domain is active in Cloudflare:

1. Go to **DNS** > **Records** in the Cloudflare dashboard
2. Click **Add record**
3. Add these two records:

| Type | Name | Content | Proxy status |
|------|------|---------|-------------|
| A | `@` | `<your-elastic-ip>` | **Proxied** (orange cloud ON) |
| A | `www` | `<your-elastic-ip>` | **Proxied** (orange cloud ON) |

**Important:** The orange cloud (Proxied) means traffic goes through Cloudflare. This is required for the Worker and all protections to work. If the cloud is grey (DNS only), Cloudflare is bypassed and your origin IP is exposed.

### 2.3 SSL/TLS Settings

Go to **SSL/TLS** in the Cloudflare dashboard left sidebar:

1. **Overview:** Set encryption mode to **Full (Strict)**
   - This means Cloudflare <-> your server uses HTTPS with a valid cert
   - Your server already has an Origin Certificate (or self-signed cert) from the launcher

2. **Edge Certificates** (sub-tab):
   - Always Use HTTPS: **ON**
   - Minimum TLS Version: **TLS 1.2**
   - Opportunistic Encryption: **ON**
   - TLS 1.3: **ON**

3. **Origin Server** (sub-tab) — Generate the Origin Certificate if you haven't already:
   - Click **Create Certificate**
   - **Private key type:** RSA (2048)
   - **Hostnames:** Leave the defaults (your domain and `*.yourdomain.com`)
   - **Certificate validity:** 15 years
   - Click **Create**
   - **Copy both the certificate PEM and the private key PEM** — the private key is only shown once
   - If you skipped the certificate during install, now run on your server:
     ```bash
     sudo bash launcher.sh setup-ssl
     ```
     and paste the certificate and key when prompted.

### 2.4 Security Settings

Go to **Security** in the Cloudflare dashboard left sidebar:

1. **WAF** (sub-tab):
   - Click **Managed rules** > Enable the **Cloudflare Managed Ruleset** (free tier includes basic rules)
   - Enable **OWASP Core Rule Set** if available on your plan
2. **Bots** (sub-tab):
   - **Bot Fight Mode:** **ON** (free tier) — this challenges known bot signatures
3. **Settings** (sub-tab):
   - **Security Level:** Set to **Medium** or **High**
   - **Challenge Passage:** 30 minutes (how long a solved challenge is valid)
   - **Browser Integrity Check:** **ON** — blocks requests with known bad User-Agent headers

### 2.5 Performance Settings

Go to **Speed** in the left sidebar:

1. **Optimization > Content Optimization:**
   - Auto Minify: **JS, CSS, HTML** all ON
   - Brotli: **ON**
   - These handle compression at the Cloudflare edge — nginx on the origin does not compress (the launcher already configured this)

Go to **Caching** in the left sidebar:

2. **Configuration:**
   - Cache Level: **Standard**
   - Browser Cache TTL: **4 hours**

3. **Tiered Cache:**
   - Always Online: **ON** (serves cached pages if your origin goes down)

---

## Part 3: Cloudflare Worker — Advanced Client Fingerprinting

This is the JA4-style protection layer. A Cloudflare Worker intercepts every request and analyzes the client before it reaches your server.

### 3.1 What the Worker Detects

| Layer | What it checks | Blocks |
|-------|---------------|--------|
| **Honeypot paths** | Requests to paths no real user would visit | Instant block + IP flagged for any scanner doing recon |
| **User-Agent filtering** | Known scanner/bot UA strings | curl, wget, python-requests, sqlmap, nikto, gobuster, dirb, wfuzz, nmap |
| **Header order analysis** | Sequence of HTTP headers | Burp Suite, custom scripts (browsers have predictable header ordering) |
| **Bot detection** | Automation patterns in headers | Selenium, Puppeteer, PhantomJS, headless Chrome |
| **ASN filtering** | Network provider of the client | Known hosting/VPN/proxy ASNs (DigitalOcean, AWS, OVH scanner ranges) |
| **Geo filtering** | Client country | Optional — restrict to expected countries |
| **Proxy detection** | sec-ch-ua, sec-fetch-*, proxy headers | Burp Suite, ZAP, custom proxy tools |
| **Behavioral analysis** | Request rate, patterns | Rapid scanning, directory brute-forcing |
| **TLS fingerprinting** | Cloudflare exposes `cf.botManagement.ja3Hash` and `ja4` | Non-browser TLS stacks (Burp uses Java TLS, not browser TLS) |

### 3.2 Create the Worker

You'll need Node.js on your **local machine** (not the server) to use Wrangler, the Cloudflare CLI. If you don't have Node.js locally, you can also do this on the EC2 instance.

1. Install Wrangler:
```bash
npm install -g wrangler
```

2. Authenticate with Cloudflare:
```bash
wrangler login
# This opens a browser window to authorize Wrangler
```

3. Create the project:
```bash
wrangler init layer8-shield -y
cd layer8-shield
```

4. Edit `wrangler.jsonc` to match this configuration:
```json
{
    "$schema": "node_modules/wrangler/config-schema.json",
    "name": "layer8-shield",
    "main": "src/index.ts",
    "compatibility_date": "2026-03-10",
    "vars": {
        "ORIGIN_HOST": "your-domain.com",
        "BLOCKED_USER_AGENTS": "curl,wget,python-requests,nmap,nikto,burp,sqlmap,gobuster,dirb,wfuzz,httpie,axios,postman",
        "ALLOWED_COUNTRIES": "",
        "BLOCK_THRESHOLD": "70",
        "CHALLENGE_THRESHOLD": "40",
        "ENABLE_GEO_FILTER": "false",
        "ENABLE_ASN_FILTER": "true",
        "ENABLE_BOT_DETECTION": "true",
        "ENABLE_HEADER_ANALYSIS": "true",
        "ENABLE_HONEYPOT": "true",
        "BLOCKED_ASNS": "14061,16276,24940,63949,14618,16509",
        "PENTEST_MODE": "false",
        "PENTEST_IPS": ""
    }
}
```

> **Note:** Wrangler now uses `wrangler.jsonc` instead of `wrangler.toml`. The `BLOCKED_ASNS` correspond to: 14061=DigitalOcean, 16276=OVH, 24940=Hetzner, 63949=Linode, 14618/16509=AWS.

5. Create `src/index.ts` with the following content:
```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIP = request.headers.get('cf-connecting-ip');
    const country = request.cf?.country || 'XX';
    const asn = request.cf?.asn || 0;
    const userAgent = request.headers.get('user-agent') || '';

    let riskScore = 0;
    const flags = [];

    // --- Layer 0: Honeypot Paths ---
    // These paths are never used by the real app. Any request to them
    // is guaranteed to be a scanner doing recon or brute-forcing.
    if (env.ENABLE_HONEYPOT === 'true') {
      const honeypotPaths = [
        '/wp-admin', '/wp-login.php', '/wp-content',
        '/administrator', '/admin.php',
        '/.env', '/.git', '/.git/config', '/.git/HEAD',
        '/config.php', '/phpinfo.php', '/info.php',
        '/phpmyadmin', '/pma',
        '/debug', '/debug/default/view',
        '/actuator', '/actuator/health',
        '/server-status', '/server-info',
        '/xmlrpc.php', '/wp-json',
        '/api/v1/debug', '/api/swagger',
        '/console', '/solr', '/manager/html',
        '/.aws/credentials', '/.docker',
        '/backup.sql', '/dump.sql', '/db.sql',
        '/test', '/test.php',
      ];

      const path = url.pathname.toLowerCase();
      if (honeypotPaths.some(hp => path === hp || path.startsWith(hp + '/'))) {
        console.log(JSON.stringify({
          action: 'HONEYPOT',
          ip: clientIP,
          country,
          asn,
          path: url.pathname,
          ua: userAgent.substring(0, 100),
          timestamp: new Date().toISOString()
        }));

        return new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    // --- Layer 1: User-Agent Filtering ---
    const blockedUAs = (env.BLOCKED_USER_AGENTS || '').toLowerCase().split(',');
    const uaLower = userAgent.toLowerCase();
    for (const blocked of blockedUAs) {
      if (blocked && uaLower.includes(blocked.trim())) {
        riskScore += 100;
        flags.push(`blocked_ua:${blocked.trim()}`);
      }
    }

    if (!userAgent || userAgent.length < 10) {
      riskScore += 40;
      flags.push('empty_or_short_ua');
    }

    // --- Layer 2: Header Order Analysis ---
    if (env.ENABLE_HEADER_ANALYSIS === 'true') {
      const headerScore = analyzeHeaderOrder(request);
      riskScore += headerScore.score;
      if (headerScore.flags.length > 0) {
        flags.push(...headerScore.flags);
      }
    }

    // --- Layer 3: Bot/Automation Detection ---
    if (env.ENABLE_BOT_DETECTION === 'true') {
      const botScore = detectBot(request);
      riskScore += botScore.score;
      if (botScore.flags.length > 0) {
        flags.push(...botScore.flags);
      }
    }

    // --- Layer 4: ASN Filtering ---
    if (env.ENABLE_ASN_FILTER === 'true') {
      const blockedASNs = (env.BLOCKED_ASNS || '').split(',').map(a => parseInt(a.trim()));
      if (blockedASNs.includes(asn)) {
        riskScore += 50;
        flags.push(`blocked_asn:${asn}`);
      }
    }

    // --- Layer 5: Geo Filtering ---
    if (env.ENABLE_GEO_FILTER === 'true' && env.ALLOWED_COUNTRIES) {
      const allowed = env.ALLOWED_COUNTRIES.split(',').map(c => c.trim());
      if (allowed.length > 0 && !allowed.includes(country)) {
        riskScore += 60;
        flags.push(`blocked_country:${country}`);
      }
    }

    // --- Layer 6: TLS Fingerprinting (JA3/JA4) ---
    const tlsVersion = request.cf?.tlsVersion || '';
    if (tlsVersion && !tlsVersion.startsWith('TLS')) {
      riskScore += 30;
      flags.push(`old_tls:${tlsVersion}`);
    }

    // --- Layer 7: Proxy/Interception Detection ---
    // Real browsers on HTTPS always send sec-ch-ua. Burp's Java TLS stack doesn't.
    const secChUa = request.headers.get('sec-ch-ua');
    if (!secChUa && url.protocol === 'https:') {
      riskScore += 25;
      flags.push('missing_sec_ch_ua');
    }

    // Real browsers send sec-fetch-dest on navigation requests
    const secFetchDest = request.headers.get('sec-fetch-dest');
    const secFetchMode = request.headers.get('sec-fetch-mode');
    const secFetchSite = request.headers.get('sec-fetch-site');

    // Navigation requests without sec-fetch-dest = proxy tool
    if (!secFetchDest && !secFetchMode) {
      riskScore += 20;
      flags.push('missing_sec_fetch');
    }

    // API calls from same origin should be sec-fetch-site: same-origin
    // Proxies often set cross-site or omit it entirely
    if (url.pathname.startsWith('/api/') && secFetchSite === 'cross-site') {
      riskScore += 15;
      flags.push('api_cross_site_fetch');
    }

    // Detect proxy-injected headers
    const proxyHeaders = ['x-burp-customheader', 'x-zaproxy', 'x-proxy-id'];
    for (const ph of proxyHeaders) {
      if (request.headers.get(ph)) {
        riskScore += 50;
        flags.push(`proxy_header:${ph}`);
      }
    }

    // --- Decision: Block / Challenge / Allow ---
    const blockThreshold = parseInt(env.BLOCK_THRESHOLD) || 70;
    const challengeThreshold = parseInt(env.CHALLENGE_THRESHOLD) || 40;

    const isPentestMode = env.PENTEST_MODE === 'true';
    const pentestIPs = (env.PENTEST_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean);
    const isPentester = isPentestMode && pentestIPs.includes(clientIP);

    if (riskScore >= blockThreshold) {
      console.log(JSON.stringify({
        action: isPentester ? 'PENTEST_BLOCKED' : 'BLOCKED',
        ip: clientIP, country, asn,
        ua: userAgent.substring(0, 100),
        score: riskScore, flags,
        path: url.pathname,
        timestamp: new Date().toISOString()
      }));

      const blockHeaders = { 'Content-Type': 'text/plain' };
      if (isPentester) {
        blockHeaders['Retry-After'] = '60';
        blockHeaders['X-Layer8-Pentest'] = 'true';
      }

      return new Response('Access Denied', {
        status: 403,
        headers: blockHeaders
      });

    } else if (riskScore >= challengeThreshold) {
      console.log(JSON.stringify({
        action: isPentester ? 'PENTEST_CHALLENGED' : 'CHALLENGED',
        ip: clientIP, country, asn,
        ua: userAgent.substring(0, 100),
        score: riskScore, flags,
        path: url.pathname,
        timestamp: new Date().toISOString()
      }));

      const challengeHeaders = new Headers(request.headers);
      challengeHeaders.set('X-Layer8-Risk', riskScore.toString());
      challengeHeaders.set('X-Layer8-Flags', flags.join(','));
      if (isPentester) challengeHeaders.set('X-Layer8-Pentest', 'true');
      const modifiedRequest = new Request(request, { headers: challengeHeaders });
      return fetch(modifiedRequest);
    }

    return fetch(request);
  }
};

// --- Header Order Analysis ---
function analyzeHeaderOrder(request) {
  const score = { score: 0, flags: [] };
  const headers = [...request.headers.keys()];

  const hasSechHeaders = headers.some(h => h.startsWith('sec-'));
  const hasAcceptLanguage = headers.includes('accept-language');

  if (!hasSechHeaders) {
    score.score += 15;
    score.flags.push('no_sec_headers');
  }

  if (!hasAcceptLanguage) {
    score.score += 10;
    score.flags.push('no_accept_language');
  }

  const suspiciousHeaders = ['x-forwarded-for', 'x-scanner', 'x-burp'];
  for (const h of suspiciousHeaders) {
    if (headers.includes(h)) {
      score.score += 20;
      score.flags.push(`suspicious_header:${h}`);
    }
  }

  if (headers.length < 5) {
    score.score += 20;
    score.flags.push(`too_few_headers:${headers.length}`);
  } else if (headers.length > 30) {
    score.score += 10;
    score.flags.push(`too_many_headers:${headers.length}`);
  }

  return score;
}

// --- Bot/Automation Detection ---
function detectBot(request) {
  const score = { score: 0, flags: [] };
  const ua = request.headers.get('user-agent') || '';

  const headlessPatterns = [
    'headlesschrome', 'phantomjs', 'selenium', 'puppeteer',
    'playwright', 'webdriver', 'chrome-lighthouse',
    'googlebot', 'bingbot', 'yandexbot', 'baiduspider',
    'semrush', 'ahrefs', 'mj12bot', 'dotbot'
  ];

  const uaLower = ua.toLowerCase();
  for (const pattern of headlessPatterns) {
    if (uaLower.includes(pattern)) {
      score.score += 40;
      score.flags.push(`headless:${pattern}`);
    }
  }

  const accept = request.headers.get('accept') || '';
  if (accept === '*/*' || accept === '') {
    score.score += 15;
    score.flags.push('generic_accept');
  }

  const connection = request.headers.get('connection') || '';
  if (connection.toLowerCase() === 'close') {
    score.score += 10;
    score.flags.push('connection_close');
  }

  return score;
}
```

### 3.3 Deploy the Worker

```bash
wrangler deploy
```

You should see output confirming the Worker was published.

### 3.4 Route the Worker to Your Domain

1. Go to **Cloudflare Dashboard** > your domain > **Workers Routes** (in the left sidebar under Workers & Pages)
2. Click **Add route**
3. **Route:** `your-domain.com/*`
4. **Worker:** `layer8-shield`
5. Click **Save**
6. Add another route: `www.your-domain.com/*` → `layer8-shield`

Now ALL traffic to your domain goes through the Worker first.

### 3.5 Monitor the Worker

```bash
wrangler tail
```

You'll see real-time JSON logs:
```
{"action":"HONEYPOT","ip":"1.2.3.4","country":"RU","asn":14061,"path":"/.env",...}
{"action":"BLOCKED","ip":"1.2.3.4","country":"US","asn":14061,"score":100,"flags":["blocked_ua:sqlmap"],...}
{"action":"CHALLENGED","ip":"5.6.7.8","country":"DE","asn":3320,"score":55,"flags":["no_sec_headers","generic_accept"],...}
```

Press Ctrl+C to stop tailing.

### 3.6 JA4 / TLS Fingerprinting (Enhanced)

Full JA4 fingerprinting requires **Cloudflare Business or Enterprise plan** (via `cf.botManagement.ja3Hash` and `cf.botManagement.ja4`). On the free plan, you get:

- `request.cf.tlsVersion` — TLS version
- `request.cf.tlsCipher` — cipher suite
- `request.cf.clientTrustScore` — Cloudflare's bot score (limited on free)

If you upgrade to Business ($200/mo), you get:
- Full JA3/JA4 hash access
- Bot Management with ML-based detection
- You can match exact JA4 hashes for Burp Suite, Python requests, Go net/http, etc.

**Free plan workaround:** The header order analysis + UA filtering + ASN blocking catches the majority of automated tools. Burp Suite in particular is caught by:
1. Missing `sec-ch-ua` / `sec-fetch-*` headers (Java HTTP client doesn't send these)
2. Different header ordering than real browsers
3. Generic `Accept: */*` header
4. If using default config: `burp` in User-Agent

**Limitations to be aware of:** A determined attacker who configures Burp to use a browser profile with proper headers, correct ordering, and a realistic UA string can bypass these heuristics. This layer raises the bar significantly but is not impenetrable. The app's own auth + MFA is the final line of defense.

### 3.7 Challenge Tier via Firewall Rules

The Worker sets `X-Layer8-Risk` and `X-Layer8-Flags` headers on mid-range requests. To trigger a Cloudflare managed challenge based on these:

1. Go to **Security** > **WAF** > **Custom rules** tab
2. Click **Create rule**
3. **Rule name:** `Layer8 Challenge Mid-Risk`
4. Switch to **Edit expression** and paste:
   ```
   (http.request.headers["x-layer8-risk"][0] gt "39")
   ```
5. **Choose action:** Managed Challenge
6. Click **Deploy**

This means requests scored 40-69 by the Worker get a Cloudflare CAPTCHA. A real PM solves it once and is good for 30 minutes (per Challenge Passage setting). An automated tool fails.

---

## Part 4: Additional Hardening

### 4.1 Cloudflare Page Rules (Free)

Go to **Rules** > **Page Rules** in the Cloudflare dashboard:

1. Click **Create Page Rule** (position 1 — top priority):
   - URL: `www.your-domain.com/*`
   - Setting: **Forwarding URL** (301 redirect)
   - Target: `https://your-domain.com/$1`
   - Click **Save and Deploy**
   - Move this rule to **position 1** so it runs first

> **Note:** Cloudflare free plan does NOT have "Redirect Rules" under the Rules menu. Use Page Rules with Forwarding URL instead.

2. Click **Create Page Rule**:
   - URL: `your-domain.com/api/*`
   - Settings: Cache Level = **Bypass**, Security Level = **High**
   - Click **Save and Deploy**

3. Click **Create Page Rule**:
   - URL: `your-domain.com/uploads/*`
   - Settings: Cache Level = **Standard**, Edge Cache TTL = **a month**
   - Click **Save and Deploy**

### 4.2 Rate Limiting (Cloudflare)

Free plan includes 1 rate limiting rule:

1. Go to **Security** > **WAF** > **Rate limiting rules** tab
2. Click **Create rule**
3. **Rule name:** `Auth endpoint rate limit`
4. **If incoming requests match:** URI Path contains `/api/auth/`
5. **Rate:** 10 requests per **10 seconds**, per IP
6. **Then take action:** Block for **10 seconds**

7. Click **Deploy**

> **Note:** Cloudflare free plan only allows 10-second periods and a fixed 10-second block duration. Paid plans allow longer periods and custom block durations.

Your Express backend already has rate limiting, but Cloudflare catches abuse before it hits your server.

### 4.3 Firewall Rules (Cloudflare)

Go to **Security** > **WAF** > **Custom rules** tab. You have 5 free rules; create these:

1. **Block known bad bots:**
   - Expression: `(cf.client.bot) or (cf.threat_score gt 30)`
   - Action: **Block**

2. **Challenge suspicious countries** (if you know your user base):
   - Expression: `(ip.geoip.country ne "PT") and (ip.geoip.country ne "ES")`
   - Action: **Managed Challenge**
   - > **Note:** Skip this rule if you've already configured `ALLOWED_COUNTRIES` in the Worker.

3. **Block direct IP access** (someone bypassing Cloudflare):
   - Expression: `(http.host eq "<your-elastic-ip>")`
   - Action: **Block**

4. **Challenge mid-risk Worker traffic** (already created in section 3.7):
   - Expression: `(http.request.headers["x-layer8-risk"][0] gt "39")`
   - Action: **Managed Challenge**

### 4.4 Hide Your Origin IP

Your Elastic IP should NEVER be publicly discoverable:

1. **Don't add an A record without the Cloudflare proxy** (always orange cloud)
2. **Don't send emails from the server** (MX records reveal origin)
3. **Check with:** `dig your-domain.com` should show Cloudflare IPs, not your EC2 IP
4. **Historical check:** Search Shodan/Censys for your domain — if the IP was ever exposed, consider changing your Elastic IP

---

## Part 5: Backups and Monitoring

Backups, health monitoring, and log rotation are all set up automatically by `launcher.sh install`. This section covers how they work and how to customize them.

### 5.1 Automated Backups

The installer creates `/opt/layer8/scripts/backup.sh` which runs daily at 2 AM via cron:
- Creates a consistent SQLite snapshot using `.backup` (safe while the app is running)
- Compresses with gzip
- Keeps the last 7 local backups in `/opt/layer8/backups/`

**Enable S3 offsite backups** (recommended):
```bash
# Configure AWS CLI (if not already done in section 1.9)
aws configure

# Create bucket (one time)
aws s3 mb s3://layer8-backups-<unique-suffix> --region eu-west-1

# Edit the backup script and uncomment the S3 lines
sudo nano /opt/layer8/scripts/backup.sh

# Set a lifecycle policy to auto-expire old backups (30 days)
aws s3api put-bucket-lifecycle-configuration \
  --bucket layer8-backups-<unique-suffix> \
  --lifecycle-configuration '{
    "Rules": [{"ID": "expire-old","Status": "Enabled",
      "Filter": {"Prefix": ""},
      "Expiration": {"Days": 30}}]
  }'
```

**Manual backup:**
```bash
sudo bash launcher.sh backup
```

**Restore from backup:**
```bash
sudo bash launcher.sh stop
gunzip -c /opt/layer8/backups/layer8-20250101-020000.db.gz > /opt/layer8/backend/prod.db
sudo bash launcher.sh start

# Or from S3:
aws s3 cp s3://layer8-backups-<unique-suffix>/layer8-20250101-020000.db.gz /tmp/
gunzip -c /tmp/layer8-20250101-020000.db.gz > /opt/layer8/backend/prod.db
sudo bash launcher.sh start
```

### 5.2 Health Monitoring

The installer creates `/opt/layer8/scripts/health-check.sh` which runs every 5 minutes via cron:
- Checks that the Layer8 backend, Redis, and nginx are running
- Checks disk usage (alerts if > 85%)
- Checks available memory (alerts if < 100MB)
- Hits the `/api/health` endpoint to verify the app is responding

Alerts are logged to `/var/log/layer8-health.log`. To also receive email alerts:
```bash
sudo nano /opt/layer8/scripts/health-check.sh
# Set ALERT_EMAIL="you@example.com"
```

> **Tip:** If you don't want to set up email on the server, replace the `mail` commands in the script with a curl to a Slack/Discord webhook or ntfy.sh.

### 5.3 Log Rotation

The installer configures logrotate for both app logs and system logs:
- App logs (`/opt/layer8/logs/*.log`): rotated daily, kept for 14 days, compressed
- System logs (`/var/log/layer8-*.log`): rotated weekly, kept for 4 weeks, compressed

### 5.4 Optional: CloudWatch

If you want historical metrics and a dashboard without running a monitoring stack:

```bash
sudo apt install amazon-cloudwatch-agent -y
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
# Select: disk utilization, memory utilization, log collection

sudo systemctl enable amazon-cloudwatch-agent
sudo systemctl start amazon-cloudwatch-agent
```

Then set up CloudWatch Alarms in the AWS console for disk > 85%, memory < 100MB, etc. This costs very little at low volumes.

---

## Part 6: Pentest Mode

When you bring in pentesters, you want them to experience the full defense stack — detection, scoring, rate limiting, challenges — but you don't want them permanently blocked, which would force you to babysit the Cloudflare dashboard and keep unblocking their IPs.

The goal: **all defenses stay active and visible, but blocks are short-lived instead of permanent.** Pentesters feel the friction, see the detections, and can report on what works and what doesn't — without you being on call to unlock them every 10 minutes.

### 6.1 Worker Changes — Add Pentest Mode

Use the `pentest.sh` script to enable/disable pentest mode:

```bash
# Enable pentest mode with pentester IPs
cd ~/Documents/Projects/layer8-shield/layer8-shield
./pentest.sh on 203.0.113.5,198.51.100.10

# Disable after pentest
./pentest.sh off
```

The script uses `wrangler secret put` to set the vars at runtime (secrets override `wrangler.jsonc` vars without needing a redeploy). It also prints the manual Cloudflare dashboard changes you need to make — those can't be automated on the free plan (the Cloudflare API requires a paid plan for WAF rule modifications).

Deploy the updated worker code (only needed the first time, or if you've changed the worker source):
```bash
cd ~/Documents/Projects/layer8-shield/layer8-shield
wrangler deploy
```



The key behavior difference:

| Scenario | Normal mode | Pentest mode (for listed IPs) |
|----------|-------------|-------------------------------|
| Score >= 70 (block) | Hard 403, permanent until IP changes | 403 with `Retry-After: 60`, next request evaluated fresh |
| Score 40-69 (challenge) | Cloudflare managed challenge (CAPTCHA) | Request passed through with risk headers visible, no CAPTCHA |
| Honeypot path hit | 404, logged | 404, logged (unchanged — honeypots stay as-is) |
| Rate limit (Cloudflare) | Blocked for 10 seconds | Blocked for 10 seconds (fixed on free plan) |

### 6.2 Cloudflare Dashboard Changes

These are manual changes you make in the Cloudflare dashboard. The `pentest.sh` script prints reminders for these. They affect all traffic, not just pentester IPs, so revert them after the pentest.

1. **Bot Fight Mode — temporarily disable:**
   - Go to **Security** > **Bots**
   - Turn **Bot Fight Mode** to **OFF**
   - Bot Fight Mode can issue Cloudflare-level blocks that are invisible to your Worker and hard to reason about during a pentest. Turning it off lets the pentesters interact directly with your Worker's detection logic, which is what you actually want them to test.

2. **Firewall rules — soften permanent blocks:**
   - Go to **Security** > **WAF** > **Custom rules**
   - Find the `Block known bad bots` rule: `(cf.client.bot) or (cf.threat_score gt 30)`
   - Change its action from **Block** to **Managed Challenge**

> **Note:** Rate limiting on the free plan is fixed at 10-second periods with a 10-second block duration — it cannot be changed. Pentesters will hit the rate limit and it will clear automatically after 10 seconds.

### 6.3 What NOT to Change

Keep all of these exactly as they are during the pentest:

- **The Worker's detection logic** — all scoring, header analysis, UA filtering, ASN checks, honeypot paths. The pentesters should trigger every detection layer so they can report on what catches what.
- **The Cloudflare security group restriction** — pentesters must go through Cloudflare, not hit your origin directly. If they can bypass Cloudflare, that's a finding.
- **The app's own auth and MFA** — this is the final line of defense and should be tested under realistic conditions.
- **SSL/TLS settings** — keep Full (Strict) and TLS 1.2 minimum.

### 6.4 Monitoring During the Pentest

Use `wrangler tail` filtered to pentester actions:

```bash
wrangler tail --format json | grep -E "PENTEST_BLOCKED|PENTEST_CHALLENGED|HONEYPOT"
```

This gives you real-time visibility into what they're triggering without the noise of normal traffic.

You can also share `wrangler tail` output with the pentesters in real time (e.g., screen share or a shared terminal) so they can see exactly what signals they're tripping. This makes the engagement more productive — they can try to evade specific detections and report on what works.

### 6.5 Reverting After the Pentest

Once the pentest is complete, revert everything:

1. **Worker:** Run the pentest script to disable pentest mode:
   ```bash
   cd ~/Documents/Projects/layer8-shield/layer8-shield
   ./pentest.sh off
   ```

2. **Cloudflare dashboard** (the script will remind you of these):
   - **Bot Fight Mode:** Turn it back **ON** (Security > Bots)
   - **Firewall rules:** Change `Block known bad bots` back from Managed Challenge to **Block** (Security > WAF > Custom rules)

3. **Review pentest findings** and adjust detection thresholds or scoring weights based on what they found. For example, if they bypassed header analysis by replaying a real browser's header set, consider adding more granular ordering checks or investing in the Cloudflare Business plan for JA4 hashes.

---

## Monthly Cost Summary

| Resource | Monthly Cost |
|----------|-------------|
| EC2 t4g.small (on-demand) | ~$12.26 |
| EBS 20GB gp3 | ~$1.60 |
| Elastic IP (attached) | Free |
| Cloudflare (free plan) | Free |
| Cloudflare Worker (free tier: 100k req/day) | Free |
| S3 backups (~1GB) | ~$0.03 |
| CloudWatch (optional) | ~$1-3 |
| **Total** | **~$14-17/mo** |

With 1-year Savings Plan: **~$10-13/mo**
With free tier (first 12 months, t4g.micro): **~$1.60/mo**

---

## Quick Reference — Deployment Checklist

### AWS Account
- [ ] Create AWS account at aws.amazon.com
- [ ] Enable MFA on root account
- [ ] Create IAM user `layer8-admin` with EC2/S3/VPC permissions
- [ ] Enable MFA on IAM user
- [ ] Set $25/mo billing budget
- [ ] Enable free tier usage alerts
- [ ] Select region (e.g., eu-west-1 Ireland)

### EC2 Instance
- [ ] Create key pair `layer8-key` (save the .pem/.ppk file securely)
- [ ] Create security group `layer8-sg` (SSH from your IP, HTTP/HTTPS from Cloudflare IPs)
- [ ] Launch t4g.small (or t4g.micro for free tier), Ubuntu 24.04 ARM64, 20GB gp3
- [ ] Allocate Elastic IP and associate it with the instance
- [ ] SSH in successfully
- [ ] Set up Cloudflare IP auto-update script (weekly cron)
- [ ] Run `sudo bash launcher.sh install`
- [ ] Verify: `sudo bash launcher.sh status` shows all services active

### Cloudflare
- [ ] Add domain to Cloudflare, change nameservers on registrar
- [ ] Wait for domain to become active (check email)
- [ ] Add A records pointing to Elastic IP (proxied/orange cloud)
- [ ] Set SSL/TLS to Full (Strict)
- [ ] Generate Origin Certificate and install via `sudo bash launcher.sh setup-ssl`
- [ ] Enable Bot Fight Mode, Browser Integrity Check
- [ ] Set Security Level to Medium or High

### Worker & Firewall
- [ ] Install Wrangler, authenticate with `wrangler login`
- [ ] Create layer8-shield project with wrangler.jsonc and src/index.ts
- [ ] Deploy with `wrangler deploy`
- [ ] Add Worker routes for your domain and www subdomain
- [ ] Create firewall rules (block bots, challenge suspicious geos, block direct IP, challenge mid-risk)
- [ ] Create page rules (www redirect, bypass cache for API, cache uploads)
- [ ] Create rate limiting rule for auth endpoints
- [ ] Test: `wrangler tail` to monitor Worker decisions

### Post-Install
- [ ] Enable S3 offsite backups (edit backup.sh, uncomment S3 lines)
- [ ] Enable health check alerts (edit health-check.sh, set ALERT_EMAIL or webhook)
- [ ] Test restore from backup at least once
- [ ] Optionally set up CloudWatch for dashboards/alerts
- [ ] Consider Savings Plan after 2-4 weeks of stable operation

### Verification
- [ ] Verify origin IP is hidden: `dig your-domain.com` shows Cloudflare IPs
- [ ] Test honeypot: `curl https://your-domain.com/.env` returns 404
- [ ] Test UA blocking: `curl -A "sqlmap" https://your-domain.com/` returns 403
- [ ] Login to Layer8, reset admin password, set up TOTP

### Pentest Mode (Temporary)
- [ ] Enable pentest mode: `./pentest.sh on <pentester-ips>`
- [ ] Manual dashboard change: Bot Fight Mode **OFF** (Security > Bots)
- [ ] Manual dashboard change: "Block known bad bots" rule from Block to **Managed Challenge** (Security > WAF > Custom rules)
- [ ] Monitor with `wrangler tail` during the engagement
- [ ] **After pentest:** run `./pentest.sh off`, then revert dashboard changes (Bot Fight Mode ON, firewall rule back to Block)