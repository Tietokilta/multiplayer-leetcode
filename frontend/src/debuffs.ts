export type DebuffInfo = {
  type: string;
  title: string;
  description: string;
  maxStrength?: number;
};

const debuffs = {
  // Input order debuffs:
  random_order: {
    type: "order",
    title: "Who's on first",
    description: "Keyboard turns go in random order.",
  },
  auto_cycle: {
    type: "order",
    title: "NASCAR Programming",
    description: "Keyboard order cycles based on time, instead of changing per keystroke.",
    maxStrength: 50, // cycles per 10s
  },
  row_by_row: {
    type: "order",
    title: "Home Row Hero",
    description: "Instead of a defined order, each keyboard allows a different keyboard row to be used.",
  },

  // Stackable input debuffs:
  reverse_navigation: {
    type: "input1",
    title: "Lost in Space",
    description: "Reverses the direction of navigation keys.",
  },
  input_lag: {
    type: "input2",
    title: "KUKA SIIN NETIS ON",
    description: "Causes random input lag.",
  },
  key_shift: {
    type: "input3",
    title: 'Kirjoita "curry"',
    description: "Shifts all character keys to the left or right.",
  },
  invisible_cursor: {
    type: "input4",
    title: "Where's Waldo?",
    description: "Hides the cursor.",
  },
  random_duplicate: {
    type: "input5",
    title: "Sticky Keys",
    description: "Randomly duplicates typed characters.",
    maxStrength: 100, // %
  },
  caps_lock: {
    type: "input6",
    title: "Cruise Control for Cool",
    description: "Pretends Caps Lock is on.",
  },
  cursor_shift: {
    type: "input7",
    title: "Off by One",
    description: "The cursor appears a space away from its actual position.",
  },
  screensaver: {
    type: "input8",
    title: "Are You Still There?",
    description: "After brief inactivity, a DVD screensaver covers the editor.",
  },

  // Stackable visual debuffs:
  funky_fonts: {
    type: "visual1",
    title: "Comic Relief",
    description: "Makes each character appear in a random font.",
  },
  disco_mode: {
    type: "visual2",
    title: "Rave Review",
    description: "Adds a random background color to each character.",
  },
  wrong_language: {
    type: "visual3",
    title: "SyntaxError: unexpected Python",
    description: "Shows syntax errors from parsing as a wrong language.",
  },
  confetti: {
    type: "visual5",
    title: "Party Pooper",
    description: "Makes confetti appear on each keystroke.",
  },
  squiggles: {
    type: "visual6",
    title: "Impostor Syndrome",
    description: "Adds fake error squiggles to the code.",
  },
  subway_surfers: {
    type: "visual7",
    title: "Brainrot Mode",
    description: "Adds Subway Surfers to the side.",
  },
  waves: {
    type: "visual8",
    title: "Drowning in Code",
    description: "Makes the characters wave around.",
    maxStrength: 20, // px of wave amplitude
  },
  cursor_blink: {
    type: "visual9",
    title: "Blink and You'll Miss It",
    description: "Makes the cursor blink rapidly in an unsettling random pattern.",
  },

  // Big visual debuffs:
  shake: {
    type: "visual",
    title: "Earthquake Protocol",
    description: "Makes the editor shake randomly.",
    maxStrength: 50, // px
  },
  lights_out: {
    type: "visual",
    title: "Fear of the Dark",
    description: 'Makes the editor dark with a moving "window".',
    maxStrength: 10, // 1 / size of window relative to editor
  },
  adhd: {
    type: "visual",
    title: "ADHD",
    description: "Only shows the line being edited and a few lines around it.",
  },
  flip_horizontal: {
    type: "visual",
    title: "Arabic Mode",
    description: "Flips the editor horizontally.",
  },
  flip_vertical: {
    type: "visual",
    title: "import antigravity",
    description: "Flips the editor vertically.",
  },
  nausea: {
    type: "visual",
    title: "Rough Seas",
    description: "Minecraft-like nausea effect on the editor.",
  },

  // One-off debuffs:
  mess_up: {
    type: "one_off",
    title: "Keyboard Cat",
    description: "Inserts random characters when received.",
    maxStrength: 100, // chars
  },
  clippy_attack: {
    type: "one_off",
    title: "It Looks Like You're Struggling",
    description: "Makes Clippy appear and mess with the user's code.",
  },
  clippy_comments: {
    type: "one_off",
    title: "Unsolicited Advice",
    description: 'Adds "helpful" LLM comments after each line.',
  },
  angry_bird: {
    type: "one_off",
    title: "Angry Bird",
    description: "Launches an angry bird across the screen, breaking characters as it goes.",
    maxStrength: 20, // chars deleted
  },
  add_braces: {
    type: "one_off",
    title: "from __future__ import braces",
    description: "Converts all control structures to use curly braces, adding random ones if there are none.",
  },
  variable_shuffle: {
    type: "one_off",
    title: "Surprise Refactor",
    description: "Randomly renames all variables in the code.",
  },
} satisfies Record<string, DebuffInfo>;

export const debuffInfo: Record<DebuffName, DebuffInfo> = debuffs;

export type DebuffName = keyof typeof debuffs;
