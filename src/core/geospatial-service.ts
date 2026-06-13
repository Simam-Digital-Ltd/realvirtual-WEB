// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>


export interface SiteMetrics {
  workerCount: number;
  activeMachinery: number;
  energyUsage: number; // in kW
  siteSafetyScore: number; // 0-100
  lastIncidentDays: number;
  throughput: number; // units/hr
}

export interface OperationalIntelligence {
  shiftName: string;
  shiftProgress: number; // 0-100
  productionEfficiency: number; // 0-100
  safetyMilestone: string;
}

export interface ForecastItem {
  time: string;
  temp: number;
  condition: string;
  isRaining: boolean;
}

export interface SiteCondition {
  status: 'Optimal' | 'Caution' | 'Alert';
  label: string;
  notes: string;
}

/**
 * GeospatialService
 * Fetches industrial intelligence data from open and key-less sources.
 */
export class GeospatialService {
  /** Mock Site Metrics for Simam Goods - Wakefield */
  static async fetchSiteMetrics(): Promise<SiteMetrics> {
    return {
      workerCount: 42 + Math.floor(Math.random() * 8),
      activeMachinery: 12,
      energyUsage: 145.5 + Math.random() * 20,
      siteSafetyScore: 98,
      lastIncidentDays: 452,
      throughput: 1250 + Math.floor(Math.random() * 150)
    };
  }

  /** Mock Operational Intelligence for the current shift */
  static async fetchOperationalIntelligence(): Promise<OperationalIntelligence> {
    const hour = new Date().getHours();
    let shiftName = 'Night';
    let startHour = 22;

    if (hour >= 6 && hour < 14) { shiftName = 'Morning'; startHour = 6; }
    else if (hour >= 14 && hour < 22) { shiftName = 'Afternoon'; startHour = 14; }

    const elapsed = hour >= startHour ? hour - startHour : (24 - startHour) + hour;
    const progress = Math.floor((elapsed / 8) * 100);

    return {
      shiftName,
      shiftProgress: Math.min(100, progress),
      productionEfficiency: 92 + Math.random() * 5,
      safetyMilestone: '450+ Days Incident Free'
    };
  }

  /** Mock Site Condition analysis */
  static async fetchSiteCondition(weather: WeatherData | null): Promise<SiteCondition> {
    if (weather && (weather.windSpeed > 30 || weather.isRaining)) {
      return { 
        status: 'Caution', 
        label: 'Weather Impact', 
        notes: 'High winds detected. Restricted outdoor drone operations.' 
      };
    }
    return { 
      status: 'Optimal', 
      label: 'Nominal Operations', 
      notes: 'All systems performing within expected parameters.' 
    };
  }

  /** Fetch current weather from Open-Meteo (No key required for non-commercial) */
  static async fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=precipitation`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Weather fetch failed');
      const data = await response.json();
      
      const cw = data.current_weather;
      // Find current hour precipitation
      const now = new Date().toISOString().substring(0, 13) + ':00';
      const pIndex = data.hourly.time.indexOf(now);
      const precipitation = pIndex !== -1 ? data.hourly.precipitation[pIndex] : 0;

      // WMO Weather interpretation codes
      const isRaining = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(cw.weathercode);
      
      return {
        temp: cw.temperature,
        windSpeed: cw.windspeed,
        condition: this._getWeatherCondition(cw.weathercode),
        precipitation,
        isRaining,
        timestamp: cw.time
      };
    } catch (e) {
      console.warn('[GeospatialService] Weather fetch failed, using fallback:', e);
      return null;
    }
  }

  /** Fetch 6-hour forecast from Open-Meteo */
  static async fetchWeatherForecast(lat: number, lng: number): Promise<ForecastItem[]> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,weathercode&forecast_days=1`;
      const response = await fetch(url);
      const data = await response.json();
      
      const now = new Date();
      now.setMinutes(0, 0, 0);
      
      const forecast: ForecastItem[] = [];
      for (let i = 1; i <= 6; i++) {
        const futureDate = new Date(now.getTime() + i * 3600000);
        const timeStr = futureDate.toISOString().substring(0, 13) + ':00';
        const index = data.hourly.time.indexOf(timeStr);
        
        if (index !== -1) {
          const code = data.hourly.weathercode[index];
          forecast.push({
            time: futureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            temp: data.hourly.temperature_2m[index],
            condition: this._getWeatherCondition(code),
            isRaining: [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)
          });
        }
      }
      return forecast;
    } catch (e) {
      return [];
    }
  }

  /** Fetch Flood Alerts from UK Environment Agency API (Open Data) */
  static async fetchFloodAlerts(lat: number, lng: number): Promise<FloodAlert[]> {
    try {
      // Find flood areas within 10km of coordinates
      const url = `https://environment.data.gov.uk/flood-monitoring/id/floods?lat=${lat}&long=${lng}&dist=10`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Flood alert fetch failed');
      const data = await response.json();
      
      return (data.items || []).map((item: any) => ({
        id: item['@id'],
        description: item.description,
        severity: item.severity,
        severityLevel: item.severityLevel,
        timeRaised: item.timeRaised
      }));
    } catch (e) {
      console.warn('[GeospatialService] Flood alert fetch failed:', e);
      return [];
    }
  }

  /** Traffic Intelligence for Wakefield 41 Corridor (A650) using DfT Stats */
  static async fetchTrafficStatus(lat: number, lng: number): Promise<TrafficStatus> {
    try {
      // DfT Road Traffic Stats - A650 Wakefield (Count Point 27433)
      const url = `https://roadtraffic.dft.gov.uk/api/average-annual-daily-flow?filter[count_point_id]=27433`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('DfT Stats fetch failed');
      const json = await response.json();
      
      // Get the latest year's flow (first item)
      const stats = json.data[0];
      const baselineAADF = stats?.all_motor_vehicles ?? 15000;
      
      // Simulate "Live" flow percentage based on time of day profile
      const hour = new Date().getHours();
      let multiplier = 1.0;
      let statusLabel = 'Optimal';
      
      if (hour >= 7 && hour <= 9) { multiplier = 0.45; statusLabel = 'Heavy (Morning)'; }
      else if (hour >= 16 && hour <= 18) { multiplier = 0.38; statusLabel = 'Congested (Peak)'; }
      else if (hour >= 23 || hour <= 4) { multiplier = 1.25; statusLabel = 'Clear (Free-flow)'; }
      else { multiplier = 0.95; statusLabel = 'Normal Flow'; }

      // We normalize flowPct where 100% is the expected flow for the current hour
      // But for the dashboard, we represent it as "Capacity Utilization"
      return {
        flowPct: Math.min(100, Math.floor(multiplier * 100)),
        statusLabel,
        incidents: Math.random() > 0.95 ? 1 : 0
      };
    } catch (e) {
      console.warn('[GeospatialService] Traffic fetch failed, using fallback:', e);
      return { flowPct: 90, statusLabel: 'Estimated: Normal', incidents: 0 };
    }
  }


  private static _getWeatherCondition(code: number): string {
    if (code === 0) return 'Clear Sky';
    if (code <= 3) return 'Partly Cloudy';
    if ([45, 48].includes(code)) return 'Fog';
    if ([51, 53, 55].includes(code)) return 'Drizzle';
    if ([61, 63, 65].includes(code)) return 'Rain';
    if ([71, 73, 75].includes(code)) return 'Snow';
    if ([95, 96, 99].includes(code)) return 'Thunderstorm';
    return 'Cloudy';
  }
}

