{
  description = "NixOS kiosk ISO for Multiplayer LeetCode";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    frontendSrc = {
      url = "path:../frontend";
      flake = false;
    };
    evdevWsSrc = {
      url = "path:../evdev-ws";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, frontendSrc, evdevWsSrc }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      specialArgs = {
        inherit frontendSrc evdevWsSrc;
      };
    in
    {
      nixosConfigurations.kiosk = nixpkgs.lib.nixosSystem {
        inherit system specialArgs;
        modules = [
          ({ modulesPath, ... }: {
            imports = [ (modulesPath + "/installer/cd-dvd/installation-cd-minimal.nix") ];
          })
          ./configuration.nix
        ];
      };

      nixosConfigurations.kiosk-vm = nixpkgs.lib.nixosSystem {
        inherit system specialArgs;
        modules = [
          ./configuration.nix
          ({ modulesPath, lib, ... }: {
            imports = [ (modulesPath + "/virtualisation/qemu-vm.nix") ];
            virtualisation = {
              memorySize = 4096;
              cores = 2;
              graphics = true;
              qemu.options = [
                "-device qemu-xhci,id=xhci"
                "-device usb-kbd,bus=xhci.0"
              ];
            };
            # Allow keyboards in X11 for interactive VM testing
            services.xserver.inputClassSections = lib.mkForce [];
          })
        ];
      };

      packages.${system} = {
        iso = self.nixosConfigurations.kiosk.config.system.build.isoImage;
        vm = self.nixosConfigurations.kiosk-vm.config.system.build.vm;
      };

      checks.${system}.kiosk-smoke = import ./tests.nix { inherit pkgs; };
    };
}
