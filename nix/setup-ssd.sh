#!/usr/bin/env bash
set -euo pipefail

DISK=/dev/sda
LC_ISO=/nix/store/932lqs0pggy26n6vv3gx3afv5v4sbbnr-nixos-minimal-25.11.20260214.3aadb7c-x86_64-linux.iso/iso/nixos-minimal-25.11.20260214.3aadb7c-x86_64-linux.iso

echo "=== This will WIPE ${DISK} ==="
echo "Partition layout:"
echo "  1: 1 MiB   BIOS boot"
echo "  2: 25 GiB  ext4 (GRUB + ISO files)"
echo "  3: rest    ext4, label titeenit"
read -p "Continue? [y/N] " -r
[[ "$REPLY" =~ ^[Yy]$ ]] || exit 1

# --- Partition ---
sgdisk -Z "$DISK"
sgdisk -n 1:0:+1M   -t 1:ef02 "$DISK"   # BIOS boot
sgdisk -n 2:0:+25G  -t 2:8300 "$DISK"   # boot + ISOs
sgdisk -n 3:0:0     -t 3:8300 "$DISK"   # state
partprobe "$DISK"
sleep 1

# --- Format ---
mkfs.ext4 -F "${DISK}2"
mkfs.ext4 -F -L titeenit "${DISK}3"

# --- Mount boot partition and copy ISO ---
mount "${DISK}2" /mnt
cp "$LC_ISO" /mnt/leetcode.iso
echo "Copied leetcode ISO"

# --- Install GRUB ---
grub-install --boot-directory=/mnt --target=i386-pc "$DISK"

# --- Create state dir on titeenit partition ---
mkdir -p /tmp/state
mount "${DISK}3" /tmp/state
mkdir -p /tmp/state/leetcode-backend
[ -f /tmp/state/leetcode-backend/env ] || echo "ADMIN_PASSWORD=changeme" > /tmp/state/leetcode-backend/env
umount /tmp/state

# --- Generate grub.cfg ---
"$(dirname "$0")/update-grub.sh"

umount /mnt

echo "=== Done! ==="
echo "To update: mount ${DISK}2 /mnt && cp new.iso /mnt/leetcode.iso && $(dirname "$0")/update-grub.sh && umount /mnt"
