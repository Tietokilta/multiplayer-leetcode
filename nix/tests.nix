{ pkgs }:

pkgs.testers.nixosTest {
  name = "kiosk-smoke";

  nodes.machine = {
    imports = [ ./configuration.nix ];
    virtualisation.memorySize = 4096;
  };

  testScript = ''
    machine.start()
    machine.wait_for_unit("multi-user.target")

    # Test 1: evdev-ws service starts (may not find real keyboards in VM)
    machine.wait_for_unit("evdev-ws.service", timeout=30)

    # Test 2: nginx serves the frontend
    machine.wait_for_unit("nginx.service")
    machine.wait_for_open_port(80)
    result = machine.succeed("curl -s http://localhost/")
    assert "<!DOCTYPE html>" in result or "<html" in result, \
        f"Expected HTML from nginx, got: {result[:200]}"
    assert "/assets/" in result, "Frontend index.html should reference /assets/"

    # Test 3: SSH is accessible
    machine.wait_for_unit("sshd.service")
    machine.wait_for_open_port(22)

    # Test 4: X11 display manager starts
    machine.wait_for_unit("display-manager.service", timeout=60)

    # Test 5: kiosk user exists with correct groups
    machine.succeed("id kiosk")
    groups = machine.succeed("groups kiosk")
    assert "input" in groups, f"kiosk user should be in input group, got: {groups}"
  '';
}
