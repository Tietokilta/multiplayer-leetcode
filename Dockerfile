FROM nixos/nix:2.32.6

WORKDIR /workspace

ENV NIX_CONFIG="experimental-features = nix-command flakes"

COPY nix/ ./nix/
COPY frontend/ ./frontend/
COPY evdev-ws/ ./evdev-ws/

CMD ["/bin/sh", "-lc", "nix build ./nix#iso && mkdir -p /out && cp -L ./result/iso/*.iso /out/"]
