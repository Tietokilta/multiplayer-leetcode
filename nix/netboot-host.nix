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
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCiDxF/PZcYfX6N3CQOdQdW0PTPN7tgmwL6RPFDBlJURsxiTlmlRygjMVjrnxbIN9KGIP2p3hUKxensm0ftbl3fvdBG3nUnreGZAUQ7prSrli3tv+WITPFdONtDqcrMlYXbBy51/kFLUQMV7wBYurM/4bW/BOXtNZdk8/dLyCqAr1ynZmXFFHEB3APtlxaLlsyHEER5Nj7WDlxpFUxOqzasPg8MMGKQeN+d2TbUq1s0YDVwmk4F+Zqfj0H9AAYYt4zkiKbCkzTrJXk9snBPAyUot8jkAjZW5nu7quVoiHvWY3335iaa4o2JWDkm6/QEXYzKIbi865jOr3A5DRFytNFQJ7nmXfSNWAJmblSlatlszQLwmTLP5wkV+3zbRHv7WuvWivR76Xy0uyK331UvqrRbNha+EbVoWP5DyFnichBH7B/IgHkLHQJIuYiQBZ2ZwTuVpEoxyCUyl9acDtmUZvuomTAEjLRQElnhRo8iyDf92dl19Q9dG/1RWqLXUEDVBcLrlk89aEnIk7DuwvmVWzWM+On9S8ojH04TgRJM5ZkbQLAIqW5AkLqY6CP5Gzknsh7F4fl5Mq0FZlCOtFzxR+YgIn4IGndonm8/iqDQjJNOWVysFdNRPisPSR5AO5TiuxZSOcCuRkS56cZTHKjdqZS8CxiCfs2ZPlzMnzKJSNDXxQ== cardno:30_079_357"
  ];

  environment.systemPackages = with pkgs; [ vim htop tmux ];
}
