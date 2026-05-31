import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArmGate,
  ConfettiLayer,
  Leaderboard,
  useCompass,
  useConfetti,
  useEventLog,
  useFlashOnChange,
  useNamedPeer,
  usePerPeerValue,
  useSharedLocation,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Tag = { id: string; peerId: string; target: string; ts: number };

const START_LIVES = 3;
/** Half-width of the aim cone, in degrees. A peer counts as "aimed at" when its
 *  relative bearing is within ±AIM_CONE_DEG of straight ahead (0°). */
const AIM_CONE_DEG = 18;
/** Hold the aim on one target for this long → tag. Advertised "hold-lock 2s". */
const HOLD_LOCK_MS = 2000;

/** Geographic initial bearing (great-circle) from point a to point b, 0..360,
 *  0 = north. Used when real GPS fixes are available for both peers. */
function geoBearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
}

/** Signed shortest angular difference b - a, normalised to (−180, 180]. */
function angleDelta(a: number, b: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d === -180) d = 180;
  return d;
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="tag-screen">
        <h1>laser tag</h1>
        <p className="tag-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const { name, setName, names, nameOf, myName } = useNamedPeer(config, room);
  const log = useEventLog<Tag>(room, "tags");
  const lives = usePerPeerValue<number>(room, "lives", START_LIVES);
  const loc = useSharedLocation(room, config.appName);
  const { burst } = useConfetti();
  const lastTagId = log.events.length > 0 ? log.events[log.events.length - 1]!.id : null;
  const flash = useFlashOnChange(lastTagId);

  useEffect(() => {
    if (flash) burst({ origin: "center", count: 40, hueRange: [350, 10] });
  }, [flash, burst]);

  const allPeers = useMemo(() => {
    const ids = new Set<string>([
      room.peerId,
      ...Object.keys(names),
      ...Object.keys(lives.all),
      ...Object.keys(loc.fixes),
    ]);
    return Array.from(ids);
  }, [room.peerId, names, lives.all, loc.fixes]);
  const others = useMemo(
    () => allPeers.filter((id) => id !== room.peerId),
    [allPeers, room.peerId],
  );

  const tagsGiven = (peerId: string) => log.events.filter((t) => t.peerId === peerId).length;

  const board = allPeers
    .map((id) => ({
      id,
      name: id === room.peerId ? myName : (nameOf(id) ?? `peer-${id.slice(0, 6)}`),
      score: tagsGiven(id),
      sub: `${lives.all[id] ?? START_LIVES} hp`,
      isMe: id === room.peerId,
    }))
    .sort((a, b) => b.score - a.score);

  const join = () => lives.setMy(START_LIVES);

  // The single mutation that actually crosses the mesh. Both the real
  // aim-and-hold path and the testable "test tag" button funnel through it.
  const tagPeerRef = useRef<(target: string) => void>(() => {});
  tagPeerRef.current = (target: string) => {
    if (!name.trim()) return;
    const cur = lives.valueOf(target) ?? START_LIVES;
    if (cur <= 0) return;
    room.doc.transact(() => {
      log.push({
        id: Math.random().toString(36).slice(2, 12),
        peerId: room.peerId,
        target,
        ts: Date.now(),
      });
      room.doc.getMap<number>("lives").set(target, Math.max(0, cur - 1));
    });
  };
  const tagPeer = (target: string) => tagPeerRef.current(target);

  /**
   * Real relative bearing of every peer vs. where my phone points.
   * - Geographic bearing when both my GPS fix and the peer's are known.
   * - Otherwise a deterministic per-peer fallback bearing so the radar + aim
   *   still work on desktop / in headless tests (no GPS, no compass hardware).
   * The blip on the radar is placed at (peerBearing − myHeading), i.e. its true
   * direction relative to the phone's current facing.
   */
  const bearingOf = (id: string, idx: number): number => {
    const mine = loc.mine;
    const theirs = loc.fixes[id];
    if (mine && theirs) return geoBearing(mine, theirs);
    // Fallback: spread peers evenly around the circle, deterministically.
    return (idx / Math.max(1, others.length)) * 360;
  };

  return (
    <div className="tag-screen">
      <ConfettiLayer />
      <header className="tag-header">
        <h1>laser tag</h1>
        <p className="tag-status">
          {room.peerCount + 1} {room.peerCount + 1 === 1 ? "peer" : "peers"} · {log.size} tags ·{" "}
          {lives.size} alive
        </p>
      </header>

      <div className="tag-name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={48}
          aria-label="your name"
        />
      </div>

      <ArmGate
        label="tap to enable compass + GPS"
        hint="point phone at peer to aim, hold 2s to tag"
      >
        {(armed) => (
          <Aimer
            armed={armed}
            others={others}
            bearingOf={bearingOf}
            nameOf={(id) => nameOf(id) ?? `peer-${id.slice(0, 6)}`}
            lives={lives.all}
            loc={loc}
            onTag={tagPeer}
            canTag={!!name.trim()}
          />
        )}
      </ArmGate>

      <button type="button" className="tag-join" onClick={join} disabled={!name.trim()}>
        JOIN GAME
      </button>

      <ul className="tag-peer-list">
        {allPeers.map((id) => {
          const n = id === room.peerId ? myName : (nameOf(id) ?? `peer-${id.slice(0, 6)}`);
          const l = lives.all[id] ?? START_LIVES;
          return (
            <li key={id} className="tag-peer-row">
              <span className="tag-peer-name">{n}</span>
              <span
                className={`tag-lives ${l === 0 ? "is-out" : ""}`}
                data-peer-name={n}
                data-peer-id={id}
              >
                {l}
              </span>
              {id !== room.peerId && (
                <button
                  type="button"
                  className="tag-test-tag"
                  data-target={id}
                  aria-label={`test tag ${n}`}
                  onClick={() => tagPeer(id)}
                >
                  test tag {n}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="tag-log" aria-label="recent tags">
        {log.latest(8).map((t) => (
          <p key={t.id} className="tag-log-row">
            <span>{nameOf(t.peerId) ?? `peer-${t.peerId.slice(0, 6)}`}</span>
            <span> tagged </span>
            <span>{nameOf(t.target) ?? `peer-${t.target.slice(0, 6)}`}</span>
          </p>
        ))}
      </div>

      <Leaderboard items={board} highlightId={room.peerId} title="tags given" />
    </div>
  );
}

/**
 * The real advertised interaction. Reads the live compass heading, places radar
 * blips at each peer's true relative bearing, and tags whichever peer the phone
 * is aimed at once the aim is held continuously for HOLD_LOCK_MS.
 *
 * Headless/desktop: dispatching synthetic `deviceorientation` events drives
 * `useCompass`; with no GPS the per-peer fallback bearings give every peer a
 * stable target angle, so aim+hold is fully exercisable without hardware.
 */
function Aimer({
  armed,
  others,
  bearingOf,
  nameOf,
  lives,
  loc,
  onTag,
  canTag,
}: {
  armed: boolean;
  others: string[];
  bearingOf: (id: string, idx: number) => number;
  nameOf: (id: string) => string;
  lives: Record<string, number>;
  loc: ReturnType<typeof useSharedLocation>;
  onTag: (target: string) => void;
  canTag: boolean;
}) {
  const compass = useCompass({ armed });
  const heading = compass.heading ?? 0;

  // Which peer is currently in the aim cone (closest to centre wins).
  const aimed = useMemo(() => {
    let best: { id: string; rel: number } | null = null;
    others.forEach((id, idx) => {
      if ((lives[id] ?? START_LIVES) <= 0) return;
      const rel = angleDelta(heading, bearingOf(id, idx));
      if (Math.abs(rel) <= AIM_CONE_DEG && (best == null || Math.abs(rel) < Math.abs(best.rel))) {
        best = { id, rel };
      }
    });
    return best as { id: string; rel: number } | null;
  }, [others, heading, bearingOf, lives]);

  // Hold-lock: progress from 0→1 while aimed at the SAME peer; fire onTag at 1.
  const [progress, setProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const holdTargetRef = useRef<string | null>(null);
  const aimedId = aimed?.id ?? null;
  const onTagRef = useRef(onTag);
  onTagRef.current = onTag;

  useEffect(() => {
    if (!armed || !canTag || aimedId == null) {
      holdStartRef.current = null;
      holdTargetRef.current = null;
      setProgress(0);
      return;
    }
    // Aim moved to a different peer → restart the hold clock.
    if (holdTargetRef.current !== aimedId) {
      holdTargetRef.current = aimedId;
      holdStartRef.current = Date.now();
      setProgress(0);
    }
    let raf = 0;
    const tick = () => {
      const start = holdStartRef.current;
      const target = holdTargetRef.current;
      if (start == null || target == null) return;
      const elapsed = Date.now() - start;
      const p = Math.min(1, elapsed / HOLD_LOCK_MS);
      setProgress(p);
      if (p >= 1) {
        onTagRef.current(target);
        // Reset the clock so a continued hold re-tags after another 2s.
        holdStartRef.current = Date.now();
        setProgress(0);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [armed, canTag, aimedId]);

  const aimedName = aimedId ? nameOf(aimedId) : null;

  return (
    <div className="tag-aimer" data-armed={armed ? "1" : "0"}>
      <p
        className="tag-armed"
        data-heading={compass.ready ? String(heading) : ""}
        data-aimed-id={aimedId ?? ""}
        data-aimed-name={aimedName ?? ""}
        data-hold={progress.toFixed(2)}
      >
        {compass.ready
          ? aimedName
            ? `aiming at ${aimedName} — hold ${Math.ceil((HOLD_LOCK_MS * (1 - progress)) / 1000)}s`
            : `facing ${compass.cardinal ?? "?"} (${heading}°) — sweep onto a peer`
          : "sensors armed — point and hold"}
      </p>

      <div className="tag-radar">
        <svg viewBox="-50 -50 100 100" className="tag-radar-svg" role="img" aria-label="radar">
          <circle cx="0" cy="0" r="48" className="tag-radar-ring" />
          <circle cx="0" cy="0" r="24" className="tag-radar-ring" />
          <line x1="0" y1="-48" x2="0" y2="48" className="tag-radar-cross" />
          <line x1="-48" y1="0" x2="48" y2="0" className="tag-radar-cross" />
          {/* Aim cone, fixed pointing "up" (straight ahead). */}
          <path
            className="tag-radar-cone"
            d={`M0 0 L${Math.sin((-AIM_CONE_DEG * Math.PI) / 180) * 48} ${
              -Math.cos((-AIM_CONE_DEG * Math.PI) / 180) * 48
            } A48 48 0 0 1 ${Math.sin((AIM_CONE_DEG * Math.PI) / 180) * 48} ${
              -Math.cos((AIM_CONE_DEG * Math.PI) / 180) * 48
            } Z`}
          />
          {others.map((id, i) => {
            // Relative bearing: where the peer sits vs. where the phone points.
            const rel = (angleDelta(heading, bearingOf(id, i)) * Math.PI) / 180;
            const r = 36;
            const out = (lives[id] ?? START_LIVES) <= 0;
            return (
              <circle
                key={id}
                cx={Math.sin(rel) * r}
                cy={-Math.cos(rel) * r}
                r="4"
                className={`tag-radar-blip ${aimedId === id ? "is-aimed" : ""}`}
                data-peer-id={id}
                style={{ opacity: out ? 0.25 : 1 }}
              />
            );
          })}
          {/* Hold-lock progress ring. */}
          {progress > 0 && (
            <circle
              cx="0"
              cy="0"
              r="44"
              className="tag-radar-hold"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
            />
          )}
        </svg>
      </div>

      <button
        type="button"
        className="tag-gps-toggle"
        onClick={loc.toggle}
        aria-pressed={loc.isSharing}
      >
        {loc.isSharing ? "GPS on — sharing position" : "share GPS position"}
      </button>
      {loc.error && <p className="tag-gps-error">{loc.error}</p>}
    </div>
  );
}
