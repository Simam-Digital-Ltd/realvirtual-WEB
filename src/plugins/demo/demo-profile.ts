// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

export const WAKEFIELD_DEMO_PROFILE = {
  brand: {
    company: 'Simam',
    product: 'Simam Digital Twin',
    attribution: 'built with realvirtual WEB',
  },
  client: {
    name: 'Wakefield Precision Foods',
    shortName: 'Wakefield',
    siteCode: 'WPF-41',
    siteName: 'Wakefield Precision Foods WPF-41',
    cockpitTitle: 'Factory to Yard Cockpit',
    operationsLabel: 'WPF-41 OPERATIONS',
    commandLabel: 'WPF-41 COMMAND',
    liveWatchLabel: 'WPF-41 live watch',
    mapSiteLabel: 'WPF-41 SITE',
  },
  site: {
    latitude: 53.6931,
    longitude: -1.5034,
    mapLatitude: 53.693,
    mapLongitude: -1.503,
    mapZoom: 18,
  },
  assets: {
    robotCell: 'Robot Cell A',
    dock: 'Dock 4',
    dockLabel: 'Outbound Dock 4',
    inboundVehicle: 'HGV-14',
    yardTug: 'YT-02',
    maintenanceTech: 'MT-03',
    coldStore: 'Cold Store B',
  },
  kpis: {
    availability: '87',
    availabilityTarget: 'Shift target: 90%',
    casesPacked: '1,248',
    shiftTotal: 'Shift total: 7,430',
    dockTurnaround: '18',
    coldChain: '2.4',
    coldChainUnit: 'C',
    coldChainStatus: 'Zone A stable',
    dispatchTarget: 74,
  },
  copy: {
    shiftName: 'AM Packing',
    caseTarget: '12,000',
    currentCases: '7,430',
    decisionDue: '12 min',
    inboundStatus: 'HGV-14 at gate',
    cellStatus: 'Tray former watch',
    dockStatus: '2 waiting',
    coldStatus: '2.4 C stable',
  },
} as const;

export type WakefieldDemoProfile = typeof WAKEFIELD_DEMO_PROFILE;
