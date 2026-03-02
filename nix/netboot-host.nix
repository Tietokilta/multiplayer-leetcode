{ config, pkgs, lib, kioskSystem, ... }:

let
  kioskBuild = kioskSystem.config.system.build;
  kioskKernelParams = kioskSystem.config.boot.kernelParams;
in
{
  system.stateVersion = "25.11";
  time.timeZone = "Europe/Helsinki";

  # Bootloader — override for your hardware
  boot.loader.grub.enable = lib.mkDefault true;
  boot.loader.grub.device = lib.mkDefault "nodev";

  networking = {
    hostName = "netboot-host";
    useDHCP = lib.mkDefault true;
    firewall.allowedTCPPorts = [ 22 ];
  };

  # Pixiecore PXE boot server
  services.pixiecore = {
    enable = true;
    openFirewall = true;
    dhcpNoBind = true;
    mode = "boot";
    kernel = "${kioskBuild.kernel}/bzImage";
    initrd = "${kioskBuild.netbootRamdisk}/initrd";
    cmdLine = "init=${kioskBuild.toplevel}/init ${toString kioskKernelParams}";
  };

  # SSH for remote administration
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "prohibit-password";
  };

  users.users.root.openssh.authorizedKeys.keys = [
    # Add your SSH public key(s) here before building
  ];

  environment.systemPackages = with pkgs; [ vim htop tmux ];
}
