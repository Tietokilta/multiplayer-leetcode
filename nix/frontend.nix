{
  lib,
  buildNpmPackage,
  src,
}:

buildNpmPackage {
  pname = "multiplayer-leetcode-frontend";
  version = "0.0.0";

  inherit src;

  npmDepsHash = "sha256-HylViUWrGi8gDawLSnQ9sdDOFwq1UThSlWZ60nyySFU=";

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r dist/* $out/
    runHook postInstall
  '';
}
