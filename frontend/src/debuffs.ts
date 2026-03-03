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
  wrong_language = "wrong_language",
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
  mess_up = "mess_up",
  clippy_attack = "clippy_attack",
  clippy_comments = "clippy_comments",
  angry_bird = "angry_bird",
  add_braces = "add_braces",
  variable_shuffle = "variable_shuffle",
}

export type DebuffInfo = {
  type: string;
  title: string;
  description: string;
  maxStrength?: number;
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
    // TODO
    type: "input2",
    title: "KUKA SIIN NETIS ON",
    description: "Causes random input lag.",
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
    // TODO
    type: "input5",
    title: "Sticky Keys",
    description: "Randomly duplicates typed characters.",
    maxStrength: 100, // % chance
  },
  [Debuff.caps_lock]: {
    // TODO
    type: "input6",
    title: "Cruise Control for Cool",
    description: "Pretends Caps Lock is on.",
  },
  [Debuff.cursor_shift]: {
    type: "input7",
    title: "Off by One",
    description: "The cursor appears a space away from its actual position.",
  },
  [Debuff.screensaver]: {
    // TODO
    type: "input8",
    title: "Are You Still There?",
    description: "After brief inactivity, a DVD screensaver covers the editor.",
  },

  // Stackable visual debuffs:
  [Debuff.funky_fonts]: {
    // TODO
    type: "visual1",
    title: "Comic Relief",
    description: "Makes each character appear in a random font.",
  },
  [Debuff.disco_mode]: {
    // TODO
    type: "visual2",
    title: "Rave Review",
    description: "Adds a random background color to each character.",
  },
  [Debuff.wrong_language]: {
    // TODO
    type: "visual3",
    title: "SyntaxError: unexpected Python",
    description: "Shows syntax errors from parsing as a wrong language.",
  },
  [Debuff.confetti]: {
    // TODO
    type: "visual5",
    title: "Party Pooper",
    description: "Makes confetti appear on each keystroke.",
  },
  [Debuff.squiggles]: {
    // TODO
    type: "visual6",
    title: "Impostor Syndrome",
    description: "Adds fake error squiggles to the code.",
  },
  [Debuff.subway_surfers]: {
    // TODO
    type: "visual7",
    title: "Brainrot Mode",
    description: "Adds Subway Surfers to the side.",
  },
  [Debuff.waves]: {
    // TODO
    type: "visual8",
    title: "Drowning in Code",
    description: "Makes the characters wave around.",
    maxStrength: 20, // px of wave amplitude
  },
  [Debuff.cursor_blink]: {
    type: "visual9",
    title: "Blink and You'll Miss It",
    description: "Makes the cursor blink rapidly in an unsettling random pattern.",
  },

  // Big visual debuffs:
  [Debuff.shake]: {
    // TODO
    type: "visual",
    title: "Earthquake Protocol",
    description: "Makes the editor shake randomly.",
    maxStrength: 50, // px
  },
  [Debuff.lights_out]: {
    // TODO
    type: "visual",
    title: "Fear of the Dark",
    description: 'Makes the editor dark with a moving "window".',
    maxStrength: 10, // 1 / size of window relative to editor
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
  },
  [Debuff.hyperfocus]: {
    // TODO
    type: "visual",
    title: "Hyperfocus",
    description: "Zooms in the characters near the cursor.",
  },

  // One-off debuffs:
  [Debuff.mess_up]: {
    // TODO
    type: "one_off",
    title: "Keyboard Cat",
    description: "Inserts random characters when received.",
    maxStrength: 100, // chars
  },
  [Debuff.clippy_attack]: {
    // TODO
    type: "one_off",
    title: "It Looks Like You're Struggling",
    description: "Makes Clippy appear and mess with the user's code.",
  },
  [Debuff.clippy_comments]: {
    // TODO
    type: "one_off",
    title: "Unsolicited Advice",
    description: 'Adds "helpful" LLM comments after each line.',
  },
  [Debuff.angry_bird]: {
    // TODO
    type: "one_off",
    title: "Angry Bird",
    description: "Launches an angry bird across the screen, breaking characters as it goes.",
    maxStrength: 20, // chars deleted
  },
  [Debuff.add_braces]: {
    // TODO
    type: "one_off",
    title: "from __future__ import braces",
    description: "Converts all control structures to use curly braces, adding random ones if there are none.",
  },
  [Debuff.variable_shuffle]: {
    // TODO
    type: "one_off",
    title: "Surprise Refactor",
    description: "Randomly renames all variables in the code.",
  },
};
