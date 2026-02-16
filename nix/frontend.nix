{ lib, buildNpmPackage }:

buildNpmPackage {
  pname = "multiplayer-leetcode-frontend";
  version = "0.0.0";

  src = ../frontend;

  npmDepsHash = "sha256-//Ods+gN8JLmlg7YR9c+mc3oAIhqje3zXrvd8jZH3Vk=";

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r dist/* $out/
    runHook postInstall
  '';
}
