#!/usr/bin/env bash
set -euo pipefail

echo "Building server ISO..."
result=$(nix build './nix#server-iso' --no-link --print-out-paths)
iso=$(find "$result/iso" -name '*.iso' | head -1)

echo ""
echo "ISO built successfully:"
echo "  $iso"
echo ""
echo "Write to USB stick (replace /dev/sdX):"
echo "  sudo dd if=$iso of=/dev/sdX bs=4M status=progress oflag=sync"
