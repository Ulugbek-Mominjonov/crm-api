#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Oracle Always Free VM (Ubuntu 24.04 ARM64) ni tayyorlash (T-115, 11 §11.4)
#   scp infra/vm-setup.sh ubuntu@IP: && ssh ubuntu@IP 'sudo bash vm-setup.sh'
# Qayta ishga tushirish xavfsiz (idempotent).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "sudo bilan ishga tushiring" >&2; exit 1; }
APP_USER="${APP_USER:-ubuntu}"
SWAP_GB="${SWAP_GB:-4}"

apt-get update && apt-get -y upgrade
apt-get -y install docker.io docker-compose-v2 ufw fail2ban netfilter-persistent age awscli unattended-upgrades
usermod -aG docker "$APP_USER"

# Swap — Postgres cho'qqilari uchun
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GB}G" /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Faqat kerakli portlar (ufw)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Oracle'ning o'z iptables qoidalari (VCN Security List'da ham 80/443 ochilsin!)
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
netfilter-persistent save

# SSH faqat kalit bilan
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh

install -d -o "$APP_USER" -g "$APP_USER" /opt/crm /opt/crm/secrets
chmod 700 /opt/crm/secrets
echo "Tayyor. Keyingi qadam: infra/README.md — '2. Birinchi ishga tushirish'"
