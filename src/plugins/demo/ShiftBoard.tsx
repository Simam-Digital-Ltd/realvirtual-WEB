// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The shift board — who is in, who is where, and the fire roll.
 *
 * The gamified layer is deliberately built on the one number a site has a
 * legal reason to know: how many people are on the premises. Crew bars fill
 * as people badge in, a crew that is complete gets its tick, and the
 * milestones — first in, a full crew, everyone on site — pop as toasts. It
 * plays like a game and reads like a fire-roll board, because it is one.
 *
 * Crew colours are the cap colours in the scene (`CREW_COLOUR`), so a chip
 * here and a hairnet on the floor mean the same crew.
 *
 * "Simulated roster" is printed on the board, not tucked in a tooltip: the
 * twin's standing rule is that nothing invented is presented as measured.
 */

import React, { useEffect, useRef, useState } from 'react';
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';
import FiberManualRecord from '@mui/icons-material/FiberManualRecord';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { EventEmitter } from '../../core/rv-events';
import type { RVViewer } from '../../core/rv-viewer';
import { formatClock, type CrewId, type ShiftEvent, type ShiftSnapshot } from './wakefield-shift';
import type { FilmShot, FilmState } from './wakefield-shift-plugin';

export type ShiftLike = RVViewerPlugin & Pick<EventEmitter, 'on' | 'off'> & {
  snapshot: ShiftSnapshot;
  film: FilmState;
  caption: FilmShot['caption'] | null;
  playing: boolean;
  recording: boolean;
  restart(): void;
  play(): void;
  pause(): void;
  startFilm(record: boolean): Promise<void>;
  stopFilm(): void;
  crewColour(crew: CrewId, visitor?: boolean): string;
};

/** Subscribe to the shift plugin; re-render on board or film changes. */
export function useShift(viewer: RVViewer): ShiftLike | null {
  const plugin = viewer.getPlugin<ShiftLike>('wakefield-shift') ?? null;
  const [, force] = useState(0);
  useEffect(() => {
    if (!plugin) return;
    const sync = () => force((n) => n + 1);
    plugin.on('shift-changed', sync as never);
    plugin.on('film-changed', sync as never);
    return () => {
      plugin.off('shift-changed', sync as never);
      plugin.off('film-changed', sync as never);
    };
  }, [plugin]);
  return plugin;
}

export interface Toast { key: string; text: string; kind: ShiftEvent['kind'] }

const MILESTONES: ReadonlySet<ShiftEvent['kind']> = new Set(['first-in', 'crew-complete', 'all-in']);
const TOAST_MS = 3200;

/**
 * Milestone toasts, derived from the event list. A replay shrinks the list,
 * which resets what has been "seen" so the milestones fire again.
 */
export function useMilestoneToasts(snap: ShiftSnapshot | null): Toast[] {
  const seen = useRef(new Set<string>());
  const lastCount = useRef(0);
  const timers = useRef<number[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Timers are cleared on unmount only. Clearing them in the effect below
  // was a bug: the board publishes 8x a second, every publish re-ran the
  // effect, its cleanup cancelled the pending dismiss, and a toast raised at
  // 06:44 was still on screen at 07:01.
  useEffect(() => () => { timers.current.forEach((id) => clearTimeout(id)); }, []);

  useEffect(() => {
    if (!snap) return;
    if (snap.events.length < lastCount.current) seen.current.clear();
    lastCount.current = snap.events.length;
    const fresh: Toast[] = [];
    for (const e of snap.events) {
      if (!MILESTONES.has(e.kind)) continue;
      const key = `${e.kind}|${e.crew ?? ''}|${e.workerId ?? ''}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      fresh.push({ key: key + snap.t, text: e.text, kind: e.kind });
    }
    if (!fresh.length) return;
    setToasts((cur) => [...cur, ...fresh].slice(-3));
    const ids = fresh.map((f) => f.key);
    timers.current.push(window.setTimeout(() => setToasts((cur) => cur.filter((x) => !ids.includes(x.key))), TOAST_MS));
  }, [snap]);

  return toasts;
}

export const MilestoneToasts: React.FC<{ toasts: Toast[]; top: number }> = ({ toasts, top }) => (
  <div style={{ position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none', zIndex: 5 }}>
    {toasts.map((t) => (
      <div
        key={t.key}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px 8px 10px', borderRadius: 999,
          background: 'rgba(7,16,20,0.94)',
          border: '1px solid var(--sim-accent-border, rgba(46,215,192,0.34))',
          boxShadow: '0 10px 28px rgba(0,0,0,0.4), 0 0 18px rgba(46,215,192,0.12)',
          color: 'rgba(255,255,255,0.94)', fontSize: 13, fontWeight: 600,
          animation: 'wpf-toast-in 260ms cubic-bezier(.2,.9,.3,1.2)',
        }}
      >
        <EmojiEventsRounded sx={{ fontSize: 18, color: 'var(--sim-accent, #2ed7c0)' }} />
        {t.text}
      </div>
    ))}
    <style>{'@keyframes wpf-toast-in{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:none}}'}</style>
  </div>
);

export const ShiftBoard: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = useShift(viewer);
  const snap = plugin?.snapshot ?? null;
  const toasts = useMilestoneToasts(snap);
  const [open, setOpen] = useState(true);

  if (!plugin || !snap || plugin.film !== 'idle') return null;

  const recent = snap.events.filter((e) => e.kind === 'signed-in' || e.kind === 'crew-complete').slice(-3).reverse();
  const allIn = snap.onSite === snap.rostered;

  return (
    <>
      <MilestoneToasts toasts={toasts} top={168} />
      <div
        style={{
          position: 'absolute', left: 112, top: 168, width: 292, zIndex: 3,
          pointerEvents: 'auto',
          borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.006)), rgba(7,16,20,0.92)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 14px 36px rgba(0,0,0,0.38)',
          color: 'rgba(255,255,255,0.9)',
          overflow: 'hidden',
        }}
      >
        {/* Header: the fire roll is the headline number. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '11px 12px 10px 14px' }}
        >
          <LocalFireDepartmentRounded sx={{ fontSize: 20, color: allIn ? 'var(--sim-accent, #2ed7c0)' : '#f0a24a' }} />
          <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>
              Shift change · fire roll
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {snap.onSite}<span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}> / {snap.rostered} on site</span>
            </span>
          </span>
          <span style={{ fontSize: 17, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.86)' }}>
            {formatClock(snap.clock)}
          </span>
          {open ? <ExpandLessRounded sx={{ fontSize: 18, opacity: 0.5 }} /> : <ExpandMoreRounded sx={{ fontSize: 18, opacity: 0.5 }} />}
        </button>

        {open && (
          <div style={{ padding: '0 14px 12px' }}>
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {snap.crews.map((c) => {
                const pct = c.rostered ? c.signedIn / c.rostered : 0;
                const done = c.signedIn === c.rostered;
                const colour = plugin.crewColour(c.crew.id);
                return (
                  <div key={c.crew.id} style={{ display: 'grid', gridTemplateColumns: '10px 74px 1fr 34px', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: colour, boxShadow: `0 0 0 2px ${colour}22` }} />
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', whiteSpace: 'nowrap' }}>{c.crew.short}</span>
                    <span style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: colour, borderRadius: 3, transition: 'width 380ms cubic-bezier(.2,.8,.2,1)' }} />
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, fontSize: 11, fontVariantNumeric: 'tabular-nums', color: done ? 'var(--sim-accent, #2ed7c0)' : 'rgba(255,255,255,0.6)' }}>
                      {done && <CheckCircleRounded sx={{ fontSize: 12 }} />}
                      {c.signedIn}/{c.rostered}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Ticker. */}
            <div style={{ minHeight: 52, display: 'grid', gap: 3, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {recent.length === 0 && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Waiting for the first badge-in…</span>
              )}
              {recent.map((e, i) => (
                <span key={e.text + e.t} style={{ display: 'flex', gap: 8, fontSize: 11, color: i === 0 ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.48)' }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: 'rgba(255,255,255,0.4)' }}>{formatClock(e.clock)}</span>
                  {e.text}
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
              <BoardButton onClick={() => plugin.restart()} icon={<ReplayRounded sx={{ fontSize: 15 }} />} label="Replay" />
              <BoardButton onClick={() => plugin.startFilm(false)} icon={<MovieRounded sx={{ fontSize: 15 }} />} label="Play film" />
              <BoardButton onClick={() => plugin.startFilm(true)} icon={<FiberManualRecord sx={{ fontSize: 12, color: '#ff5a52' }} />} label="Record" />
            </div>
            <div style={{ marginTop: 8, fontSize: 9.5, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.02em' }}>
              Simulated roster · AM packing shift
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const BoardButton: React.FC<{ onClick: () => void; icon: React.ReactNode; label: string }> = ({ onClick, icon, label }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        padding: '6px 6px', borderRadius: 8, cursor: 'pointer',
        border: `1px solid ${hover ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)'}`,
        background: hover ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
        color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500,
        transition: 'background 140ms ease, border-color 140ms ease',
      }}
    >
      {icon}
      {label}
    </button>
  );
};
