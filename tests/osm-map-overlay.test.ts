// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { describe, expect, it } from 'vitest';
import { projectMapPoint, projectMapTrail } from '../src/plugins/osm-map-overlay';

describe('OSM map overlay projection', () => {
  it('marks projected points visible only when they are in front of the camera', () => {
    const projector = {
      project: (lat: number, lng: number, alt = 0) => ({
        x: lat * 10,
        y: lng * -10 + alt,
        z: lat > 0 ? 1 : 0,
      }),
    };

    expect(projectMapPoint(projector, 2, -3, 4)).toEqual({
      x: 20,
      y: 34,
      visible: true,
    });

    expect(projectMapPoint(projector, -1, -3)).toEqual({
      x: -10,
      y: 30,
      visible: false,
    });
  });

  it('drops trail points that project behind the camera', () => {
    const projector = {
      project: (lat: number, lng: number) => ({
        x: lat,
        y: lng,
        z: lat >= 0 ? 1 : -1,
      }),
    };

    expect(projectMapTrail(projector, [
      { lat: 1, lng: 10 },
      { lat: -1, lng: 20 },
      { lat: 2, lng: 30 },
    ])).toEqual([
      { x: 1, y: 10 },
      { x: 2, y: 30 },
    ]);
  });
});
