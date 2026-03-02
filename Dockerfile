FROM nixos/nix:2.32.6

WORKDIR /workspace

ENV NIX_CONFIG="experimental-features = nix-command flakes"

COPY nix/ ./nix/
COPY frontend/ ./frontend/
COPY evdev-ws/ ./evdev-ws/

CMD ["/bin/sh", "-lc", "set -eu; kernel=$(nix build 'path:/workspace?dir=nix#netboot-kernel' --no-link --print-out-paths); initrd=$(nix build 'path:/workspace?dir=nix#netboot-initrd' --no-link --print-out-paths); ipxe=$(nix build 'path:/workspace?dir=nix#netboot-ipxe-script' --no-link --print-out-paths); mkdir -p /out; cp -L \"$kernel/bzImage\" /out/bzImage; cp -L \"$initrd/initrd\" /out/initrd; cp -L \"$ipxe/netboot.ipxe\" /out/netboot.ipxe"]
