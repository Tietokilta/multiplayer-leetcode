{
  description = "NixOS kiosk netboot for Multiplayer LeetCode";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    evdevWsSrc = {
      url = "path:../evdev-ws";
      flake = false;
    };
    frontendSrc = {
      url = "path:../frontend";
      flake = false;
    };
    backendSrc = {
      url = "path:../backend";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, evdevWsSrc, frontendSrc, backendSrc }:
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

      nixosConfigurations.server = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          kioskSystem = self.nixosConfigurations.kiosk;
          inherit frontendSrc backendSrc;
        };
        modules = [ ./server.nix ./disk.nix ];
      };

      nixosConfigurations.server-iso = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          kioskSystem = self.nixosConfigurations.kiosk;
          inherit frontendSrc backendSrc;
        };
        modules = [
          ./server.nix
          ./disk.nix
          ({ modulesPath, lib, ... }: {
            imports = [ (modulesPath + "/installer/cd-dvd/installation-cd-minimal.nix") ];
            # The ISO module sets a default hostname; override it
            networking.hostName = lib.mkForce "leetcode-server";
            # ISO boots with GRUB; ensure no conflicts
            boot.loader.grub.enable = lib.mkForce false;
          })
        ];
      };

      nixosConfigurations.server-vm = nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = {
          kioskSystem = self.nixosConfigurations.kiosk;
          inherit frontendSrc backendSrc;
        };
        modules = [
          ./server.nix
          ({ modulesPath, ... }: {
            imports = [ (modulesPath + "/virtualisation/qemu-vm.nix") ];
            virtualisation = {
              memorySize = 4096;
              cores = 2;
              graphics = false;
              forwardPorts = [
                { from = "host"; host.port = 8080; guest.port = 80; }
                { from = "host"; host.port = 6979; guest.port = 6979; }
                { from = "host"; host.port = 2200; guest.port = 22; }
              ];
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
        server-vm = self.nixosConfigurations.server-vm.config.system.build.vm;
        server-iso = self.nixosConfigurations.server-iso.config.system.build.isoImage;
      };

      checks.${system}.kiosk-smoke = import ./tests.nix { inherit pkgs; };
    };
}
