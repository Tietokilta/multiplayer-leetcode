{ lib, stdenvNoCC, makeWrapper, fetchurl, python3Packages, src }:

let
  openrouter = python3Packages.buildPythonPackage {
    pname = "openrouter";
    version = "0.7.11";
    format = "wheel";
    src = fetchurl {
      url = "https://files.pythonhosted.org/packages/1f/32/cfff59bdb81e5cd40bcfb01a33962c5299e3373ad24fadcb2c7f7e61a2f0/openrouter-0.7.11-py3-none-any.whl";
      sha256 = "102b4bccd435b928906ab73b111005260874a36b2ca9b34b8875b19981b09e4c";
    };
    dependencies = with python3Packages; [ httpcore httpx pydantic ];
    doCheck = false;
  };

  python = python3Packages.python.withPackages (ps: [
    ps.websockets
    ps.aiosqlite
    ps.pyyaml
    ps.inotify-simple
    openrouter
  ]);
in
stdenvNoCC.mkDerivation {
  pname = "multiplayer-leetcode-backend";
  version = "0.1.0";

  inherit src;

  nativeBuildInputs = [ makeWrapper ];

  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/lib $out/bin
    cp main.py $out/lib/
    cp seccomp-strict.json $out/lib/
    cp puzzles.yaml $out/lib/
    cp prompts.yaml $out/lib/
    makeWrapper ${python}/bin/python $out/bin/leetcode-backend \
      --add-flags "$out/lib/main.py"
    runHook postInstall
  '';

  meta = {
    description = "Multiplayer LeetCode game server";
    license = lib.licenses.mit;
  };
}
