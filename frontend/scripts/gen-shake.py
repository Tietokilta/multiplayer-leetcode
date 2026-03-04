#!/usr/bin/env python3
"""Generate CSS keyframes for the shake debuff animation.

Usage: python gen-shake.py [shake_pct] [amplitude] [steps]
  shake_pct  - % of animation spent shaking (default: 40)
  amplitude  - max px displacement (default: 16)
  steps      - number of shake keyframes (default: 20)
"""
import random
import sys

shake_pct = int(sys.argv[1]) if len(sys.argv) > 1 else 40
amplitude = int(sys.argv[2]) if len(sys.argv) > 2 else 16
steps = int(sys.argv[3]) if len(sys.argv) > 3 else 20
spread = int(sys.argv[4]) if len(sys.argv) > 4 else 45  # ± degrees from opposite

step_size = shake_pct / steps

print(
    f"/* shake_pct={shake_pct} amplitude={amplitude} steps={steps} spread={spread} */"
)

print("@keyframes shake {")
print(f"  0%,")
print(f"  {shake_pct}%,")
print(f"  100% {{")
print(f"    transform: translate(0, 0);")
print(f"  }}")

import math

angle = random.uniform(0, 360)
for i in range(1, steps):
    pct = round(i * step_size, 1)
    angle += random.randint(180 - spread, 180 + spread)
    r = random.randint(amplitude // 2, amplitude)
    x = round(r * math.cos(math.radians(angle)))
    y = round(r * math.sin(math.radians(angle)))
    pct_str = f"{pct:g}%"
    print(f"  {pct_str} {{ transform: translate({x}px, {y}px); }}")

print("}")
