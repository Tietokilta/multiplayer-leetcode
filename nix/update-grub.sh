#!/usr/bin/env bash
set -euo pipefail

BOOT_DEV=/dev/sda2
BOOT_MNT=/mnt
ISO_MNT=$(mktemp -d)
GRUB_CFG="$BOOT_MNT/grub/grub.cfg"

needs_unmount=false
if ! mountpoint -q "$BOOT_MNT"; then
  mount "$BOOT_DEV" "$BOOT_MNT"
  needs_unmount=true
fi

entries=""

for iso in "$BOOT_MNT"/*.iso; do
  [ -f "$iso" ] || continue
  isoname=$(basename "$iso")

  mount -o loop,ro "$iso" "$ISO_MNT"

  # Extract first linux/initrd lines from the ISO's grub.cfg
  linux_line=$(grep -m1 '^\s*linux ' "$ISO_MNT/EFI/BOOT/grub.cfg")
  initrd_line=$(grep -m1 '^\s*initrd ' "$ISO_MNT/EFI/BOOT/grub.cfg")

  umount "$ISO_MNT"

  # Extract kernel and initrd paths
  kernel=$(echo "$linux_line" | awk '{print $2}')
  initrd=$(echo "$initrd_line" | awk '{print $2}')

  # Extract kernel params (everything after the kernel path, minus ${isoboot})
  params=$(echo "$linux_line" | sed 's/^\s*linux\s\+\S\+\s*//' | sed 's/\${isoboot}//')

  # Derive a display name from the init= param (e.g. "nixos-system-leetcode-server-...")
  name=$(echo "$params" | grep -oP 'init=/nix/store/\S*-nixos-system-\K[^/]+' | sed 's/-25\..*//')
  [ -z "$name" ] && name="$isoname"

  entries+="
menuentry \"$name\" {
    set isofile=\"/$isoname\"
    loopback loop \$isofile
    linux (loop)$kernel findiso=\$isofile $params
    initrd (loop)$initrd
}
"
done

rmdir "$ISO_MNT"

cat > "$GRUB_CFG" << EOF
set timeout=10
set default=0
$entries
EOF

echo "Wrote $GRUB_CFG with $(echo "$entries" | grep -c menuentry) entries:"
grep 'menuentry ' "$GRUB_CFG"

if $needs_unmount; then
  umount "$BOOT_MNT"
fi
