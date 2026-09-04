// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * The front door.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this, a first-time visitor landed on someone else's beta disclaimer,
 * dismissed it, and was left with a 3D scene and a dozen competing panels with
 * no indication of what to look at or why. The twin was doing a great deal and
 * explaining none of it.
 *
 * This screen answers three questions in the order a stranger actually asks
 * them: what am I looking at, is it real, and what do I do now.
 *
 * WHY THE CHOICES ARE ENTRY POINTS, NOT STORIES
 * ---------------------------------------------
 * The obvious design is three canned scenarios — "Dock 4 is backing up",
 * "Robot Cell A is the constraint". We deliberately do not do that, because
 * the walkthrough behind this screen is DERIVED from live state
 * (`guided-review.ts`): it ranks whatever is actually wrong right now. A fixed
 * menu of stories would promise a narrative the simulation might not be
 * telling by the time the user clicks, and this codebase has a standing rule
 * against showing numbers we cannot stand behind.
 *
 * So the cards offer real doors — the live review, the site, free look — and
 * the review names its own subject once it has looked.
 *
 * THE LIVE LINE IS THE ARGUMENT
 * -----------------------------
 * The status row reads from the same `ProductionSnapshot` as the KPI bar and
 * ticks while the screen is open. It is the cheapest possible proof that this
 * is a running simulation rather than a video, and it is doing the work that a
 * paragraph of marketing copy would do worse.
 */

import React, { useEffect, useState } from 'react';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ExploreRoundedIcon from '@mui/icons-material/ExploreRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import type { UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import { getProductionSnapshot, subscribeProduction } from '../../core/production-metrics';

/**
 * Shown once per tab, not once per browser.
 *
 * A salesperson opening the site to demo it should always get the front door;
 * the same person reloading mid-demo should not be nagged. sessionStorage is
 * exactly that distinction.
 */
const SEEN_KEY = 'simam-entry-seen';

type ScenarioLike = RVViewerPlugin & { open(): void };
type CommandCenterLike = RVViewerPlugin & { selectZone(id: string | null): void };

function useSnapshot() {
  const [, force] = useState(0);
  useEffect(() => subscribeProduction(() => force((n) => n + 1)), []);
  return getProductionSnapshot();
}

/** Read the flag defensively — Safari private mode throws on sessionStorage. */
function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* Private mode. Showing the door twice is not worth an error. */
  }
}

export const WakefieldEntryScreen: React.FC<UISlotProps> = ({ viewer }) => {
  const [open, setOpen] = useState(() => !alreadySeen());
  const snapshot = useSnapshot();

  // Escape dismisses, because a modal that traps you is the thing we are
  // replacing, not the thing we are building.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function dismiss() {
    markSeen();
    setOpen(false);
  }

  function startReview() {
    dismiss();
    viewer.getPlugin<ScenarioLike>('guided-scenario')?.open();
  }

  function exploreSite() {
    dismiss();
    viewer.getPlugin<CommandCenterLike>('wakefield-command-center')?.selectZone('zone-site');
  }

  const live = snapshot.hasDrives;
  const running = snapshot.drivesRunning;
  const total = snapshot.driveCount;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to the Wakefield digital twin"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2000,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'radial-gradient(120% 90% at 50% 0%, rgba(6,14,18,0.82), rgba(3,7,9,0.94))',
        backdropFilter: 'blur(10px) saturate(120%)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: 'min(680px, 100%)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.006)), rgba(7,16,20,0.96)',
          boxShadow: 'var(--sim-lift-2, 0 24px 60px rgba(0,0,0,0.5))',
          padding: '30px 32px 22px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
            color: 'var(--sim-gold, #d9ae4a)',
            marginBottom: 12,
          }}
        >
          Simam Virtual Factory
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 27,
            fontWeight: 500,
            letterSpacing: '-0.015em',
            color: 'rgba(255,255,255,0.95)',
            lineHeight: 1.18,
          }}
        >
          Wakefield Precision Foods
        </h1>

        <p
          style={{
            margin: '9px 0 0',
            fontSize: 13.5,
            lineHeight: 1.62,
            color: 'rgba(255,255,255,0.60)',
            maxWidth: '54ch',
          }}
        >
          A live digital twin of a chilled ready-meals plant — packing line WPF-41,
          its robot cell, the outbound docks and the yard. Every number on screen is
          read from the running simulation. Where the site has no meter fitted, it
          says so rather than inventing a figure.
        </p>

        {/* The live line. This is evidence, not decoration. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            margin: '18px 0 22px',
            padding: '9px 13px',
            borderRadius: 9,
            border: '1px solid var(--sim-accent-border, rgba(46,215,192,0.34))',
            background: 'var(--sim-accent-wash, rgba(46,215,192,0.11))',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              flex: '0 0 auto',
              background: 'var(--sim-accent, #2ed7c0)',
              boxShadow: '0 0 9px rgba(46,215,192,0.8)',
            }}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
            {live
              ? `Simulation running · ${running} of ${total} drives in motion · ${snapshot.casesTotal} cases packed this run`
              : 'Simulation starting — the model is still loading its components'}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 9 }}>
          <EntryCard
            primary
            icon={<PlayArrowRoundedIcon sx={{ fontSize: 21 }} />}
            title="Take the guided review"
            body="Walks the site the way a shift manager would — worst thing first, with the numbers behind each call."
            onClick={startReview}
          />
          <EntryCard
            icon={<ExploreRoundedIcon sx={{ fontSize: 20 }} />}
            title="Explore the site"
            body="Pull back to the whole plant, then jump between the seven zones along the bottom."
            onClick={exploreSite}
          />
          <EntryCard
            icon={<VisibilityRoundedIcon sx={{ fontSize: 20 }} />}
            title="Just let me look around"
            body="Dismiss this and orbit freely. Everything stays live."
            onClick={dismiss}
          />
        </div>

        <div
          style={{
            marginTop: 20,
            paddingTop: 13,
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 10.5,
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.34)',
          }}
        >
          Wakefield Precision Foods is a fictional site built for demonstration.
          Built on realvirtual WEB · AGPL-3.0.
        </div>
      </div>
    </div>
  );
};

const EntryCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  primary?: boolean;
}> = ({ icon, title, body, onClick, primary }) => {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 13,
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '13px 15px',
        borderRadius: 11,
        // Gold marks the recommended door — the same gold that marks a chosen
        // zone. It never means "healthy"; teal does that.
        border: primary
          ? '1px solid var(--sim-gold-border, rgba(217,174,74,0.38))'
          : `1px solid ${hover ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)'}`,
        background: primary
          ? 'var(--sim-gold-wash, rgba(217,174,74,0.12))'
          : hover
            ? 'rgba(255,255,255,0.035)'
            : 'rgba(255,255,255,0.012)',
        transform: `translateY(${hover ? -1 : 0}px)`,
        transition: 'transform 140ms ease, background 140ms ease, border-color 140ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
          width: 32,
          height: 32,
          borderRadius: 8,
          background: primary ? 'rgba(217,174,74,0.16)' : 'rgba(255,255,255,0.05)',
          color: primary ? 'var(--sim-gold-light, #f1d178)' : 'rgba(255,255,255,0.68)',
        }}
      >
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: primary ? 'var(--sim-gold-light, #f1d178)' : 'rgba(255,255,255,0.90)',
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.52)' }}>
          {body}
        </span>
      </span>
    </button>
  );
};
