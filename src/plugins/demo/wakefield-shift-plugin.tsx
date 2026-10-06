// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Shift change — the plugin that puts the crew on the floor, and the film
 * director that shoots them.
 *
 * Everything that can be wrong without a screenshot showing it lives in the
 * pure model (`wakefield-shift.ts`, tested in node). This file is the thin
 * three.js/React shell: pose the rigs from `poseAt`, pop a badge when
 * `eventTime(.., 'badge')` is crossed, and publish the board.
 *
 * THE CLOCK
 * ---------
 * One number, `t`, seconds since the shift change started. Play advances it,
 * replay zeroes it, film mode runs it faster. Poses, pops and the board are
 * all derived from it, so there is no second source of truth to drift.
 *
 * FILM MODE
 * ---------
 * A scripted ~45 s take for social: aerial, car park, badge-ins at the door,
 * into the hall, the packing line, rise out to an end card. Shots are keyed
 * to SHIFT time, not wall time, so they always land on the beat they are
 * framing — the entrance shot is up when people are actually badging in,
 * whatever speed the film runs at.
 *
 * The HMI is hidden for the take by a body class, not by editing core: the
 * whole HMI lives under #react-root, and CSS lets a child of a
 * visibility:hidden parent opt back in, which is how the film's own overlay
 * stays on screen. Recording uses the browser's own tab capture
 * (getDisplayMedia + MediaRecorder), so what you get is exactly what played.
 */

import { EventEmitter } from '../../core/rv-events';
import type { RVViewerPlugin } from '../../core/rv-plugin';
import type { UISlotEntry, UISlotProps } from '../../core/rv-ui-plugin';
import type { RVViewer } from '../../core/rv-viewer';
import type { LoadResult } from '../../core/engine/rv-scene-loader';
import { Group, Vector3, type Sprite, type SpriteMaterial } from 'three';
import {
  AM_SHIFT,
  BADGE_READER,
  eventTime,
  poseAt,
  shiftDuration,
  shiftSnapshot,
  timeRoster,
  type ShiftSnapshot,
  type TimedRoute,
} from './wakefield-shift';
import {
  CREW_COLOUR,
  VISITOR_COLOUR,
  createBadgeReader,
  createSignInPop,
  createWorkerRig,
  disposeSprite,
  poseRig,
  type BadgeReader,
  type WorkerRig,
} from './wakefield-workers';
import { ShiftBoard } from './ShiftBoard';
import { ShiftFilmLayer } from './ShiftFilmLayer';

const SITE_Z = -1.15;
const cz = SITE_Z;

/** Board refresh rate. Fast enough to feel live, slow enough not to churn React. */
const BOARD_HZ = 8;
/** Film playback speed. 80 s of shift becomes ~45 s of footage. */
export const FILM_SPEED = 1.8;
/** How long the end card holds, real seconds. */
const END_CARD_SECONDS = 3.6;
const POP_LIFE = 2.6;
/** Reader post: where a worker's right hand lands when they face the door. */
const READER_POST = { x: BADGE_READER.x - 0.3, z: BADGE_READER.z - 0.7 };

interface Pop { sprite: Sprite; born: number }

export interface FilmShot {
  /** Shift time (s) the move starts. */
  at: number;
  pos: [number, number, number];
  target: [number, number, number];
  /** Move duration in SHIFT seconds; converted to real time by the film speed. */
  dur: number;
  caption?: { title: string; sub?: string };
}

export type FilmState = 'idle' | 'arming' | 'rolling' | 'end-card';

/**
 * The shot list, built from the actual route timings so every shot lands on
 * its beat. If someone edits the roster, the film re-times itself.
 */
export function buildShotList(routes: readonly TimedRoute[]): FilmShot[] {
  const badges = routes.map((r) => eventTime(r, 'badge')).sort((a, b) => a - b);
  const first = badges[0];
  const last = badges[badges.length - 1];
  const end = shiftDuration(routes);
  return [
    { at: 0, dur: 0.05, pos: [78, 40, cz + 82], target: [18, 0, cz + 2],
      caption: { title: '06:30 · Wakefield Precision Foods', sub: 'AM packing shift' } },
    { at: 0.4, dur: 9, pos: [50, 10, cz + 30], target: [35, 1, cz + 4] },
    { at: Math.max(10, first - 5), dur: 4, pos: [28.8, 2.5, cz + 19.5], target: [22.4, 1.35, cz + 10],
      caption: { title: 'Badge in', sub: 'Every tap puts a name on the fire roll' } },
    { at: first + 12, dur: 16, pos: [26.4, 3.1, cz + 17.6], target: [22.4, 1.4, cz + 10] },
    // Crane up over the office roof before dropping into the hall: a straight
    // move from the door to the hall camera would pass through the office's
    // brick. From (19, 14, 12) the line to the hall camera clears the office
    // roof (7.2 m) at every point — checked at the wall crossing, 7.4 m.
    { at: last + 1, dur: 1.6, pos: [19, 14, 12], target: [5, 1, -2] },
    // Inside, south-east corner: the whole floor at once — crews in whites,
    // despatch in hi-vis by the dock doors, an engineer in navy up front.
    // Chosen from rendered candidates, not by coordinate: the first draft put
    // this camera 2 m outside the north wall, behind a parked trailer.
    { at: last + 2.8, dur: 2.6, pos: [13.5, 4.4, 4.2], target: [4, 0.9, -5.4],
      caption: { title: 'Kitted up', sub: 'Whites, hairnets, wellies — then to the line' } },
    // Over the machine line, looking down the conveyors at the packers.
    { at: last + 10, dur: 4, pos: [-6, 4.6, 2.0], target: [0, 1.0, 7.6],
      caption: { title: 'Packing crew', sub: 'Six on the line' } },
    { at: end, dur: 5, pos: [26, 16, cz + 28], target: [0, 1.5, cz] },
  ];
}


export class WakefieldShiftPlugin extends EventEmitter implements RVViewerPlugin {
  readonly id = 'wakefield-shift';
  /** After the command centre (450). */
  readonly order = 455;

  slots: UISlotEntry[] = [
    { slot: 'overlay', order: 60, component: (p: UISlotProps) => <ShiftBoard {...p} /> },
    // Above everything, including the entry screen (900): during a take the
    // film layer is the only UI that should exist.
    { slot: 'overlay', order: 950, component: (p: UISlotProps) => <ShiftFilmLayer {...p} /> },
  ];

  private _viewer: RVViewer | null = null;
  private _group: Group | null = null;
  private _rigs: WorkerRig[] = [];
  private _routes: TimedRoute[] = timeRoster(AM_SHIFT);
  private _duration = shiftDuration(this._routes);
  private _reader: BadgeReader | null = null;
  private _readerFlash = 0;
  private _pops: Pop[] = [];

  private _t = 0;
  private _speed = 1;
  private _playing = false;
  private _clock = 0;
  private _boardAccum = 0;
  private _snapshot: ShiftSnapshot = shiftSnapshot(this._routes, 0);

  private _film: FilmState = 'idle';
  private _shots: FilmShot[] = buildShotList(this._routes);
  private _nextShot = 0;
  private _caption: FilmShot['caption'] | null = null;
  private _endCardAt = 0;
  private _recorder: MediaRecorder | null = null;
  private _hiddenForFilm: { o: { visible: boolean }; was: boolean }[] = [];

  /* ---- read side -------------------------------------------------------- */

  get t(): number { return this._t; }
  get duration(): number { return this._duration; }
  get playing(): boolean { return this._playing; }
  get snapshot(): ShiftSnapshot { return this._snapshot; }
  get film(): FilmState { return this._film; }
  get caption(): FilmShot['caption'] | null { return this._caption; }
  get recording(): boolean { return this._recorder?.state === 'recording'; }

  crewColour(crew: keyof typeof CREW_COLOUR, visitor = false): string {
    const c = visitor ? VISITOR_COLOUR : CREW_COLOUR[crew];
    return `#${c.toString(16).padStart(6, '0')}`;
  }

  /* ---- controls --------------------------------------------------------- */

  play(): void { this._playing = true; this._emitBoard(true); }
  pause(): void { this._playing = false; this._emitBoard(true); }

  restart(): void {
    this._t = 0;
    for (const p of this._pops) disposeSprite(p.sprite);
    this._pops = [];
    this._playing = true;
    this._emitBoard(true);
  }

  /** Run the scripted take. With `record`, capture it to a video file. */
  async startFilm(record: boolean): Promise<void> {
    if (this._film !== 'idle' || !this._viewer) return;
    if (record) {
      this._film = 'arming';
      this.emit('film-changed');
      const ok = await this._startRecording();
      if (!ok) { this._film = 'idle'; this.emit('film-changed'); return; }
      // Let the browser's "sharing this tab" UI settle before the first frame.
      await new Promise((r) => setTimeout(r, 700));
    }
    this._enterFilmMode();
    this._shots = buildShotList(this._routes);
    this._nextShot = 0;
    this._caption = null;
    this._speed = FILM_SPEED;
    this.restart();
    this._film = 'rolling';
    this.emit('film-changed');
  }

  stopFilm(): void {
    if (this._film === 'idle') return;
    this._stopRecording();
    this._exitFilmMode();
    this._speed = 1;
    this._caption = null;
    this._film = 'idle';
    this.emit('film-changed');
  }

  /* ---- lifecycle -------------------------------------------------------- */

  init(viewer: RVViewer): void { this._viewer = viewer; }

  onModelLoaded(_r: LoadResult, viewer: RVViewer): void {
    this._viewer = viewer;
    this._teardown();
    const group = new Group();
    group.name = 'wpf-shift';
    this._rigs = AM_SHIFT.map((w) => createWorkerRig(w));
    for (const r of this._rigs) group.add(r.root);
    this._reader = createBadgeReader(READER_POST.x, READER_POST.z);
    group.add(this._reader.root);
    viewer.scene.add(group);
    this._group = group;
    this._t = 0;
    this._playing = true;
    this._emitBoard(true);
  }

  onModelCleared(): void {
    this.stopFilm();
    this._teardown();
  }

  onRender(dt: number): void {
    const viewer = this._viewer;
    if (!viewer || !this._group) return;
    // A tab coming back from the background hands us one huge dt; clamp it so
    // nobody teleports across the car park.
    const step = Math.min(dt, 0.1);
    this._clock += step;

    const prev = this._t;
    if (this._playing) this._t += step * this._speed;
    const t = this._t;

    // Pose everyone. Signed-in is derived from the same route timing.
    for (let i = 0; i < this._rigs.length; i++) {
      const rig = this._rigs[i];
      const route = this._routes[i];
      poseRig(rig, poseAt(route, t), this._clock, t >= eventTime(route, 'badge'));
    }

    // Badge-ins crossed this frame: pop + reader flash.
    if (t > prev) {
      for (const r of this._routes) {
        const b = eventTime(r, 'badge');
        if (b > prev && b <= t) this._pop(r);
      }
    }
    this._animatePops();
    if (this._reader) {
      this._readerFlash = Math.max(0, this._readerFlash - step * 2.2);
      this._reader.screen.emissiveIntensity = 0.25 + this._readerFlash * 2.4;
    }

    if (this._film !== 'idle') this._directFilm();

    // Workers breathe even when nobody walks, so the scene never goes static.
    viewer.markRenderDirty();

    this._boardAccum += step;
    if (this._boardAccum >= 1 / BOARD_HZ) {
      this._boardAccum = 0;
      this._emitBoard(false);
    }
  }

  dispose(): void {
    this.stopFilm();
    this._teardown();
    this.removeAllListeners();
    this._viewer = null;
  }

  /* ---- internals -------------------------------------------------------- */

  private _emitBoard(force: boolean): void {
    const next = shiftSnapshot(this._routes, this._t);
    const changed = force
      || next.onSite !== this._snapshot.onSite
      || next.atStation !== this._snapshot.atStation
      || Math.floor(next.clock) !== Math.floor(this._snapshot.clock);
    this._snapshot = next;
    if (changed) this.emit('shift-changed');
  }

  private _pop(r: TimedRoute): void {
    if (!this._group) return;
    const w = r.worker;
    const colour = w.kit === 'visitor' ? VISITOR_COLOUR : CREW_COLOUR[w.crew];
    const s = createSignInPop(w.name, colour);
    s.position.set(BADGE_READER.x, 2.35, BADGE_READER.z);
    this._group.add(s);
    this._pops.push({ sprite: s, born: this._clock });
    this._readerFlash = 1;
  }

  private _animatePops(): void {
    for (let i = this._pops.length - 1; i >= 0; i--) {
      const p = this._pops[i];
      const age = this._clock - p.born;
      if (age > POP_LIFE) {
        disposeSprite(p.sprite);
        this._pops.splice(i, 1);
        continue;
      }
      const u = age / POP_LIFE;
      p.sprite.position.y = 2.35 + u * 0.55;
      // Quick fade-in, hold, fade over the last third.
      const alpha = Math.min(1, age / 0.18) * (u > 0.66 ? 1 - (u - 0.66) / 0.34 : 1);
      (p.sprite.material as SpriteMaterial).opacity = alpha;
    }
  }

  private _directFilm(): void {
    const viewer = this._viewer!;
    if (this._film === 'rolling') {
      while (this._nextShot < this._shots.length && this._t >= this._shots[this._nextShot].at) {
        const s = this._shots[this._nextShot++];
        viewer.animateCameraTo(
          new Vector3(...s.pos),
          new Vector3(...s.target),
          Math.max(0.05, s.dur / this._speed),
          'easeInOut',
        );
        if (s.caption) { this._caption = s.caption; this.emit('film-changed'); }
      }
      // The finale shot is the last; hold for its move, then the end card.
      const last = this._shots[this._shots.length - 1];
      if (this._nextShot >= this._shots.length && this._t >= last.at + last.dur) {
        this._film = 'end-card';
        this._caption = null;
        this._endCardAt = this._clock;
        this.emit('film-changed');
      }
    } else if (this._film === 'end-card') {
      if (this._clock - this._endCardAt >= END_CARD_SECONDS) this.stopFilm();
    }
  }

  private _enterFilmMode(): void {
    ensureFilmStyle();
    document.body.classList.add('wpf-film');
    // 3D clutter that reads as UI. The first cut only hid the entry posts;
    // a test render showed 24 zone-label sprites from the scene dressing
    // floating through the walls in every shot. So the rule is general:
    // during a take, every sprite in the scene is hidden except the shift's
    // own sign-in pops. It also covers labels nobody has added yet.
    const scene = this._viewer?.scene;
    const own = this._group;
    this._hiddenForFilm = [];
    scene?.traverse((o) => {
      if (!(o as Sprite).isSprite || !o.visible) return;
      let a: typeof o | null = o;
      while (a && a !== own) a = a.parent;
      if (a === own) return;
      this._hiddenForFilm.push({ o, was: true });
      o.visible = false;
    });
    const posts = scene?.getObjectByName('wpf-entry-hotspots');
    if (posts && posts.visible) { this._hiddenForFilm.push({ o: posts, was: true }); posts.visible = false; }
  }

  private _exitFilmMode(): void {
    document.body.classList.remove('wpf-film');
    for (const h of this._hiddenForFilm) h.o.visible = h.was;
    this._hiddenForFilm = [];
  }

  private async _startRecording(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: false,
        // Chrome: offer this tab first, and keep the user from switching mid-take.
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
      } as DisplayMediaStreamOptions);
      // MP4 first: it is what Instagram, TikTok and LinkedIn accept without
      // conversion. Chrome has recorded H.264 MP4 natively since v126.
      const mime = [
        'video/mp4;codecs=avc1.640028',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm',
      ].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        const type = rec.mimeType || 'video/webm';
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(new Blob(chunks, { type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `wakefield-shift-change.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      };
      // If the user stops sharing from the browser bar, end the take cleanly.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stopFilm());
      rec.start(500);
      this._recorder = rec;
      return true;
    } catch {
      // Picker cancelled or capture unsupported. Not an error worth a dialog.
      return false;
    }
  }

  private _stopRecording(): void {
    const rec = this._recorder;
    this._recorder = null;
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  private _teardown(): void {
    for (const p of this._pops) disposeSprite(p.sprite);
    this._pops = [];
    if (this._group) this._group.removeFromParent();
    this._group = null;
    this._rigs = [];
    this._reader = null;
  }
}

/** Injected once. Hides the HMI during a take; the film layer opts back in. */
function ensureFilmStyle(): void {
  if (document.getElementById('wpf-film-style')) return;
  const style = document.createElement('style');
  style.id = 'wpf-film-style';
  style.textContent = `
    body.wpf-film #react-root { visibility: hidden; }
    body.wpf-film #react-root .wpf-film-layer { visibility: visible; }
    body.wpf-film .rv-orientation-gizmo { display: none; }
  `;
  document.head.appendChild(style);
}

