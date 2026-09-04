// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The spatial hotspot layer: anchors, connectors, cards.
 *
 * A pure function of the numbers the command-centre plugin publishes. It owns
 * no camera, no scene and no timers — if this file needs a `useEffect` that
 * touches three.js, the responsibility is in the wrong place.
 *
 * DRAWING NOTES
 * -------------
 * Cards are plain divs positioned with `translate3d`, not MUI surfaces. Nine
 * emotion-styled components re-rendering at 30 Hz while the user orbits is a
 * measurable cost for no benefit; the styling here is static and the only
 * thing changing per frame is a transform, which the compositor handles
 * without touching layout.
 *
 * Connectors are one SVG for the whole layer rather than one per card, so the
 * browser has a single element to rasterise instead of nine overlapping
 * full-viewport surfaces.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  PrecisionManufacturing,
  ViewWeek,
  Inventory2,
  VerifiedUser,
  Bolt,
  Compress,
  HeatPump,
  LocalShipping,
  Shield,
  type SvgIconComponent,
} from '@mui/icons-material';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { EventEmitter } from '../../core/rv-events';
import {
  connectorPath,
  layoutCards,
  type CardBox,
  type HotspotIcon,
  type HotspotStatus,
} from './wakefield-hotspots';
import type { HotspotView } from './wakefield-command-center-plugin';

/** Card geometry, from the design specification. */
const CARD_W = 190;
const CARD_H = 92;

type CommandCenterLike = RVViewerPlugin & Pick<EventEmitter, 'on' | 'off'> & {
  views: HotspotView[];
  selectedId: string | null;
  hoveredId: string | null;
  select(id: string | null): void;
  hover(id: string | null): void;
};

const ICONS: Record<HotspotIcon, SvgIconComponent> = {
  robot: PrecisionManufacturing,
  conveyor: ViewWeek,
  package: Inventory2,
  quality: VerifiedUser,
  power: Bolt,
  hvac: HeatPump,
  air: Compress,
  dock: LocalShipping,
  fleet: LocalShipping,
  safety: Shield,
};

/**
 * Status presentation.
 *
 * `unmetered` is grey and says so in words. It must not borrow the warning
 * amber: an operator who learns that dimmed-amber means "nothing is wrong,
 * we just have no sensor" has been taught to discount amber everywhere.
 */
const STATUS: Record<HotspotStatus, { dot: string; label: string }> = {
  optimal: { dot: 'var(--sim-ok)', label: 'Optimal' },
  healthy: { dot: 'var(--sim-ok)', label: 'Healthy' },
  attention: { dot: 'var(--sim-warn)', label: 'Attention' },
  fault: { dot: 'var(--sim-critical)', label: 'Fault' },
  unmetered: { dot: 'var(--sim-text-muted)', label: 'No meter' },
};

export const HotspotLayer: React.FC<UISlotProps> = ({ viewer }) => {
  const plugin = viewer.getPlugin<CommandCenterLike>('wakefield-command-center');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Re-read on every published change. The plugin already rate-limits these,
  // so this is not the place to add another throttle.
  useEffect(() => {
    if (!plugin) return;
    const sync = () => force((n) => n + 1);
    plugin.on('hotspots-changed', sync as never);
    plugin.on('selection-changed', sync as never);
    return () => {
      plugin.off('hotspots-changed', sync as never);
      plugin.off('selection-changed', sync as never);
    };
  }, [plugin]);

  // The layer's own geometry, so client coordinates can be converted without
  // reproducing the app's inset and zoom arithmetic here.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
    };
  }, []);

  const views = plugin?.views ?? [];
  const selectedId = plugin?.selectedId ?? null;
  const hoveredId = plugin?.hoveredId ?? null;

  const { placed, visible } = useMemo(() => {
    if (!rect || rect.width === 0) return { placed: [], visible: [] as HotspotView[] };

    const onScreen = views.filter((v) => v.projection.visible);
    const boxes: CardBox[] = onScreen.map((v) => ({
      id: v.def.id,
      anchorX: v.projection.x - rect.left,
      anchorY: v.projection.y - rect.top,
      side: v.def.side,
      width: CARD_W,
      height: CARD_H,
    }));

    return {
      placed: layoutCards(boxes, { width: rect.width, height: rect.height }),
      visible: onScreen,
    };
    // `views` is rebuilt each render by the plugin getter, so the force
    // counter is what actually drives this; listing it would be a lie about
    // the dependency and would not memoise anything.
  }, [rect, views.length, selectedId, hoveredId, views]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  if (!plugin) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden={false}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1100,
        overflow: 'hidden',
      }}
    >
      {/* Connectors. One surface for the whole layer. */}
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        {visible.map((v) => {
          const card = byId.get(v.def.id);
          if (!card || !rect) return null;
          const live = v.def.id === selectedId || v.def.id === hoveredId;
          return (
            <path
              key={v.def.id}
              d={connectorPath(
                v.projection.x - rect.left,
                v.projection.y - rect.top,
                card,
                CARD_W,
                CARD_H,
              )}
              fill="none"
              stroke={live ? 'var(--sim-connector-live)' : 'var(--sim-connector)'}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke var(--sim-fast) var(--sim-ease)' }}
            />
          );
        })}
      </svg>

      {/* Anchors. */}
      {visible.map((v) => {
        if (!rect) return null;
        const live = v.def.id === selectedId || v.def.id === hoveredId;
        return (
          <div
            key={`a-${v.def.id}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 8,
              height: 8,
              marginLeft: -4,
              marginTop: -4,
              borderRadius: 999,
              background: 'var(--sim-anchor-core)',
              boxShadow: 'var(--sim-anchor-glow)',
              pointerEvents: 'none',
              transform: `translate3d(${v.projection.x - rect.left}px, ${v.projection.y - rect.top}px, 0) scale(${live ? 1.15 : 1})`,
              transition: 'transform var(--sim-fast) var(--sim-ease)',
            }}
          />
        );
      })}

      {/* Cards. */}
      {visible.map((v) => {
        const card = byId.get(v.def.id);
        if (!card) return null;
        const Icon = ICONS[v.def.icon];
        const status = STATUS[v.reading.status];
        const isSelected = v.def.id === selectedId;
        const isHovered = v.def.id === hoveredId;
        const dim = v.reading.status === 'unmetered';

        return (
          <div
            key={`c-${v.def.id}`}
            role="button"
            tabIndex={0}
            title={v.reading.evidence}
            aria-label={`${v.def.title}: ${v.reading.value}${v.reading.unit ? ` ${v.reading.unit}` : ''}. ${v.reading.detail}. ${status.label}.`}
            onMouseEnter={() => plugin.hover(v.def.id)}
            onMouseLeave={() => plugin.hover(null)}
            onFocus={() => plugin.hover(v.def.id)}
            onBlur={() => plugin.hover(null)}
            onClick={() => plugin.select(isSelected ? null : v.def.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                plugin.select(isSelected ? null : v.def.id);
              }
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: CARD_W,
              minHeight: CARD_H,
              boxSizing: 'border-box',
              padding: '10px 12px',
              pointerEvents: 'auto',
              cursor: 'pointer',
              borderRadius: 11,
              background: 'var(--sim-hotspot-bg)',
              backdropFilter: 'blur(16px) saturate(140%)',
              border: `1px solid ${
                isSelected ? 'rgba(46,215,192,0.46)'
                  : isHovered ? 'rgba(46,215,192,0.26)'
                    : 'rgba(255,255,255,0.08)'
              }`,
              boxShadow: isSelected
                ? '0 0 0 1px rgba(46,215,192,0.08), 0 0 24px rgba(46,215,192,0.14), 0 18px 46px rgba(0,0,0,0.45)'
                : isHovered ? 'var(--sim-hotspot-lift-hi)' : 'var(--sim-hotspot-lift)',
              opacity: dim && !isSelected && !isHovered ? 0.68 : 1,
              transform: `translate3d(${card.x}px, ${card.y - (isHovered && !isSelected ? 2 : 0)}px, 0)`,
              transition: 'border-color var(--sim-base) var(--sim-ease),'
                + ' box-shadow var(--sim-base) var(--sim-ease),'
                + ' opacity var(--sim-base) var(--sim-ease)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon
                style={{
                  fontSize: 15,
                  color: dim ? 'var(--sim-text-muted)' : 'var(--sim-accent)',
                  flex: '0 0 auto',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.88)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {v.def.title}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  lineHeight: 1.1,
                  color: dim ? 'var(--sim-text-dim)' : '#F3F7F8',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {v.reading.value}
              </span>
              {v.reading.unit && (
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--sim-text-muted)' }}>
                  {v.reading.unit}
                </span>
              )}
            </div>

            <div
              style={{
                fontSize: 9,
                color: 'rgba(255,255,255,0.40)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {v.reading.detail}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: status.dot,
                  flex: '0 0 auto',
                }}
              />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.52)' }}>{status.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
