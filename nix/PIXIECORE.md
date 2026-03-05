# Server & Netboot Setup

The local server runs three services: the frontend (nginx), the backend game server, and a Pixiecore netboot server that PXE-boots kiosk clients.

## Build a bootable server ISO

```bash
./build-server-iso.sh
```

This builds a NixOS ISO image containing all server services. Write it to a USB stick:

```bash
sudo dd if=<path-from-script> of=/dev/sdX bs=4M status=progress oflag=sync
```

## Configure before building

1. Add SSH keys:
   - `nix/server.nix`: `users.users.root.openssh.authorizedKeys.keys`
   - `nix/configuration.nix`: `users.users.root.openssh.authorizedKeys.keys` (for kiosk clients)

2. If already running NixOS on the server, apply directly instead of using the ISO:

```bash
sudo nixos-rebuild switch --flake ./nix#server
```

## Post-boot setup

1. Create the backend environment file with the admin password:

```bash
echo 'ADMIN_PASSWORD=your-secret-here' > /var/lib/leetcode-backend/env
```

2. Pull the Docker image used for code execution:

```bash
docker pull python:3.14-slim
```

3. Verify services:

```bash
systemctl status pixiecore --no-pager
systemctl status leetcode-backend --no-pager
systemctl status nginx --no-pager
systemctl status nfs-server --no-pager
```

## NFS

The server exports `/export` via NFS. Kiosk clients mount it at `/mnt/nfs` (auto-mounted on first access). Place any shared files in `/export` on the server.

## Nix build targets

| Target | Description |
|--------|-------------|
| `nix build ./nix#server-iso` | Bootable server ISO (frontend + backend + netboot + NFS) |
| `nix build ./nix#server-vm` | QEMU VM for testing the server |
| `nix build ./nix#vm` | QEMU VM for testing the kiosk client |
| `nix build ./nix#netboot-kernel` | Kiosk netboot kernel |
| `nix build ./nix#netboot-initrd` | Kiosk netboot initrd |

## Quick test with one Pixiecore command

Run from repo root:

```bash
sudo pixiecore boot \
  "$(nix build ./nix#netboot-kernel --no-link --print-out-paths)/bzImage" \
  "$(nix build ./nix#netboot-initrd --no-link --print-out-paths)/initrd" \
  --cmdline "init=$(nix eval --raw ./nix#nixosConfigurations.kiosk.config.system.build.toplevel)/init $(nix eval --raw --apply 'builtins.concatStringsSep \" \"' ./nix#nixosConfigurations.kiosk.config.boot.kernelParams)" \
  --dhcp-no-bind \
  --listen-addr 0.0.0.0 \
  --debug
```

Then PXE boot a client on the same L2 network/VLAN.

Stop Pixiecore with `Ctrl+C`.
