{ config, pkgs, lib, evdevWsSrc, ... }:

let
  evdev-ws = pkgs.callPackage ./evdev-ws.nix { src = evdevWsSrc; };
in
{
  system.stateVersion = "25.11";
  time.timeZone = "Europe/Helsinki";

  # Firmware and kernel modules for real hardware
  hardware.enableRedistributableFirmware = true;

  boot.initrd.availableKernelModules = [
    "xhci_pci" "ehci_pci" "ohci_pci" "uhci_hcd"  # USB host controllers
    "usbhid" "hid_generic"                         # HID drivers
    "uas" "usb_storage"                             # USB storage
    "virtio_pci" "virtio_blk" "virtio_net"          # VM compat
  ];

  boot.kernelModules = [ "usbhid" "hid_generic" "hid" ];

  networking = {
    hostName = "kiosk";
    networkmanager.enable = true;
    firewall.allowedTCPPorts = [ 22 ];
  };

  # Users
  users.users.kiosk = {
    isNormalUser = true;
    extraGroups = [ "input" "video" ];
  };

  users.users.root.openssh.authorizedKeys.keys = [
    # Add your SSH public key(s) here before building the ISO
  ];

  # SSH
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "prohibit-password";
  };

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

        # Disable all outputs except the first connected one
        ${pkgs.xorg.xrandr}/bin/xrandr --auto
        for output in $(${pkgs.xorg.xrandr}/bin/xrandr --query | ${pkgs.gnugrep}/bin/grep ' connected' | ${pkgs.coreutils}/bin/tail -n+2 | ${pkgs.coreutils}/bin/cut -d' ' -f1); do
          ${pkgs.xorg.xrandr}/bin/xrandr --output "$output" --off
        done

        # Get screen resolution for Chromium
        RESOLUTION=$(${pkgs.xorg.xrandr}/bin/xrandr --query | ${pkgs.gnugrep}/bin/grep -oP '\d+x\d+' | head -1)
        WIDTH=$(echo $RESOLUTION | ${pkgs.coreutils}/bin/cut -dx -f1)
        HEIGHT=$(echo $RESOLUTION | ${pkgs.coreutils}/bin/cut -dx -f2)

        ${pkgs.unclutter}/bin/unclutter -idle 0.5 &
        ${pkgs.chromium}/bin/chromium \
          --kiosk \
          --no-first-run \
          --start-fullscreen \
          --window-position=0,0 \
          --window-size=$WIDTH,$HEIGHT \
          https://lajp.fi/ &
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

  # NFS mount
  boot.supportedFilesystems = [ "nfs" ];
  # fileSystems."/mnt/nfs" = {
  #   device = "server:/export/path";
  #   fsType = "nfs";
  #   options = [ "x-systemd.automount" "noauto" ];
  # };

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
