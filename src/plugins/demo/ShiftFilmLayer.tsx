// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The film's own overlay — everything a viewer sees on top of the take.
 *
 * During a take the rest of the HMI is hidden (see `ensureFilmStyle` in the
 * plugin); this layer carries the class `wpf-film-layer`, which is what lets
 * it opt back into visibility under the hidden #react-root.
 *
 * Sized for a phone: a social clip is watched at 6 inches, so the clock,
 * captions and end card are set large and kept away from the edges where
 * platforms put their own buttons.
 *
 * There is no visible "stop" control in frame — a button would end up in the
 * recording. Escape ends the take; a hover-only control sits in the top-right
 * corner for anyone who does not know that.
 */

import React, { useEffect, useState } from 'react';
import LocalFireDepartmentRounded from '@mui/icons-material/LocalFireDepartmentRounded';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import { formatClock } from './wakefield-shift';
import { MilestoneToasts, useMilestoneToasts, useShift } from './ShiftBoard';

export const ShiftFilmLayer: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = useShift(viewer);
  const film = plugin?.film ?? 'idle';
  const snap = plugin?.snapshot ?? null;
  const toasts = useMilestoneToasts(film === 'rolling' ? snap : null);
  const [stopHover, setStopHover] = useState(false);

  useEffect(() => {
    if (film === 'idle' || !plugin) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') plugin.stopFilm(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [film, plugin]);

  if (!plugin || !snap || film === 'idle' || film === 'arming') return null;

  const caption = plugin.caption;

  return (
    <div className="wpf-film-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3000 }}>
      {/* Soft vignette: pulls the eye to the middle and lifts the text. */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(0,0,0,0.42) 100%)' }} />

      {film === 'rolling' && (
        <>
          {/* Clock + fire roll, top left. */}
          <div style={{ position: 'absolute', left: '4%', top: '6%', display: 'flex', flexDirection: 'column', gap: 6, color: '#fff', textShadow: '0 2px 14px rgba(0,0,0,0.55)' }}>
            <span style={{ fontSize: 'clamp(30px, 4.4vw, 58px)', fontWeight: 300, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {formatClock(snap.clock)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'clamp(13px, 1.3vw, 18px)', fontWeight: 600 }}>
              <LocalFireDepartmentRounded sx={{ fontSize: '1.2em', color: snap.onSite === snap.rostered ? '#2ed7c0' : '#f0a24a' }} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{snap.onSite}/{snap.rostered}</span>
              <span style={{ fontWeight: 400, opacity: 0.75 }}>on site</span>
            </span>
            <span style={{ display: 'flex', gap: 6, marginTop: 2 }}>
              {snap.crews.map((c) => {
                const done = c.signedIn === c.rostered;
                const colour = plugin.crewColour(c.crew.id);
                return (
                  <span key={c.crew.id} title={c.crew.label} style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: done ? colour : 'transparent',
                    border: `2px solid ${colour}`,
                    boxShadow: done ? `0 0 10px ${colour}` : 'none',
                    transition: 'background 300ms ease, box-shadow 300ms ease',
                  }} />
                );
              })}
            </span>
          </div>

          <MilestoneToasts toasts={toasts} top={Math.round(window.innerHeight * 0.07)} />

          {/* Lower third. Keyed on the title so each new caption animates in. */}
          {caption && (
            <div key={caption.title} style={{
              position: 'absolute', left: '4%', bottom: '14%', maxWidth: '62%',
              paddingLeft: 16, borderLeft: '4px solid #2ed7c0',
              color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.6)',
              animation: 'wpf-cap-in 420ms cubic-bezier(.2,.8,.2,1)',
            }}>
              <div style={{ fontSize: 'clamp(22px, 2.9vw, 42px)', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{caption.title}</div>
              {caption.sub && (
                <div style={{ marginTop: 6, fontSize: 'clamp(13px, 1.4vw, 20px)', opacity: 0.86 }}>{caption.sub}</div>
              )}
            </div>
          )}
        </>
      )}

      {film === 'end-card' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          background: 'radial-gradient(90% 80% at 50% 50%, rgba(4,10,13,0.55), rgba(3,7,9,0.9))',
          animation: 'wpf-fade 500ms ease',
        }}>
          <div style={{ textAlign: 'center', color: '#fff' }}>
            <div style={{ fontSize: 'clamp(12px, 1.1vw, 15px)', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#d9ae4a' }}>
              Simam Virtual Factory
            </div>
            <div style={{ marginTop: 14, fontSize: 'clamp(36px, 5.6vw, 76px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1 }}>
              Shift ready
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 'clamp(15px, 1.7vw, 24px)', fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
              <LocalFireDepartmentRounded sx={{ fontSize: '1.15em', color: '#2ed7c0' }} />
              {snap.onSite}/{snap.rostered} on site · every station manned · {formatClock(snap.clock)}
            </div>
            <div style={{ marginTop: 26, fontSize: 'clamp(12px, 1.15vw, 16px)', opacity: 0.55, letterSpacing: '0.02em' }}>
              virtualfactory.simamdigital.com
            </div>
          </div>
        </div>
      )}

      {/* Hover-only exit, top right. Escape also works. */}
      <button
        type="button"
        onClick={() => plugin.stopFilm()}
        onMouseEnter={() => setStopHover(true)}
        onMouseLeave={() => setStopHover(false)}
        aria-label="End take"
        style={{
          position: 'absolute', top: 10, right: 10, pointerEvents: 'auto', cursor: 'pointer',
          opacity: stopHover ? 1 : 0, transition: 'opacity 160ms ease',
          border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
          background: 'rgba(7,16,20,0.85)', color: '#fff', fontSize: 12, padding: '6px 10px',
        }}
      >
        End take (Esc)
      </button>

      <style>{`
        @keyframes wpf-cap-in { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
        @keyframes wpf-fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};
