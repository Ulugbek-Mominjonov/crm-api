#!/usr/bin/env bash
# Ishlab chiqish uchun RS256 kalit juftligi. PRODUCTION'da bu kalitlar
# sir boshqaruvchidan olinadi va repoga hech qachon tushmaydi.
set -euo pipefail
DIR="${1:-apps/api/secrets}"
mkdir -p "$DIR"
if [ -f "$DIR/jwt_private.pem" ]; then echo "kalitlar allaqachon bor: $DIR"; exit 0; fi
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$DIR/jwt_private.pem" 2>/dev/null
openssl rsa -pubout -in "$DIR/jwt_private.pem" -out "$DIR/jwt_public.pem" 2>/dev/null
chmod 600 "$DIR/jwt_private.pem"
echo "kalitlar yaratildi: $DIR"
