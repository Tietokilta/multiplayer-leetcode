{ lib, stdenvNoCC, makeWrapper, python3Packages }:

let
  python = python3Packages.python.withPackages (ps: [
    ps.evdev
    ps.pyudev
    ps.websockets
  ]);
in
stdenvNoCC.mkDerivation {
  pname = "evdev-ws";
  version = "0.1.0";

  src = ../evdev-ws;

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib $out/bin
    cp main.py $out/lib/
    makeWrapper ${python}/bin/python $out/bin/evdev-ws \
      --add-flags "$out/lib/main.py"
    runHook postInstall
  '';

  meta = {
    description = "Keyboard input WebSocket daemon for multiplayer leetcode";
    license = lib.licenses.mit;
  };
}
