import Prism from "prismjs";
import "prismjs/components/prism-python";

export function getTokenTypes(code: string[][]): (string | null)[][] {
  const fullCode = code.map((line) => line.join("")).join("\n");
  const tokens = Prism.tokenize(fullCode, Prism.languages.python);

  const flat: (string | null)[] = [];

  function walkTokens(ts: (Prism.Token | string)[], parentType: string | null) {
    for (const token of ts) {
      if (typeof token === "string") {
        for (let i = 0; i < token.length; i++) flat.push(parentType);
      } else {
        const content = token.content;
        const children = Array.isArray(content) ? content : [content];
        walkTokens(children as (Prism.Token | string)[], token.type);
      }
    }
  }

  walkTokens(tokens, null);

  const result: (string | null)[][] = [];
  let idx = 0;
  for (let row = 0; row < code.length; row++) {
    const lineTypes: (string | null)[] = [];
    for (let col = 0; col < code[row].length; col++) {
      lineTypes.push(flat[idx++]);
    }
    result.push(lineTypes);
    idx++; // skip '\n' between lines
  }
  return result;
}
