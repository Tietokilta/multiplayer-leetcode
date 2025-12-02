export type KeyboardLayout = {
  normal: Record<string, string>;
  shifted: Record<string, string>;
  altGr: Record<string, string>;
  shiftedAltGr: Record<string, string>;
};

const simpleKeys = [..."1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];

export const usLayout: KeyboardLayout = (() => {
  const normal: Record<string, string> = {
    ...Object.fromEntries(simpleKeys.map((k) => [k, k.toLowerCase()])),
    GRAVE: "`",
    MINUS: "-",
    EQUAL: "=",
    LEFTBRACE: "[",
    RIGHTBRACE: "]",
    SEMICOLON: ";",
    APOSTROPHE: "'",
    BACKSLASH: "\\",
    COMMA: ",",
    DOT: ".",
    SLASH: "/",
    SPACE: " ",
  };
  const shifted: Record<string, string> = {
    ...Object.fromEntries(simpleKeys.map((k) => [k, k.toUpperCase()])),
    "1": "!",
    "2": "@",
    "3": "#",
    "4": "$",
    "5": "%",
    "6": "^",
    "7": "&",
    "8": "*",
    "9": "(",
    "0": ")",
    "GRAVE": "~",
    "MINUS": "_",
    "EQUAL": "+",
    "LEFTBRACE": "{",
    "RIGHTBRACE": "}",
    "SEMICOLON": ":",
    "APOSTROPHE": '"',
    "BACKSLASH": "|",
    "COMMA": "<",
    "DOT": ">",
    "SLASH": "?",
    "SPACE": " ",
  };
  const altGr: Record<string, string> = {};
  const shiftedAltGr: Record<string, string> = {};
  return { normal, shifted, altGr, shiftedAltGr };
})();

export const finnishLayout: KeyboardLayout = (() => {
  const normal: Record<string, string> = {
    ...Object.fromEntries(simpleKeys.map((k) => [k, k.toLowerCase()])),
    "GRAVE": "§",
    "MINUS": "+",
    "EQUAL": "\xb4",
    "LEFTBRACE": "å",
    "RIGHTBRACE": "¨",
    "SEMICOLON": "ö",
    "APOSTROPHE": "ä",
    "BACKSLASH": "'",
    "COMMA": ",",
    "DOT": ".",
    "SLASH": "-",
    "102ND": "<",
    "SPACE": " ",
  };
  const shifted: Record<string, string> = {
    ...Object.fromEntries(simpleKeys.map((k) => [k, k.toUpperCase()])),
    "1": "!",
    "2": '"',
    "3": "#",
    "4": "¤",
    "5": "%",
    "6": "&",
    "7": "/",
    "8": "(",
    "9": ")",
    "0": "=",
    "GRAVE": "½",
    "MINUS": "?",
    "EQUAL": "`",
    "LEFTBRACE": "Å",
    "RIGHTBRACE": "^",
    "SEMICOLON": "Ö",
    "APOSTROPHE": "Ä",
    "BACKSLASH": "*",
    "COMMA": ";",
    "DOT": ":",
    "SLASH": "_",
    "102ND": ">",
    "SPACE": " ",
  };
  const altGr: Record<string, string> = {
    "E": "€",
    "2": "@",
    "3": "£",
    "4": "$",
    "7": "{",
    "8": "[",
    "9": "]",
    "0": "}",
    "MINUS": "\\",
    "RIGHTBRACE": "~",
    "102ND": "|",
  };
  const shiftedAltGr: Record<string, string> = {
    ...altGr,
  };
  return { normal, shifted, altGr, shiftedAltGr };
})();
