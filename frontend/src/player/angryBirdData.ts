import { DocumentImageCache } from "./DocumentImageCache";

export const angryBirdCache = new DocumentImageCache("/angry_bird");

export function preloadAngryBird() {
  angryBirdCache.get("red", document);
  angryBirdCache.get("slingshot", document);
}
