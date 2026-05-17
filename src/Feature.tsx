import { useEffect, useMemo } from "react";
import {
  ArmGate,
  ConfettiLayer,
  Leaderboard,
  useConfetti,
  useEventLog,
  useFlashOnChange,
  useNamedPeer,
  usePerPeerValue,
  type MeshConfig,
  type YRoom,
} from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Tag = { id: string; peerId: string; target: string; ts: number };

const START_LIVES = 3;

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
  const { burst } = useConfetti();
  const lastTagId = log.events.length > 0 ? log.events[log.events.length - 1]!.id : null;
  const flash = useFlashOnChange(lastTagId);

  useEffect(() => {
    if (flash) burst({ origin: "center", count: 40, hueRange: [350, 10] });
  }, [flash, burst]);

  const allPeers = useMemo(() => {
    const ids = new Set<string>([room.peerId, ...Object.keys(names), ...Object.keys(lives.all)]);
    return Array.from(ids);
  }, [room.peerId, names, lives.all]);
  const others = allPeers.filter((id) => id !== room.peerId);

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

  const tagPeer = (target: string) => {
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

  const recent = log.latest(8);
  const present = room.peerCount + 1;

  return (
    <div className="tag-screen">
      <ConfettiLayer />
      <header className="tag-header">
        <h1>laser tag</h1>
        <p className="tag-status">
          {present} {present === 1 ? "peer" : "peers"} · {log.size} tags · {lives.size} alive
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

      <ArmGate label="tap to enable compass + GPS" hint="point phone at peer to aim">
        {() => <p className="tag-armed">sensors armed - point and hold</p>}
      </ArmGate>

      <button type="button" className="tag-join" onClick={join} disabled={!name.trim()}>
        JOIN GAME
      </button>

      <div className="tag-radar" aria-hidden="true">
        <svg viewBox="-50 -50 100 100" className="tag-radar-svg">
          <circle cx="0" cy="0" r="48" className="tag-radar-ring" />
          <circle cx="0" cy="0" r="24" className="tag-radar-ring" />
          <line x1="0" y1="-48" x2="0" y2="48" className="tag-radar-cross" />
          <line x1="-48" y1="0" x2="48" y2="0" className="tag-radar-cross" />
          {others.map((id, i) => {
            const ang = (i / Math.max(1, others.length)) * Math.PI * 2;
            const r = 36;
            return (
              <circle
                key={id}
                cx={Math.sin(ang) * r}
                cy={-Math.cos(ang) * r}
                r="4"
                className="tag-radar-blip"
                style={{ opacity: (lives.all[id] ?? START_LIVES) > 0 ? 1 : 0.25 }}
              />
            );
          })}
        </svg>
      </div>

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
        {recent.map((t) => (
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
