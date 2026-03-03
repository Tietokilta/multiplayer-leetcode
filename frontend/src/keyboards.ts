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

const keyRows = [
  ["GRAVE", ..."1234567890", "MINUS", "EQUAL"],
  ["TAB", ..."QWERTYUIOP", "LEFTBRACE", "RIGHTBRACE"],
  [..."ASDFGHJKL", "SEMICOLON", "APOSTROPHE", "BACKSLASH"],
  ["102ND", ..."ZXCVBNM", "COMMA", "DOT", "SLASH"],
];

export const keyToRow: Record<string, number> = Object.fromEntries(
  keyRows.flatMap((row, i) => row.map((key) => [key, i])),
);

export const nextKeyRight = Object.fromEntries(
  keyRows.flatMap((row) => row.map((key, j) => [key, row[(j + 1) % row.length]])),
);

export const reverseNavigationKeys: Record<string, string> = {
  LEFT: "RIGHT",
  RIGHT: "LEFT",
  UP: "DOWN",
  DOWN: "UP",
  HOME: "END",
  END: "HOME",
  PAGEUP: "PAGEDOWN",
  PAGEDOWN: "PAGEUP",
};
