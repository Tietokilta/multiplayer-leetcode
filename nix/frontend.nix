{
  lib,
  buildNpmPackage,
  src,
}:

buildNpmPackage {
  pname = "multiplayer-leetcode-frontend";
  version = "0.0.0";

  inherit src;

  npmDepsHash = "sha256-QjEmBw0ZX6AIRHgS5619PXYkeg8te8KubWgTbbLuggM=";

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r dist/* $out/
    runHook postInstall
  '';
}
