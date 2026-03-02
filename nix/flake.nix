{
  description = "NixOS kiosk netboot for Multiplayer LeetCode";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    evdevWsSrc = {
      url = "path:../evdev-ws";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, evdevWsSrc }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      specialArgs = {
        inherit evdevWsSrc;
      };
    in
    {
      nixosConfigurations.kiosk = nixpkgs.lib.nixosSystem {
        inherit system specialArgs;
        modules = [
          ({ modulesPath, ... }: {
            imports = [ (modulesPath + "/installer/netboot/netboot.nix") ];
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

      nixosConfigurations.netboot-host = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          kioskSystem = self.nixosConfigurations.kiosk;
        };
        modules = [ ./netboot-host.nix ];
      };

      nixosConfigurations.netboot-host-vm = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          kioskSystem = self.nixosConfigurations.kiosk;
        };
        modules = [
          ./netboot-host.nix
          ({ modulesPath, ... }: {
            imports = [ (modulesPath + "/virtualisation/qemu-vm.nix") ];
            virtualisation = {
              memorySize = 2048;
              cores = 2;
              graphics = false;
            };
          })
        ];
      };

      packages.${system} = {
        netboot-kernel = self.nixosConfigurations.kiosk.config.system.build.kernel;
        netboot-initrd = self.nixosConfigurations.kiosk.config.system.build.netbootRamdisk;
        netboot-ipxe-script = self.nixosConfigurations.kiosk.config.system.build.netbootIpxeScript;
        vm = self.nixosConfigurations.kiosk-vm.config.system.build.vm;
        netboot-host-vm = self.nixosConfigurations.netboot-host-vm.config.system.build.vm;
      };

      checks.${system}.kiosk-smoke = import ./tests.nix { inherit pkgs; };
    };
}
