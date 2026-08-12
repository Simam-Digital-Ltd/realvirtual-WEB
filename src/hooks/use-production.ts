// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import { useSyncExternalStore } from 'react';
import {
  subscribeProduction,
  getProductionSnapshot,
  type ProductionSnapshot,
} from '../core/production-metrics';

/** Live production KPIs measured from the running simulation. */
export function useProduction(): ProductionSnapshot {
  return useSyncExternalStore(subscribeProduction, getProductionSnapshot, getProductionSnapshot);
}
