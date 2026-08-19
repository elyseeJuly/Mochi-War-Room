# Mochi Life & Arcade — V0.1 Vertical Slice

This is the Experience Layer inside the `Mochi-War-Room` Skill package. It is
not a second product repository and it does not modify the War Room Protocol.

The slice is intentionally dependency-free and browser-first:

```bash
cd experiences/mochi-life-arcade
npm test
npm run check
python3 -m http.server 4173
```

Open `http://localhost:4173/`. The developer disclosure at the bottom exposes
replayable Public Signals for the vertical-slice path. It is not a Runtime,
Host adapter, event bus, or live Agent integration.

## Boundary

`src/domain.js` owns the narrow Public Signal adapter, persistent Resident
state normalization, and the small Experience Coordinator. `src/app.js` owns
the Pet Park presentation, Ambient Life, first-party games, and mock controls.

The arcade receives Resident visual context and attention lifecycle only. It
does not receive repository files, source code, prompts, conversations, Agent
messages, Evidence, Diffs, or provenance internals.

## Scope audit

- 2 Resident base forms: Cloud and Berry.
- 1 Encounter appearance variant: Cloud / Night.
- Pet, Snack, Toy, one Resident↔Resident social moment.
- Mochi Catch and Mochi Memory, both pausable and checkpointable.
- Level 2 interruption with Human response → Host confirmation → clear.
- Completion flag memory and Quiet Park Mode.
- No economy, progression, hunger, daily tasks, gacha, leaderboard, third-party
  runtime, Work Agent collection, or War Room Protocol change.

The local persistence test deliberately advances the clock by two weeks and
asserts that Residents do not decay.

