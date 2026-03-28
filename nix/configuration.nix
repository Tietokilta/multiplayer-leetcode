{ config, pkgs, lib, evdevWsSrc, ... }:

let
  evdev-ws = pkgs.callPackage ./evdev-ws.nix { src = evdevWsSrc; };
in
{
  system.stateVersion = "25.11";
  time.timeZone = "Europe/Helsinki";

  environment.etc."resolv.conf".text = "nameserver 8.8.8.8\n";

  # Firmware and kernel modules for real hardware
  hardware.enableRedistributableFirmware = true;

  boot.initrd.availableKernelModules = [
    "xhci_pci" "ehci_pci" "ohci_pci" "uhci_hcd"  # USB host controllers
    "usbhid" "hid_generic"                         # HID drivers
    "uas" "usb_storage"                             # USB storage
    "virtio_pci" "virtio_blk" "virtio_net"          # VM compat
  ];

  boot.kernelModules = [ "usbhid" "hid_generic" "hid" "nvidia" "nvidia_modeset" "nvidia_uvm" "nvidia_drm" ];
  boot.blacklistedKernelModules = [ "nouveau" ];

  networking = {
    hostName = "kiosk";
    networkmanager.enable = true;
    networkmanager.dns = "none";
    firewall.allowedTCPPorts = [ 22 ];
  };

  # Users
  users.users.kiosk = {
    isNormalUser = true;
    extraGroups = [ "input" "video" ];
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCiDxF/PZcYfX6N3CQOdQdW0PTPN7tgmwL6RPFDBlJURsxiTlmlRygjMVjrnxbIN9KGIP2p3hUKxensm0ftbl3fvdBG3nUnreGZAUQ7prSrli3tv+WITPFdONtDqcrMlYXbBy51/kFLUQMV7wBYurM/4bW/BOXtNZdk8/dLyCqAr1ynZmXFFHEB3APtlxaLlsyHEER5Nj7WDlxpFUxOqzasPg8MMGKQeN+d2TbUq1s0YDVwmk4F+Zqfj0H9AAYYt4zkiKbCkzTrJXk9snBPAyUot8jkAjZW5nu7quVoiHvWY3335iaa4o2JWDkm6/QEXYzKIbi865jOr3A5DRFytNFQJ7nmXfSNWAJmblSlatlszQLwmTLP5wkV+3zbRHv7WuvWivR76Xy0uyK331UvqrRbNha+EbVoWP5DyFnichBH7B/IgHkLHQJIuYiQBZ2ZwTuVpEoxyCUyl9acDtmUZvuomTAEjLRQElnhRo8iyDf92dl19Q9dG/1RWqLXUEDVBcLrlk89aEnIk7DuwvmVWzWM+On9S8ojH04TgRJM5ZkbQLAIqW5AkLqY6CP5Gzknsh7F4fl5Mq0FZlCOtFzxR+YgIn4IGndonm8/iqDQjJNOWVysFdNRPisPSR5AO5TiuxZSOcCuRkS56cZTHKjdqZS8CxiCfs2ZPlzMnzKJSNDXxQ== cardno:30_079_357"
  ];

  # SSH
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "prohibit-password";
  };

  # --- NVIDIA GPU ---
  nixpkgs.config.allowUnfree = true;
  services.xserver.videoDrivers = [ "nvidia" "amdgpu" ];
  hardware.nvidia = {
    package = config.boot.kernelPackages.nvidiaPackages.stable;
    modesetting.enable = true;
    open = false;
  };
  hardware.graphics.enable = true;
  services.xserver.serverFlagsSection = ''
    Option "AutoAddGPU" "false"
  '';

  # X11
  services.xserver = {
    enable = true;
    desktopManager.xterm.enable = false;
    inputClassSections = [
      ''
        Identifier "ignore keyboards"
        MatchIsKeyboard "on"
        Option "Ignore" "on"
      ''
    ];
    windowManager.session = [{
      name = "kiosk";
      start = ''
        ${pkgs.xorg.xset}/bin/xset s off
        ${pkgs.xorg.xset}/bin/xset -dpms

        # Force 1920x1080 on the first connected output, disable the rest
        FIRST_OUTPUT=$(${pkgs.xorg.xrandr}/bin/xrandr --query | ${pkgs.gnugrep}/bin/grep ' connected' | ${pkgs.coreutils}/bin/head -1 | ${pkgs.coreutils}/bin/cut -d' ' -f1)
        ${pkgs.xorg.xrandr}/bin/xrandr --output "$FIRST_OUTPUT" --mode 1920x1080
        for output in $(${pkgs.xorg.xrandr}/bin/xrandr --query | ${pkgs.gnugrep}/bin/grep ' connected' | ${pkgs.coreutils}/bin/tail -n+2 | ${pkgs.coreutils}/bin/cut -d' ' -f1); do
          ${pkgs.xorg.xrandr}/bin/xrandr --output "$output" --off
        done

        WIDTH=1920
        HEIGHT=1080

        ${pkgs.unclutter}/bin/unclutter -idle 0.5 &
        ${pkgs.chromium}/bin/chromium \
          --kiosk \
          --no-first-run \
          --start-fullscreen \
          --window-position=0,0 \
          --window-size=$WIDTH,$HEIGHT \
          http://u2.titeen.it.lajp.fi:8080/ &
        waitPID=$!
      '';
    }];
  };

  services.displayManager = {
    autoLogin = {
      enable = true;
      user = "kiosk";
    };
    defaultSession = "none+kiosk";
  };

  # evdev-ws systemd service
  systemd.services.evdev-ws = {
    description = "Keyboard input WebSocket daemon";
    after = [ "systemd-udevd.service" "network.target" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      ExecStart = "${evdev-ws}/bin/evdev-ws";
      Restart = "always";
      RestartSec = 2;
    };
  };

  # NFS mount from the server
  boot.supportedFilesystems = [ "nfs" ];
  fileSystems."/mnt/nfs" = {
    device = "u2.titeen.it.lajp.fi:/export";
    fsType = "nfs";
    options = [ "x-systemd.automount" "noauto" ];
  };

  # Minimize closure size for netboot
  nix.enable = false;
  environment.defaultPackages = [];
  documentation.enable = false;
  services.speechd.enable = false;
  programs.nano.enable = false;
  programs.less.enable = lib.mkForce false;
  networking.networkmanager.plugins = lib.mkForce [];
  xdg.sounds.enable = false;

  environment.systemPackages = with pkgs; [
    htop
  ];
}
