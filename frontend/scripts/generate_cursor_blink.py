#!/usr/bin/env python3
"""Generate CSS @keyframes for an unsettling cursor blink animation.

Run:  python3 generate_cursor_blink.py
Then paste the output into index.css.
"""

import random

SEED = 1337
DURATION = 24  # seconds (>= 20 required)


def main() -> None:
    rng = random.Random(SEED)

    # List of (time_seconds, opacity) events
    events: list[tuple[float, int]] = [(0.0, 1)]

    t = 0.0
    while t < DURATION - 0.5:
        phase = rng.choices(
            ["rapid", "slow_off", "pause", "triple", "normal"],
            weights=[20, 10, 40, 15, 15],
        )[0]

        if phase == "rapid":
            # Quick succession of blinks – unsettling flicker
            n = rng.randint(4, 10)
            off_t = rng.uniform(0.03, 0.10)
            on_t = rng.uniform(0.06, 0.18)
            for _ in range(n):
                events.append((t, 0))
                t += off_t
                events.append((t, 1))
                t += on_t

        elif phase == "slow_off":
            # Cursor goes dark for a while
            events.append((t, 0))
            t += rng.uniform(0.2, 0.7)
            events.append((t, 1))
            t += rng.uniform(0.15, 0.5)

        elif phase == "pause":
            # Cursor stays visible
            t += rng.uniform(0.4, 2.0)

        elif phase == "triple":
            # Three quick distinct blinks
            gap = rng.uniform(0.06, 0.18)
            on = rng.uniform(0.06, 0.18)
            for _ in range(3):
                events.append((t, 0))
                t += gap
                events.append((t, 1))
                t += on

        elif phase == "normal":
            # Single blink at moderate speed
            events.append((t, 0))
            t += rng.uniform(0.1, 0.35)
            events.append((t, 1))
            t += rng.uniform(0.2, 0.8)

    # End with cursor visible at exactly DURATION
    events = [(ts, op) for ts, op in events if ts < DURATION]
    events.append((DURATION, 1))

    # Sort and remove consecutive duplicate opacities
    events.sort()
    deduped: list[tuple[float, int]] = [events[0]]
    for ts, op in events[1:]:
        if op != deduped[-1][1]:
            deduped.append((ts, op))
    events = deduped

    # Enforce max on-gap: insert a quick blink if cursor stays on too long
    MAX_ON_GAP = 1.5  # seconds
    i = 0
    while i < len(events) - 1:
        ts1, op1 = events[i]
        ts2, _ = events[i + 1]
        if op1 == 1 and ts2 - ts1 > MAX_ON_GAP:
            mid = (ts1 + ts2) / 2
            events.insert(i + 1, (mid + 0.06, 1))
            events.insert(i + 1, (mid - 0.06, 0))
            # re-check first half
        else:
            i += 1

    # Group keyframes by state and emit as two merged blocks
    on_pcts  = [f"{ts / DURATION * 100:.3f}%" for ts, op in events if op == 1]
    off_pcts = [f"{ts / DURATION * 100:.3f}%" for ts, op in events if op == 0]

    print("@keyframes cursor-blink {")
    print(f"  {', '.join(on_pcts)}  {{ background-color: white; color: black; }}")
    print(f"  {', '.join(off_pcts)} {{ background-color: unset; color: unset; }}")
    print("}")


if __name__ == "__main__":
    main()
