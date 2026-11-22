# GHOSTLINE — a stealth infiltration game

You are **Wren**, an infiltrator slipping through 8 facilities of the Meridian
Combine to reach each exit unseen. Guards patrol with real vision cones that
wrap around walls and crates. Cameras sweep the halls. Crates block sight,
bushes hide you, dark shadow floors swallow you. A detection meter fills as
you are seen: guards go calm → suspicious → alarmed, investigate noises and
last-known positions, and chase on alarm.

## How to run

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. No build step, no network
requests — the game is static files under `game/`.

## How to play

- **WASD / Arrow keys** — move
- **Shift** — sneak (slower, quieter, harder to spot)
- **E** — interact (pick up keycards and shards, hack terminals)
- **Q** — throw a noisemaker forward (guards investigate the ping)
- **Click** — throw a noisemaker at that tile
- **F** — smoke pellet (hide inside the cloud)
- **R** — veil cloak (brief invisibility)
- **P** — pause · **M** — mute

Locked doors need a keycard. Terminals blind every camera for 20 seconds.
Collect data shards for bonus points. Each facility rates you **GHOST**
(never seen), **SHADOW** (suspicion only) or **DETECTED** (alarm raised),
with time bonuses against par. Progress and ratings save in the browser.

## Systems

- Guard AI: patrols with pauses and glances, suspicion, investigation of
  noises and last-known positions, chase, and area search
- Camera sweeps with their own detection meters and a hackable blind state
- Cover: crates block sight and movement, bushes hide you, shadow floors
  halve visibility, smoke clouds hide you
- Gadgets: noisemakers, smoke pellets, veil cloak — limited per facility
- Keycards, locked doors, hackable terminals, data shards
- Campaign score, per-facility ratings, level select, live minimap
- Synthesized WebAudio sound (footsteps, alerts, pickups, ambient drone) —
  no audio files

## Screenshots

`?shot=title`, `?shot=play`, `?shot=alarm` and `?shot=win` render fixed
scenes of the game's own code for screenshots.
