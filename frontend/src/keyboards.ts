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

export const keyToRow: Record<string, number> = {
  ...Object.fromEntries("1234567890".split("").map((k) => [`KEY_${k}`, 0])),
  ...Object.fromEntries("QWERTYUIOP".split("").map((k) => [`KEY_${k}`, 1])),
  ...Object.fromEntries("ASDFGHJKL".split("").map((k) => [`KEY_${k}`, 2])),
  ...Object.fromEntries("ZXCVBNM".split("").map((k) => [`KEY_${k}`, 3])),
  KEY_GRAVE: 0,
  KEY_MINUS: 0,
  KEY_EQUAL: 0,
  KEY_TAB: 1,
  KEY_LEFTBRACE: 1,
  KEY_RIGHTBRACE: 1,
  KEY_SEMICOLON: 2,
  KEY_APOSTROPHE: 2,
  KEY_BACKSLASH: 2,
  KEY_COMMA: 3,
  KEY_DOT: 3,
  KEY_SLASH: 3,
  KEY_102ND: 3,
};
