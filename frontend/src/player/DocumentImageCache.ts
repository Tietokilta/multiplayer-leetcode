export class DocumentImageCache {
  private cache: Map<Document, Map<string, HTMLImageElement>> = new Map();

  constructor(private basePath: string) {}

  get(name: string, document: Document): HTMLImageElement {
    if (!this.cache.has(document)) {
      this.cache.set(document, new Map());
    }
    const docCache = this.cache.get(document)!;
    if (!docCache.has(name)) {
      const img = document.createElement("img");
      img.src = `${this.basePath}/${name}.png`;
      img.addEventListener("error", () => {
        console.error(`Failed to load image: ${img.src}`);
      });
      docCache.set(name, img);
    }
    return docCache.get(name)!;
  }
}
