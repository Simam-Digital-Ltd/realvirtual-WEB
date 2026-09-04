// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The zone strip — the row of site thumbnails along the bottom.
 *
 * Each card is a place on the site. Clicking one flies the camera to exactly
 * the pose the thumbnail was shot from, which is the whole reason the strip
 * is worth having: it turns "somewhere in this 3D scene there is a dock" into
 * a thing you can point at.
 *
 * The gold selection here is the one place gold and teal sit side by side, so
 * the split has to hold: GOLD is the zone YOU chose, TEAL is what the plant is
 * doing. If a card ever goes gold because its plant is healthy, the two
 * meanings have collapsed and the interface has lost its grammar.
 *
 * Thumbnails arrive a second or two after load (see `wakefield-thumbnails.ts`)
 * and can legitimately never arrive at all on a WebGPU backend. A card with no
 * picture shows its ordinal on a plain surface rather than a spinner — this is
 * a permanent state on some machines, not a wait.
 */

import React, { useEffect, useState } from 'react';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { EventEmitter } from '../../core/rv-events';
import type { SiteZone } from './wakefield-zones';

const CARD_W = 160;
const CARD_H = 98;

type CommandCenterLike = RVViewerPlugin & Pick<EventEmitter, 'on' | 'off'> & {
  zones: readonly SiteZone[];
  thumbnails: ReadonlyMap<string, string>;
  selectedZoneId: string | null;
  selectZone(id: string | null): void;
};

export const ZoneStrip: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = viewer.getPlugin<CommandCenterLike>('wakefield-command-center');
  const [, force] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!plugin) return;
    const sync = () => force((n) => n + 1);
    plugin.on('thumbs-changed', sync as never);
    plugin.on('selection-changed', sync as never);
    return () => {
      plugin.off('thumbs-changed', sync as never);
      plugin.off('selection-changed', sync as never);
    };
  }, [plugin]);

  if (!plugin) return null;

  const zones = plugin.zones;
  const selected = plugin.selectedZoneId;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        zIndex: 1120,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        maxWidth: 'calc(100vw - 420px)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(7,14,18,0.88)',
          backdropFilter: 'blur(12px)',
          color: 'rgba(255,255,255,0.55)',
          borderRadius: 999,
          padding: '3px 12px',
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        {open ? 'Hide zones' : `Zones · ${zones.length}`}
      </button>

      {open && (
        <div
          role="tablist"
          aria-label="Site zones"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            gap: 8,
            padding: 8,
            borderRadius: 14,
            background: 'rgba(7,14,18,0.88)',
            backdropFilter: 'blur(16px) saturate(140%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: 'var(--sim-bevel), var(--sim-lift-2)',
            overflowX: 'auto',
            maxWidth: '100%',
          }}
        >
          {zones.map((zone) => {
            const thumb = plugin.thumbnails.get(zone.id);
            const isSelected = selected === zone.id;
            const isHovered = hovered === zone.id;

            return (
              <button
                key={zone.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                title={`Fly to ${zone.name}`}
                onMouseEnter={() => setHovered(zone.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => plugin.selectZone(zone.id)}
                style={{
                  position: 'relative',
                  flex: '0 0 auto',
                  width: CARD_W,
                  height: CARD_H,
                  padding: 0,
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: 'var(--sim-surface-raised)',
                  border: isSelected
                    ? '1px solid rgba(217,174,74,0.55)'
                    : `1px solid ${isHovered ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: isSelected
                    ? '0 0 0 1px rgba(217,174,74,0.08), 0 0 18px rgba(217,174,74,0.12)'
                    : 'none',
                  transform: `translateY(${isHovered && !isSelected ? -2 : 0}px)`,
                  transition: 'transform var(--sim-base) var(--sim-ease),'
                    + ' border-color var(--sim-base) var(--sim-ease),'
                    + ' box-shadow var(--sim-base) var(--sim-ease)',
                }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: `scale(${isHovered ? 1.03 : 1})`,
                      transition: 'transform 240ms var(--sim-ease)',
                    }}
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 26,
                      fontWeight: 300,
                      color: 'rgba(255,255,255,0.10)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {zone.ordinal}
                  </span>
                )}

                {/* Legibility scrim. Without it the caption sits on whatever
                    the render happened to put there and is unreadable half
                    the time. */}
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, transparent 35%, rgba(3,7,9,0.88) 100%)',
                  }}
                />

                <span
                  style={{
                    position: 'absolute',
                    left: 8,
                    right: 8,
                    bottom: 7,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 1,
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: isSelected ? 'var(--sim-gold-light)' : 'rgba(255,255,255,0.88)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.38)', marginRight: 5 }}>
                      {zone.ordinal}
                    </span>
                    {zone.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,0.42)',
                    }}
                  >
                    {zone.discipline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
