#!/usr/bin/env bash
# Deploy backend kantor-rpg (KRISnDEE VIRTUAL OFFICE 3D, owner login)
# untuk: https://office.krisndee.com  di VPS Sumopod Ubuntu 24.04 (user ubuntu)
#
# CARA PAKAI (baca dulu sampai habis sebelum menjalankan):
#   1. Buka konsol Sumopod VPS sebagai user ubuntu.
#   2. Unduh skrip ini, lalu jalankan:  bash deploy-vps.sh
#   3. Perintah sudo di dalam skrip akan meminta password ubuntu SEKALI
#      (diketik di konsolmu sendiri, tidak dikirim ke siapa pun).
#   4. Setelah skrip selesai, jalankan perintah setup owner yang dicetak
#      di akhir skrip (tautan berlaku 24 jam).
#
# YANG DILAKUKAN SKRIP INI:
#   - apt: nginx, certbot (+ plugin nginx), git, curl, Node.js 24 (NodeSource)
#   - clone fork https://github.com/kristhanto/kantor-rpg, build app (Vite),
#     pasang hasil build sebagai rilis statis nginx
#   - pasang backend server/ sebagai service systemd (127.0.0.1:3242)
#   - buat proxy-secret sekali saja (disimpan di /var/lib/kantor-rpg/data,
#     mode 600, pemilik www-data); skrip TIDAK pernah mencetak secret ini
#   - nginx: situs statis + proxy /api/ ke backend + HTTPS via Certbot
#   - firewall: izinkan OpenSSH dan Nginx Full
# YANG TIDAK DILAKUKAN: tidak mengumpulkan password apa pun, tidak menghapus
# data backend lama (kecuali klon sementara di /tmp), tidak mengubah DNS.
# Menjalankan ulang skrip ini aman: rilis baru dibuat, secret lama dipakai lagi.
set -euo pipefail

DOMAIN="office.krisndee.com"
ORIGIN="https://${DOMAIN}"
REPO="https://github.com/kristhanto/kantor-rpg.git"
RELEASES_DIR="/var/www/kantor-rpg/releases"
SERVER_DIR="/var/lib/kantor-rpg/server"
DATA_DIR="/var/lib/kantor-rpg/data"
SECRET_FILE="${DATA_DIR}/proxy-secret"

echo "== 1/7: paket dasar =="
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git curl openssl

echo "== 2/7: Node.js 24 =="
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt install -y nodejs
fi
node --version

echo "== 3/7: clone fork + build game statis =="
rm -rf /tmp/kantor-rpg
git clone "${REPO}" /tmp/kantor-rpg
cd /tmp/kantor-rpg/app && npm ci && npm run build
SHA="$(git -C /tmp/kantor-rpg rev-parse --short=7 HEAD)"
echo "Rilis: ${SHA}"
sudo mkdir -p "${RELEASES_DIR}" "${SERVER_DIR}" "${DATA_DIR}"
sudo cp -a /tmp/kantor-rpg/app/dist "${RELEASES_DIR}/${SHA}"
sudo cp -a /tmp/kantor-rpg/server/. "${SERVER_DIR}/"
cd "${SERVER_DIR}" && sudo npm ci --omit=dev --ignore-scripts --no-audit --no-fund

echo "== 4/7: data backend + proxy-secret (dibuat sekali saja) =="
sudo mkdir -p "${DATA_DIR}"
sudo chown www-data:www-data "${DATA_DIR}"
sudo chmod 700 "${DATA_DIR}"
if [ ! -s "${SECRET_FILE}" ]; then
  sudo -u www-data sh -c "umask 077; openssl rand -hex 32 > '${SECRET_FILE}'"
  echo "Proxy-secret baru dibuat (tidak ditampilkan)."
else
  echo "Proxy-secret lama dipakai lagi."
fi
sudo chown www-data:www-data "${SECRET_FILE}"
sudo chmod 600 "${SECRET_FILE}"

echo "== 5/7: service systemd backend =="
sudo tee /etc/systemd/system/kantor-rpg.service >/dev/null <<EOF
[Unit]
Description=kantor-rpg backend
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=${SERVER_DIR}
Environment=KANTOR_RPG_DATA=${DATA_DIR}
Environment=KANTOR_RPG_PORT=3242
Environment=KANTOR_RPG_BIND=127.0.0.1
Environment=KANTOR_RPG_ORIGIN=${ORIGIN}
ExecStart=/usr/bin/node main.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now kantor-rpg
sudo systemctl status kantor-rpg --no-pager | head -5 || true

echo "== 6/7: nginx (HTTP dulu, HTTPS sesudah Certbot) =="
PROXY_SECRET="$(sudo cat "${SECRET_FILE}")"
sudo tee /etc/nginx/sites-available/kantor-rpg >/dev/null <<EOF
server {
  listen 80;
  server_name ${DOMAIN};
  root ${RELEASES_DIR}/${SHA};
  index index.html;
  gzip on;
  gzip_types application/javascript text/css application/json application/octet-stream model/gltf-binary;
  add_header Cache-Control "public, no-transform" always;
  add_header X-Content-Type-Options nosniff always;
  location ^~ /assets/ { try_files \$uri =404; }
  location ^~ /api/ {
    proxy_pass http://127.0.0.1:3242;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Kantor-Proxy "${PROXY_SECRET}";
    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
    client_max_body_size 16k;
    add_header X-Robots-Tag "noindex, nofollow" always;
  }
  location / { try_files \$uri \$uri/ =404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/kantor-rpg /etc/nginx/sites-enabled/kantor-rpg
sudo nginx -t && sudo systemctl reload nginx

echo "== 7/7: firewall + HTTPS (Certbot) =="
sudo ufw allow OpenSSH >/dev/null 2>&1 || true
sudo ufw allow 'Nginx Full' >/dev/null 2>&1 || true
sudo ufw --force enable >/dev/null 2>&1 || true
sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "================ SELESAI ================"
echo "Cek:  https://${DOMAIN}  (game 3D harus tampil)"
echo "Status backend:  sudo systemctl status kantor-rpg"
echo ""
echo "LANGKAH TERAKHIR — buat akun owner (lakukan sekarang juga):"
echo "  sudo -u www-data env KANTOR_RPG_ORIGIN=${ORIGIN} KANTOR_RPG_DATA=${DATA_DIR} node ${SERVER_DIR}/main.mjs setup kris"
echo "Perintah itu mencetak SATU tautan setup (berlaku 24 jam)."
echo "Buka tautan itu, isi sandi minimal 12 karakter + kode authenticator"
echo "dari aplikasi authenticator (QR ditampilkan di halaman itu)."
echo "Setelah dipakai, tautan hangus. Kalau kedaluwarsa, ulangi perintah di atas."
echo ""
echo "CADANGAN: simpan salinan ${DATA_DIR} secara berkala."
echo "Kalau data itu hilang, akun owner harus dibuat ulang dari awal."
echo "CATATAN: papan di dalam game ini menampilkan tugas sistem repo itu,"
echo "BUKAN proyek Muse (ARA, ELSI, Si JAPAD, NARA)."
