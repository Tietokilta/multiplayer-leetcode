# Pixiecore Netboot

This repo is netbooted so all kiosk clients boot the same NixOS image from one source of truth. You update the kiosk once in this repo, and every PXE client gets that version on next boot instead of re-imaging each machine.

## Build and configure the host

1. Edit keys:
- `nix/configuration.nix`: `users.users.root.openssh.authorizedKeys.keys`
- `nix/netboot-host.nix`: `users.users.root.openssh.authorizedKeys.keys`

2. Apply host config:

```bash
sudo nixos-rebuild switch --flake ./nix#netboot-host
```

3. Verify:

```bash
systemctl status pixiecore --no-pager
journalctl -u pixiecore -b --no-pager
```

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
