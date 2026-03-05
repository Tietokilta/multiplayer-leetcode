{ lib, ... }:
let
  diskMount = "/mnt";
in
{
  # mkImageMediaOverride (priority 60) matches the ISO module's fileSystems
  # priority, so this entry is merged in rather than silently discarded.
  fileSystems = lib.mkImageMediaOverride {
    "${diskMount}" = {
      device = "/dev/disk/by-label/titeenit";
      fsType = "ext4";
    };
  };

  services.leetcode.stateDir = "${diskMount}/leetcode-backend";

  systemd.services.leetcode-backend.unitConfig.RequiresMountsFor = diskMount;
}
