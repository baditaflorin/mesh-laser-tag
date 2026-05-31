# mesh-laser-tag

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh-laser-tag-ff3838)](https://baditaflorin.github.io/mesh-laser-tag/)
[![version](https://img.shields.io/badge/version-0.1.1-blue)](https://github.com/baditaflorin/mesh-laser-tag/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> Phone-as-laser. Compass+tilt aim, GPS positions, hold-lock 2s = tagged out.

**Live → https://baditaflorin.github.io/mesh-laser-tag/**

**Source → https://github.com/baditaflorin/mesh-laser-tag**

**Tip the dev (buy a coffee) → https://www.paypal.com/paypalme/florinbadita**

---

![screenshot](docs/screenshot.png)

> Two peers, side-by-side, in the same room. Drop a `tests/demo/scenario.mjs`
> exporting `default async (a, b) => …` and run `npm run demo` to regenerate
> `docs/preview.png` plus `docs/demo-a.webm` / `docs/demo-b.webm` clips.

![preview](docs/preview.png)

## What it is

A **rootless-computing** peer-to-peer browser app. No backend of its own beyond the self-hosted WebRTC stack listed below. State lives in a Yjs mesh shared by everyone in the same room.

Read the principles → **https://baditaflorin.github.io/rootless-computing/principles.html**

## How to play

1. Type a name and tap **JOIN GAME**.
2. Tap **tap to enable compass + GPS** to arm the phone's orientation sensor
   (iOS prompts for permission here).
3. **Aim** the phone — the radar blips show every peer at their real bearing
   relative to where you're pointing. Optionally tap **share GPS position** so
   bearings use true geographic direction instead of the radar fallback layout.
4. **Hold the aim on a peer for 2 seconds** (`hold-lock`). The blip turns white
   and a ring fills; at full it fires a tag and that peer loses a life. Three
   lives gone = tagged out. The tag and the life loss sync to every peer in the
   room over the Yjs mesh.

Tags are a `room.doc.transact` on the shared `lives` map + `tags` log, so peer A
aiming-and-holding on peer B is seen by everyone, including peer C spectating.

**On desktop / no sensor:** each peer row has a **test tag** button that funnels
through the exact same mesh mutation, so the game is fully playable (and
headless-testable) without a phone gyroscope or GPS.

## Quickstart

Open the live URL on two devices in the same room (set in ⚙ settings, or scan the room QR). Everything else is in-app.

For local hacking:

```bash
git clone https://github.com/baditaflorin/mesh-common
git clone https://github.com/baditaflorin/mesh-laser-tag
cd mesh-laser-tag
npm install
npm run dev
```

`mesh-common` must sit as a **sibling** directory because `package.json` references it via `file:../mesh-common`.

## Self-hosted infrastructure

| Repo                                              | Endpoint                               | Purpose                     |
| ------------------------------------------------- | -------------------------------------- | --------------------------- |
| https://github.com/baditaflorin/signaling-server  | `wss://turn.0docker.com/ws`            | y-webrtc signaling fan-out  |
| https://github.com/baditaflorin/turn-token-server | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL |
| https://github.com/baditaflorin/coturn-hetzner    | `turn:turn.0docker.com:3479`           | TURN relay                  |

## Settings overrides

The settings drawer lets the user override signaling and TURN endpoints. localStorage keys:

- `mesh-laser-tag:signalingUrl`
- `mesh-laser-tag:turnTokenUrl`
- `mesh-laser-tag:iceServers`
- `mesh-laser-tag:room`

If endpoints are blank or unreachable, the app falls back to STUN-only.

## Version + commit on every screen

The bottom-right footer on every screen of the live app shows:

- `source` → this repo
- `tip ♥` → PayPal
- `vX.Y.Z · <short-sha>` — version from `package.json` plus the build-time git commit

## Build & deploy

GitHub Pages serves the committed `docs/` directory on the `main` branch. There is no GitHub Actions build workflow; local Husky-style hooks gate formatting / typecheck / smoke build before each push.

```bash
npm run smoke                                    # build + sanity-check docs/
bash ../mesh-common/scripts/screenshot-app.sh    # regenerate docs/screenshot.png
```

## Privacy

See `docs/privacy.md` for the threat model — what other peers in the mesh see, what the self-hosted infra sees, what stays local.

## License

MIT — see `LICENSE`.
