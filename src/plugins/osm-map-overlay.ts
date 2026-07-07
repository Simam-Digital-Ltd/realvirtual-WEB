// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

export interface MapProjector {
  project(lat: number, lng: number, alt?: number): { x: number; y: number; z: number };
}

export interface MapLatLng {
  lat: number;
  lng: number;
}

export interface ProjectedMapPoint {
  x: number;
  y: number;
  visible: boolean;
}

export function projectMapPoint(projector: MapProjector, lat: number, lng: number, alt = 0): ProjectedMapPoint {
  const pos = projector.project(lat, lng, alt);
  return {
    x: pos.x,
    y: pos.y,
    visible: pos.z > 0,
  };
}

export function projectMapTrail(projector: MapProjector, points: MapLatLng[]): Array<{ x: number; y: number }> {
  const projected: Array<{ x: number; y: number }> = [];

  for (const point of points) {
    const pos = projectMapPoint(projector, point.lat, point.lng);
    if (pos.visible) {
      projected.push({ x: pos.x, y: pos.y });
    }
  }

  return projected;
}
