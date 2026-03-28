{ config, pkgs, lib, kioskSystem, frontendSrc, backendSrc, ... }:

let
  kioskBuild = kioskSystem.config.system.build;
  kioskKernelParams = kioskSystem.config.boot.kernelParams;

  frontend = pkgs.callPackage ./frontend.nix { src = frontendSrc; };
  backend = pkgs.callPackage ./backend.nix { src = backendSrc; };

  openrouter = pkgs.python3Packages.buildPythonPackage {
    pname = "openrouter";
    version = "0.7.11";
    format = "wheel";
    src = pkgs.fetchurl {
      url = "https://files.pythonhosted.org/packages/1f/32/cfff59bdb81e5cd40bcfb01a33962c5299e3373ad24fadcb2c7f7e61a2f0/openrouter-0.7.11-py3-none-any.whl";
      sha256 = "102b4bccd435b928906ab73b111005260874a36b2ca9b34b8875b19981b09e4c";
    };
    dependencies = with pkgs.python3Packages; [ httpcore httpx pydantic ];
    doCheck = false;
  };

  python = pkgs.python3.withPackages (ps: [
    ps.websockets
    ps.aiosqlite
    ps.pyyaml
    ps.inotify-simple
    openrouter
  ]);

  stateDir = config.services.leetcode.stateDir;
  isDefaultStateDir = stateDir == "/var/lib/leetcode-backend";
in
{
  options.services.leetcode.stateDir = lib.mkOption {
    type = lib.types.path;
    default = "/var/lib/leetcode-backend";
    description = "Directory for leetcode-backend persistent state";
  };

  config = {
  system.stateVersion = "25.11";
  time.timeZone = "Europe/Helsinki";

  environment.etc."resolv.conf".text = "nameserver 8.8.8.8\n";

  # Bootloader
  boot.loader.grub.enable = lib.mkDefault true;
  boot.loader.grub.device = lib.mkDefault "nodev";

  networking = {
    hostName = "leetcode-server";
    useDHCP = lib.mkDefault true;
    dhcpcd.extraConfig = "nohook resolv.conf";
    firewall.allowedTCPPorts = [ 22 2049 6979 8080 ];
  };

  # --- Pixiecore PXE boot server ---
  services.pixiecore = {
    enable = true;
    openFirewall = true;
    dhcpNoBind = true;
    mode = "boot";
    kernel = "${kioskBuild.kernel}/bzImage";
    initrd = "${kioskBuild.netbootRamdisk}/initrd";
    cmdLine = "init=${kioskBuild.toplevel}/init ${toString kioskKernelParams}";
  };

  # --- Docker for code execution sandbox ---
  virtualisation.docker.enable = true;

  # Pre-pull the sandbox image so submissions work immediately after boot
  systemd.services.docker-pull-python = {
    description = "Pre-pull Python Docker image for code execution";
    after = [ "docker.service" "network-online.target" ];
    requires = [ "docker.service" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = "${pkgs.docker}/bin/docker pull python:3.14-slim";
    };
  };

  # --- Backend game server ---
  users.users.leetcode = {
    isSystemUser = true;
    group = "leetcode";
    home = stateDir;
  };
  users.groups.leetcode = {};

  systemd.services.leetcode-backend = {
    description = "Multiplayer LeetCode game server";
    after = [ "network.target" "docker.service" ];
    requires = [ "docker.service" ];
    wantedBy = [ "multi-user.target" ];
    path = [ pkgs.docker ];

    serviceConfig = {
      ExecStartPre = "+" + pkgs.writeShellScript "leetcode-backend-setup" ''
        STATE=${stateDir}
        mkdir -p $STATE
        chown leetcode:leetcode $STATE
        ln -sf ${backend}/lib/seccomp-strict.json $STATE/seccomp-strict.json
        # Copy yaml/py files only if missing (allow runtime edits)
        [ -f $STATE/puzzles.yaml ] || cp ${backend}/lib/puzzles.yaml $STATE/puzzles.yaml
        [ -f $STATE/prompts.yaml ] || cp ${backend}/lib/prompts.yaml $STATE/prompts.yaml
        [ -f $STATE/main.py ] || cp ${backend}/lib/main.py $STATE/main.py
      '';
      ExecStart = "${python}/bin/python ${stateDir}/main.py";
      WorkingDirectory = stateDir;
      User = "leetcode";
      Group = "leetcode";
      SupplementaryGroups = [ "docker" ];
      EnvironmentFile = "${stateDir}/env";
      Restart = "always";
      RestartSec = 5;
    } // lib.optionalAttrs isDefaultStateDir {
      StateDirectory = "leetcode-backend";
    };
  };

  # --- Nginx serving frontend from mutable path (allows hotfixes via scp) ---
  systemd.services.frontend-setup = {
    description = "Copy frontend files for nginx";
    before = [ "nginx.service" ];
    wantedBy = [ "multi-user.target" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
      ExecStart = pkgs.writeShellScript "frontend-setup" ''
        mkdir -p /var/lib/leetcode-frontend
        if [ ! -f /var/lib/leetcode-frontend/index.html ]; then
          cp -r ${frontend}/* /var/lib/leetcode-frontend/
          chmod -R a+rX /var/lib/leetcode-frontend
        fi
      '';
    };
  };

  systemd.services.nginx.after = [ "frontend-setup.service" ];
  systemd.services.nginx.requires = [ "frontend-setup.service" ];

  services.nginx = {
    enable = true;
    virtualHosts."u2.titeen.it.lajp.fi" = {
      default = true;
      listen = [{ addr = "0.0.0.0"; port = 8080; }];
      root = "/var/lib/leetcode-frontend";
      locations."/" = {
        tryFiles = "$uri $uri/ /index.html";
      };
    };
  };

  # --- NFS server ---
  services.nfs.server = {
    enable = true;
    exports = ''
      /export *(ro,fsid=0,no_subtree_check)
    '';
  };
  systemd.tmpfiles.rules = [ "d /export 0755 root root -" ];

  # --- SSH ---
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "prohibit-password";
  };

  users.users.root.openssh.authorizedKeys.keys = [
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCiDxF/PZcYfX6N3CQOdQdW0PTPN7tgmwL6RPFDBlJURsxiTlmlRygjMVjrnxbIN9KGIP2p3hUKxensm0ftbl3fvdBG3nUnreGZAUQ7prSrli3tv+WITPFdONtDqcrMlYXbBy51/kFLUQMV7wBYurM/4bW/BOXtNZdk8/dLyCqAr1ynZmXFFHEB3APtlxaLlsyHEER5Nj7WDlxpFUxOqzasPg8MMGKQeN+d2TbUq1s0YDVwmk4F+Zqfj0H9AAYYt4zkiKbCkzTrJXk9snBPAyUot8jkAjZW5nu7quVoiHvWY3335iaa4o2JWDkm6/QEXYzKIbi865jOr3A5DRFytNFQJ7nmXfSNWAJmblSlatlszQLwmTLP5wkV+3zbRHv7WuvWivR76Xy0uyK331UvqrRbNha+EbVoWP5DyFnichBH7B/IgHkLHQJIuYiQBZ2ZwTuVpEoxyCUyl9acDtmUZvuomTAEjLRQElnhRo8iyDf92dl19Q9dG/1RWqLXUEDVBcLrlk89aEnIk7DuwvmVWzWM+On9S8ojH04TgRJM5ZkbQLAIqW5AkLqY6CP5Gzknsh7F4fl5Mq0FZlCOtFzxR+YgIn4IGndonm8/iqDQjJNOWVysFdNRPisPSR5AO5TiuxZSOcCuRkS56cZTHKjdqZS8CxiCfs2ZPlzMnzKJSNDXxQ== cardno:30_079_357"
  ];

  nix.enable = true;
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  environment.systemPackages = with pkgs; [
    vim
    htop
    tmux
    curl
    jq
    git
    iotop
    tcpdump
    lsof
  ];
}; # close config
}
