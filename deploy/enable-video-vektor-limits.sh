#!/usr/bin/env bash
# Run once as root; does not change PM2, the web app, or other application budgets.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  echo 'Jalankan sebagai root: sudo bash deploy/enable-video-vektor-limits.sh www' >&2
  exit 1
fi
VECTOR_WORKER_USER=${1:-www}
VECTOR_WORKER_UID=$(id -u "$VECTOR_WORKER_USER")
if [[ "$VECTOR_WORKER_UID" == 0 ]]; then
  echo 'Worker Video Vektor harus menggunakan user non-root.' >&2
  exit 1
fi
if [[ ! -f /sys/fs/cgroup/cgroup.controllers ]]; then
  echo 'Batas RAM Video Vektor memerlukan Linux dengan cgroup v2.' >&2
  exit 1
fi
loginctl enable-linger "$VECTOR_WORKER_USER"
systemctl start "user@${VECTOR_WORKER_UID}.service"
runuser -u "$VECTOR_WORKER_USER" -- env \
  "XDG_RUNTIME_DIR=/run/user/${VECTOR_WORKER_UID}" \
  "DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${VECTOR_WORKER_UID}/bus" \
  systemd-run --user --pipe --wait --service-type=exec --quiet --collect \
    --property=MemoryHigh=1700000000 \
    --property=MemoryMax=2000000000 \
    --property=MemorySwapMax=0 \
    /bin/sh -ec 'group=$(sed -n "s/^0:://p" /proc/self/cgroup); test "$(cat "/sys/fs/cgroup$group/memory.max")" = 2000000000; test "$(cat "/sys/fs/cgroup$group/memory.swap.max")" = 0'
echo "Batas RAM Video Vektor siap untuk user ${VECTOR_WORKER_USER}. Jalankan npm run check:video-vektor sebagai user tersebut dari direktori ncpost."
