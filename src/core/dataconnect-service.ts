// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>


import { 
  listAllDigitalTwinModels, 
  getRobotById, 
  createNewSimulation, 
  getUserSimulations,
  listRobotHistoricalEvents
} from "../dataconnect-generated";
import { dataConnect } from "./rv-firebase";

/**
 * Service for interacting with Firebase Data Connect (PostgreSQL).
 * Provides typed wrappers for simulation and robot data management.
 */
export const DataConnectService = {
  /**
   * List all available digital twin models.
   */
  async listAllModels() {
    try {
      const result = await listAllDigitalTwinModels(dataConnect);
      return result.data.digitalTwinModels;
    } catch (error) {
      console.error("[DataConnect] Failed to list models:", error);
      throw error;
    }
  },

  /**
   * Get a specific robot by its UUID.
   */
  async getRobot(robotId: string) {
    try {
      const result = await getRobotById(dataConnect, { robotId });
      return result.data.robot;
    } catch (error) {
      console.error(`[DataConnect] Failed to get robot ${robotId}:`, error);
      throw error;
    }
  },

  /**
   * Record a new simulation session.
   * Generates a unique ID on the client side to bypass mutation selection issues.
   */
  async recordSimulation(params: {
    name: string;
    simulationData: string;
    status: string;
    robotId: string;
    userId: string;
    id?: string; // Optional: can be provided by caller or generated here
  }) {
    const id = params.id || crypto.randomUUID();
    
    try {
      const result = await createNewSimulation(dataConnect, {
        ...params,
        id
      });
      
      // We return the identifier we used so the caller can track it
      return { ...result.data.simulation_insert, id };
    } catch (error) {
      console.error("[DataConnect] Failed to record simulation:", error);
      throw error;
    }
  },

  /**
   * Fetch simulations grouped by user.
   */
  async getUserSimulations() {
    try {
      const result = await getUserSimulations(dataConnect);
      return result.data.users;
    } catch (error) {
      console.error("[DataConnect] Failed to fetch user simulations:", error);
      throw error;
    }
  },

  /**
   * Get movement paths for all robots at a site for the last N hours.
   */
  async getHistoricalPaths(hours: number = 24) {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const result = await listRobotHistoricalEvents(dataConnect, { startTime });
      
      const events = result.data.robotEvents;
      
      // Group by Robot ID for trail rendering
      const trails: Record<string, { name: string, points: { lat: number, lng: number }[] }> = {};
      
      events.forEach(event => {
        if (!event.robot) return;
        const rid = event.robot.id;
        if (!trails[rid]) {
          trails[rid] = { name: event.robot.name, points: [] };
        }
        
        try {
          const latlng = JSON.parse(event.data);
          if (latlng.lat && latlng.lng) {
            trails[rid].points.push({ lat: latlng.lat, lng: latlng.lng });
          }
        } catch (e) { /* skip malformed data */ }
      });

      // Demo Fallback: If no paths found, generate dummy trails around Wakefield for demo
      if (Object.keys(trails).length === 0) {
        trails['demo-drone-1'] = {
          name: 'Logic Drone A1',
          points: [
            { lat: 53.693, lng: -1.503 },
            { lat: 53.694, lng: -1.504 },
            { lat: 53.695, lng: -1.502 },
            { lat: 53.693, lng: -1.503 },
          ]
        };
        trails['demo-amr-1'] = {
          name: 'AMR-X4',
          points: [
            { lat: 53.692, lng: -1.502 },
            { lat: 53.6925, lng: -1.5025 },
            { lat: 53.693, lng: -1.502 },
          ]
        };
      }
      
      return trails;
    } catch (error) {
       console.warn("[DataConnect] Failed to fetch historical paths, using fallback:", error);
       return {};
    }
  },

  /**
   * Fetch 7-day historical trend data for an asset.
   */
  async get7DayTrendData(robotId: string) {
    console.warn(`[DataConnect] Fetching 7-day trend for ${robotId}, using fallback demo data`);
    // Wakefield Client Fallback Demo Data
    const now = Date.now();
    const fallbackData = [];
    for(let i=7; i>=0; i--) {
      fallbackData.push({
        timestamp: new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
        temperature: 45 + Math.random() * 10 + (i === 1 ? 20 : 0), // Spike 1 day ago
        vibration: 2.5 + Math.random() * 1.5,
        oeeScore: 85 + Math.random() * 10 - (i === 1 ? 15 : 0)
      });
    }
    return fallbackData;
  },

  /**
   * Fetch predictive diagnostic alerts.
   */
  async getPredictiveDiagnostics(robotId: string) {
    console.warn(`[DataConnect] Fetching diagnostics for ${robotId}, using fallback demo data`);
    // Wakefield Client Fallback Demo Data
    return [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        severity: "WARNING",
        message: "Motor temperature anomaly detected.",
        temperature: 85.4,
        vibration: 3.2
      }
    ];
  }
};
