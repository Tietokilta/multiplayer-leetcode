export enum Debuff {
  random_order = "random_order",
  auto_cycle = "auto_cycle",
  row_by_row = "row_by_row",
  reverse_navigation = "reverse_navigation",
  input_lag = "input_lag",
  key_shift = "key_shift",
  invisible_cursor = "invisible_cursor",
  random_duplicate = "random_duplicate",
  caps_lock = "caps_lock",
  cursor_shift = "cursor_shift",
  screensaver = "screensaver",
  funky_fonts = "funky_fonts",
  disco_mode = "disco_mode",
  emoji_confetti = "emoji_confetti",
  confetti = "confetti",
  squiggles = "squiggles",
  subway_surfers = "subway_surfers",
  waves = "waves",
  cursor_blink = "cursor_blink",
  shake = "shake",
  lights_out = "lights_out",
  fog_of_war = "fog_of_war",
  flip_horizontal = "flip_horizontal",
  flip_vertical = "flip_vertical",
  nausea = "nausea",
  hyperfocus = "hyperfocus",
  keyboard_cat = "keyboard_cat",
  clippy_attack = "clippy_attack",
  clippy_comments = "clippy_comments",
  angry_bird = "angry_bird",
  clippy_syntax = "clippy_syntax",
  clippy_refactor = "clippy_refactor",
}

export const clippyDebuffs = [
  Debuff.clippy_attack,
  Debuff.clippy_comments,
  Debuff.clippy_refactor,
  Debuff.clippy_syntax,
];

export type DebuffInfo = {
  type: string;
  title: string;
  description: string;
  maxStrength?: number;
  defaultStrength?: number;
  defaultDuration?: number;
};

export const debuffInfo: Record<Debuff, DebuffInfo> = {
  // Input order debuffs:
  [Debuff.random_order]: {
    // TODO test
    type: "order",
    title: "Who's on first",
    description: "Keyboard turns go in random order.",
  },
  [Debuff.auto_cycle]: {
    // TODO test
    type: "order",
    title: "NASCAR Programming",
    description: "Keyboard order cycles based on time, instead of changing per keystroke.",
    maxStrength: 50, // cycles per 10s
    defaultStrength: 20,
  },
  [Debuff.row_by_row]: {
    // TODO test
    type: "order",
    title: "Home Row Hero",
    description: "Instead of a defined order, each keyboard allows a different keyboard row to be used.",
  },

  // Stackable input debuffs:
  [Debuff.reverse_navigation]: {
    type: "input1",
    title: "Lost in Space",
    description: "Reverses the direction of navigation keys.",
  },
  [Debuff.input_lag]: {
    type: "input2",
    title: "KUKA SIIN NETIS ON",
    description: "Causes random input lag.",
    maxStrength: 2000, // ms of lag
    defaultStrength: 1000,
  },
  [Debuff.key_shift]: {
    type: "input3",
    title: 'Kirjoita "curry"',
    description: "Shifts all character keys to the left or right.",
  },
  [Debuff.invisible_cursor]: {
    type: "input4",
    title: "Where's Waldo?",
    description: "Hides the cursor.",
  },
  [Debuff.random_duplicate]: {
    type: "input5",
    title: "Sticky Keys",
    description: "Randomly duplicates typed characters.",
    maxStrength: 50, // % chance
    defaultStrength: 15,
  },
  [Debuff.caps_lock]: {
    type: "input6",
    title: "CRUISE CONTROL FOR COOL",
    description: "Pretends Caps Lock is on.",
  },
  [Debuff.cursor_shift]: {
    type: "input7",
    title: "Off by One",
    description: "The cursor appears a space away from its actual position.",
  },
  [Debuff.screensaver]: {
    type: "input8",
    title: "Are You Still There?",
    description: "After brief inactivity, a DVD screensaver covers the editor.",
    maxStrength: 10000, // 10000 - ms of inactivity before screensaver
    defaultStrength: 8000,
    defaultDuration: 60,
  },

  // Stackable visual debuffs:
  [Debuff.funky_fonts]: {
    type: "visual1",
    title: "Comic Relief",
    description: "Makes each character appear in a random font.",
  },
  [Debuff.disco_mode]: {
    type: "visual2",
    title: "Rave Review",
    description: "Adds a random background color to each character.",
  },
  [Debuff.emoji_confetti]: {
    type: "visual4",
    title: "😂😂😂",
    description: "Makes emoji appear on each keystroke.",
    defaultDuration: 60,
  },
  [Debuff.confetti]: {
    type: "visual5",
    title: "Party Pooper",
    description: "Makes confetti appear on each keystroke.",
    defaultDuration: 60,
  },
  [Debuff.squiggles]: {
    // TODO
    type: "visual6",
    title: "Impostor Syndrome",
    description: "Adds fake error squiggles to the code.",
  },
  [Debuff.subway_surfers]: {
    type: "visual7",
    title: "Brainrot Mode",
    description: "Adds Subway Surfers to the side.",
    defaultDuration: 60,
  },
  [Debuff.waves]: {
    type: "visual8",
    title: "Drowning in Code",
    description: "Makes the characters wave around.",
    maxStrength: 20, // px of wave amplitude
    defaultStrength: 10,
  },
  [Debuff.cursor_blink]: {
    type: "visual9",
    title: "Blink and You'll Miss It",
    description: "Makes the cursor blink rapidly in an unsettling random pattern.",
  },

  // Big visual debuffs:
  [Debuff.shake]: {
    type: "visual",
    title: "Earthquake Protocol",
    description: "Makes the editor shake randomly.",
  },
  [Debuff.lights_out]: {
    type: "visual",
    title: "Fear of the Dark",
    description: 'Makes the editor dark with a moving "window".',
    maxStrength: 40, // 10 / size of window relative to editor
    defaultStrength: 20,
  },
  [Debuff.fog_of_war]: {
    type: "visual",
    title: "Fog of War",
    description: "Only shows the line being edited and the two lines around it.",
  },
  [Debuff.flip_horizontal]: {
    type: "visual",
    title: "Arabic Mode",
    description: "Flips the editor horizontally.",
  },
  [Debuff.flip_vertical]: {
    type: "visual",
    title: "import antigravity",
    description: "Flips the editor vertically.",
  },
  [Debuff.nausea]: {
    type: "visual",
    title: "Rough Seas",
    description: "Minecraft-like nausea effect on the editor.",
    maxStrength: 7, // stuff is scaled down diagonally by strength * 0.1
    defaultStrength: 3,
  },
  [Debuff.hyperfocus]: {
    // TODO
    type: "visual",
    title: "Hyperfocus",
    description: "Zooms in the characters near the cursor.",
  },

  // One-off debuffs:
  [Debuff.keyboard_cat]: {
    type: "one_off",
    title: "Keyboard Cat",
    description: "Inserts random characters when received.",
    maxStrength: 100, // chars
    defaultStrength: 25,
    defaultDuration: 20,
  },
  [Debuff.clippy_attack]: {
    type: "one_off",
    title: "It Looks Like You're Struggling",
    description: "Clippy adds bugs to the user's code.",
    defaultDuration: 25,
  },
  [Debuff.clippy_comments]: {
    type: "one_off",
    title: "Unsolicited Advice",
    description: 'Clippy adds "helpful" LLM comments after each line.',
    defaultDuration: 25,
  },
  [Debuff.angry_bird]: {
    // TODO
    type: "one_off",
    title: "Angry Bird",
    description: "Launches an angry bird across the screen, breaking characters as it goes.",
    maxStrength: 30, // chars deleted
    defaultStrength: 15,
  },
  [Debuff.clippy_syntax]: {
    type: "one_off",
    title: "from __future__ import braces",
    description: "Converts all control structures to use curly braces, adding random ones if there are none.",
  },
  [Debuff.clippy_refactor]: {
    type: "one_off",
    title: "Surprise Refactor",
    description: "Clippy randomly renames all variables in the code.",
  },
};
