#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Contabo VPS (Ubuntu 24.04, x86_64) ni tayyorlash (T-115, 11 §11.4)
#   ssh-copy-id root@IP                  # kalit (yoki Contabo panelida buyurtmada)
#   scp infra/vm-setup.sh root@IP: && ssh root@IP 'bash vm-setup.sh'
# Natija: `deploy` foydalanuvchisi (docker, sudo), ufw (22/80/443), fail2ban,
# swap, SSH faqat kalit bilan; umumiy kirish uchun `edge` tarmog'i va /opt/edge,
# /opt/www, /opt/crm papkalari. Qayta ishga tushirish xavfsiz (idempotent).
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

[ "$(id -u)" = 0 ] || { echo "root (yoki sudo) bilan ishga tushiring" >&2; exit 1; }
APP_USER="${APP_USER:-deploy}"
SWAP_GB="${SWAP_GB:-4}"
# SSH orqali: apt va needrestart hech narsa so'ramasin
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

apt-get update && apt-get -y upgrade
# rsync + python3 — frontend build'ini yuklash (cheklangan kalit `rrsync` orqali, infra/README.md)
apt-get -y install docker.io docker-compose-v2 ufw fail2ban age unattended-upgrades snapd rsync python3
# AWS CLI (zaxira R2'ga): Ubuntu 24.04 apt'da `awscli` paketi yo'q — rasmiy snap
snap list aws-cli >/dev/null 2>&1 || snap install aws-cli --classic

# Deploy foydalanuvchisi — Contabo faqat root beradi. Parolsiz: kirish faqat kalit bilan,
# sudo parol so'ramaydi (docker guruhi baribir root darajasidagi huquq beradi)
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos '' "$APP_USER"
usermod -aG docker,sudo "$APP_USER"
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$APP_USER"
chmod 440 "/etc/sudoers.d/90-$APP_USER"
visudo -cf "/etc/sudoers.d/90-$APP_USER" >/dev/null

# SSH kalitlari: root'nikidan va SSH_PUBKEY dan (masalan GitHub Actions deploy kaliti)
KEYS="/home/$APP_USER/.ssh/authorized_keys"
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
touch "$KEYS"
if [ -s /root/.ssh/authorized_keys ]; then cat /root/.ssh/authorized_keys >> "$KEYS"; fi
if [ -n "${SSH_PUBKEY:-}" ]; then echo "$SSH_PUBKEY" >> "$KEYS"; fi
sort -u -o "$KEYS" "$KEYS"
chown "$APP_USER:$APP_USER" "$KEYS" && chmod 600 "$KEYS"

# Swap — Postgres cho'qqilari uchun
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GB}G" /swapfile && chmod 600 /swapfile
  mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Faqat SSH va HTTP(S). Docker e'lon qilgan portlar ufw'ni chetlab o'tadi — shuning uchun
# compose'da portni FAQAT Caddy (80/443) chiqaradi; baza va Redis tashqariga chiqmaydi
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# SSH faqat kalit bilan, root kira olmaydi — FAQAT deploy foydalanuvchisida kalit bo'lsa
# (aks holda serverdan qulflanib qolinardi). Fayl nomi `10-` — 50-cloud-init.conf dan ustun
if [ -s "$KEYS" ]; then
  HARDENING=/etc/ssh/sshd_config.d/10-crm-hardening.conf
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin no\n' > "$HARDENING"
  # Sozlama buzuq bo'lsa — qaytariladi: keyingi qayta yuklashda SSH ishlamay qolmasin
  sshd -t || { rm -f "$HARDENING"; echo "sshd sozlamasi xato — o'zgarish bekor qilindi" >&2; exit 1; }
  systemctl reload ssh
else
  echo "OGOHLANTIRISH: $APP_USER uchun SSH kaliti yo'q — parol bilan kirish YOPILMADI." >&2
  echo "Kalit qo'shing (ssh-copy-id yoki SSH_PUBKEY=...) va skriptni qayta ishga tushiring." >&2
fi

# Umumiy kirish (bitta Caddy barcha loyihalar uchun) va loyihalar papkalari
docker network inspect edge >/dev/null 2>&1 || docker network create edge
install -d -o "$APP_USER" -g "$APP_USER" /opt/edge /opt/edge/sites /opt/www /opt/www/crm /opt/crm /opt/crm/secrets
chmod 700 /opt/crm/secrets
echo "Tayyor: $(uname -m), $(nproc) CPU, $(free -g | awk '/^Mem:/{print $2}') GB RAM."
echo "Endi '$APP_USER' bilan kiring: ssh $APP_USER@IP. Keyingi qadam — infra/README.md, 2-bo'lim"
