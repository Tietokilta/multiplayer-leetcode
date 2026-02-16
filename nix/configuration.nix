{ config, pkgs, lib, ... }:

let
  evdev-ws = pkgs.callPackage ./evdev-ws.nix {};
  frontend = pkgs.callPackage ./frontend.nix {};
in
{
  system.stateVersion = "25.11";
  time.timeZone = "Europe/Helsinki";

  # The installation-cd base enables wireless; override for NetworkManager
  networking.wireless.enable = lib.mkForce false;

  networking = {
    hostName = "kiosk";
    networkmanager.enable = true;
    firewall.allowedTCPPorts = [ 22 80 ];
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
        ${pkgs.unclutter}/bin/unclutter -idle 0.5 &
        ${pkgs.chromium}/bin/chromium \
          --kiosk \
          --no-first-run \
          --start-fullscreen \
          http://localhost/ &
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

  # nginx serving frontend static files
  services.nginx = {
    enable = true;
    virtualHosts.localhost = {
      listen = [{ addr = "0.0.0.0"; port = 80; }];
      root = "${frontend}";
      locations."/" = {
        tryFiles = "$uri $uri/ /index.html";
      };
    };
  };

  # System packages for admin
  environment.systemPackages = with pkgs; [
    vim
    htop
    tmux
  ];
}
