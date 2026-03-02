# Multiplayer LeetCode Kiosk ISO

This repository contains a Nix flake in `nix/` that builds a NixOS kiosk ISO.

## Build with Nix

### Prerequisites

- Nix installed
- Flakes enabled (`nix-command` + `flakes`)

### Build

From the repository root:

```bash
nix build ./nix#iso
```

The built ISO is available via the `./result` symlink, typically under:

```bash
./result/iso/*.iso
```

## Build with Docker

The root `Dockerfile` uses a pinned `nixos/nix` image and runs the same flake build.

### Build image

```bash
docker build -t multiplayer-leetcode-nixos-iso:2.32.6 .
```

### Build ISO in container

```bash
mkdir -p out
docker run --rm \
  -v "$PWD/out:/out" \
  multiplayer-leetcode-nixos-iso:2.32.6
```

The container copies the generated ISO into:

```bash
out/
```
