/**
 * McpBridgePlugin — WebSocket bridge connecting the browser to the Python MCP server.
 *
 * On start, connects to ws://localhost:18712/webviewer and sends a `discover`
 * message containing tool schemas (generated from @McpTool decorators) and the
 * webviewer.mcp.md instructions file. The Python server registers these as
 * `web_*` FastMCP tools. When Claude calls a web_* tool, Python forwards the
 * call via WebSocket and this plugin dispatches it to the decorated method.
 *
 * Auto-reconnects with exponential backoff (1s -> 30s max).
 * DEV-only OR gated behind ?mcp=1 URL param.
 */

import { RVBehavior } from '../core/rv-behavior';
import type { LoadResult } from '../core/engine/rv-scene-loader';
import type { RVLogicStep } from '../core/engine/rv-logic-step';
import {
  McpTool,
  McpParam,
  generateToolSchemas,
  buildToolDispatcher,
} from '../core/engine/rv-mcp-tools';
import { getLastLogs, queryLogs } from '../core/engine/rv-debug';
import type { LogLevel } from '../core/engine/rv-debug';

// Vite raw import — embeds the .md content as a string at build time
import MCP_INSTRUCTIONS from '../../webviewer.mcp.md?raw';

/** Serialize any object's own enumerable properties (primitives + shallow). */
function serializeProps(obj: unknown, maxDepth = 2): Record<string, unknown> {
  if (obj === null || obj === undefined || typeof obj !== 'object') return {};
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('_')) continue;
    const val = (obj as Record<string, unknown>)[key];
    if (val === undefined || val === null) { result[key] = val; continue; }
    if (typeof val === 'function') continue;
    if (typeof val === 'number') { result[key] = +val.toFixed(4); continue; }
    if (typeof val === 'boolean' || typeof val === 'string') { result[key] = val; continue; }
    if (Array.isArray(val)) continue;
    if (typeof val === 'object') {
      if (maxDepth > 0) result[key] = serializeProps(val, maxDepth - 1);
      continue;
    }
  }
  return result;
}

// ── Types ──

interface CallMessage {
  type: 'call';
  id: number;
  tool: string;
  arguments: Record<string, unknown>;
}

// ── Plugin ──

export class McpBridgePlugin extends RVBehavior {
  readonly id = 'mcp-bridge';
  readonly order = 990;

  // WebSocket state
  private _ws: WebSocket | null = null;
  private _dispatcher: Map<string, { methodKey: string; paramNames: string[] }> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectDelay = 1000;
  private _maxReconnectDelay = 30000;
  private _destroyed = false;

  // ── Lifecycle ──

  protected onStart(_result: LoadResult): void {
    this._destroyed = false;
    this._connect();
  }

  protected onDestroy(): void {
    this._destroyed = true;
    // Clear reconnect timer to prevent leak (review fix #4)
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._disconnect();
  }

  // ── WebSocket Connection ──

  private _connect(): void {
    if (this._destroyed) return;
    const port = new URLSearchParams(window.location.search).get('mcpPort') || '18712';
    try {
      this._ws = new WebSocket(`ws://localhost:${port}/webviewer`);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this._ws.onopen = () => this._sendDiscover();
    this._ws.onmessage = (e) => { this._handleMessage(e.data); };
    this._ws.onerror = () => {};  // suppress console noise; onclose handles reconnect
    this._ws.onclose = () => this._scheduleReconnect();
  }

  private _disconnect(): void {
    if (this._ws) {
      this._ws.onclose = null;  // prevent reconnect on intentional close
      this._ws.onerror = null;
      this._ws.onmessage = null;
      this._ws.close();
      this._ws = null;
    }
    this._dispatcher = null;
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return;
    this._ws = null;

    // Exponential backoff with jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(this._reconnectDelay + jitter, this._maxReconnectDelay);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect();
    }, delay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, this._maxReconnectDelay);
  }

  private _sendDiscover(): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const schemas = generateToolSchemas(this);
    this._dispatcher = buildToolDispatcher(this);
    this._ws.send(JSON.stringify({
      type: 'discover',
      tools: schemas,
      instructions: MCP_INSTRUCTIONS,
      schema_version: '1.0.0',
    }));
    // Reset backoff on successful connection
    this._reconnectDelay = 1000;
  }

  // ── Message Handling ──

  private async _handleMessage(raw: string): Promise<void> {
    // Review fix: wrap entire body in try/catch to prevent UnhandledPromiseRejection
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'call') {
        await this._handleCall(msg as CallMessage);
      }
    } catch (e) {
      console.warn('[McpBridge] Failed to handle message:', e);
    }
  }

  private async _handleCall(msg: CallMessage): Promise<void> {
    const { id, tool, arguments: args } = msg;

    if (!this._dispatcher) {
      this._sendResult(id, undefined, 'Dispatcher not ready');
      return;
    }

    const entry = this._dispatcher.get(tool);
    if (!entry) {
      this._sendResult(id, undefined, `Unknown tool: ${tool}`);
      return;
    }

    try {
      const method = (this as unknown as Record<string, Function>)[entry.methodKey];
      if (typeof method !== 'function') {
        this._sendResult(id, undefined, `Method not found: ${entry.methodKey}`);
        return;
      }

      // Build ordered arguments from named params
      const orderedArgs = entry.paramNames.map(name => args[name]);
      const result = await method.apply(this, orderedArgs);
      this._sendResult(id, result);
    } catch (e) {
      this._sendResult(id, undefined, String(e));
    }
  }

  private _sendResult(id: number, result?: string, error?: string): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
    const msg: Record<string, unknown> = { type: 'result', id };
    if (error !== undefined) {
      msg.error = error;
    } else {
      msg.result = result;
    }
    this._ws.send(JSON.stringify(msg));
  }

  // ═══════════════════════════════════════════════════════════════════
  // @McpTool Definitions (11 tools)
  // ═══════════════════════════════════════════════════════════════════

  @McpTool('Get WebViewer status: connection, FPS, model info, component counts')
  async webStatus(): Promise<string> {
    return JSON.stringify({
      connected: true,
      fps: this.viewer?.currentFps ?? 0,
      connectionState: this.viewer?.connectionState ?? 'unknown',
      model: this.viewer?.currentModelUrl ?? null,
      loadInfo: this.viewer?.lastLoadInfo ?? null,
      driveCount: this.drives.length,
      sensorCount: this.sensors.length,
      signalCount: this.signals?.size ?? 0,
      muCount: this.transportManager?.mus.length ?? 0,
      logicRoots: this.viewer?.logicEngine?.roots.length ?? 0,
    });
  }

  @McpTool('List all drives with current position, speed, direction, and limits')
  async webDriveList(): Promise<string> {
    return JSON.stringify(this.drives.map(d => ({
      name: d.name,
      currentPosition: +d.currentPosition.toFixed(3),
      targetPosition: +d.targetPosition.toFixed(3),
      targetSpeed: +d.targetSpeed.toFixed(3),
      isRunning: d.isRunning,
      jogForward: d.jogForward,
      jogBackward: d.jogBackward,
      direction: d.Direction,
      upperLimit: d.UpperLimit,
      lowerLimit: d.LowerLimit,
      acceleration: d.Acceleration,
    })));
  }

  @McpTool('List all PLC signals with current values (bool, int, or float)')
  async webSignalList(): Promise<string> {
    const all = this.signals?.getAll();
    if (!all) return JSON.stringify([]);
    const result: Array<{ name: string; value: boolean | number; type: string }> = [];
    for (const [name, value] of all) {
      result.push({
        name,
        value,
        type: typeof value,
      });
    }
    return JSON.stringify(result);
  }

  @McpTool('Set a boolean signal value in the browser')
  async webSignalSetBool(
    @McpParam('name', 'Signal name') name: string,
    @McpParam('value', 'Boolean value to set', 'boolean') value: boolean,
  ): Promise<string> {
    if (!this.signals) return JSON.stringify({ error: 'No signal store available' });
    const current = this.signals.get(name);
    if (current === undefined) return JSON.stringify({ error: `Signal "${name}" not found` });
    this.signals.set(name, value);
    return JSON.stringify({ name, value, previous: current });
  }

  @McpTool('Set a float signal value in the browser')
  async webSignalSetFloat(
    @McpParam('name', 'Signal name') name: string,
    @McpParam('value', 'Float value to set', 'number') value: number,
  ): Promise<string> {
    if (!this.signals) return JSON.stringify({ error: 'No signal store available' });
    const current = this.signals.get(name);
    if (current === undefined) return JSON.stringify({ error: `Signal "${name}" not found` });
    this.signals.set(name, value);
    return JSON.stringify({ name, value, previous: current });
  }

  @McpTool('Jog a drive forward or backward')
  async webDriveJog(
    @McpParam('name', 'Drive name') name: string,
    @McpParam('forward', 'true for forward, false for backward', 'boolean', false) forward: boolean,
  ): Promise<string> {
    const drive = this.drives.find(d => d.name === name);
    if (!drive) return JSON.stringify({ error: `Drive "${name}" not found` });
    const dir = forward !== false;  // default to true if not specified
    drive.jogForward = dir;
    drive.jogBackward = !dir;
    return JSON.stringify({ name, jogForward: dir, jogBackward: !dir });
  }

  @McpTool('Stop a drive (clear jog flags and stop motion)')
  async webDriveStop(
    @McpParam('name', 'Drive name') name: string,
  ): Promise<string> {
    const drive = this.drives.find(d => d.name === name);
    if (!drive) return JSON.stringify({ error: `Drive "${name}" not found` });
    drive.jogForward = false;
    drive.jogBackward = false;
    drive.stop();
    return JSON.stringify({ name, stopped: true });
  }

  @McpTool('List all sensors with occupancy status')
  async webSensorList(): Promise<string> {
    return JSON.stringify(this.sensors.map(s => ({
      name: s.node.name,
      occupied: s.occupied,
      mode: s.mode,
      signalOccupied: s.SensorOccupied,
      signalNotOccupied: s.SensorNotOccupied,
    })));
  }

  @McpTool('Get transport status: MU counts, active sources and sinks')
  async webTransportStatus(): Promise<string> {
    const tm = this.transportManager;
    if (!tm) return JSON.stringify({ error: 'No transport manager' });
    return JSON.stringify({
      totalSpawned: tm.totalSpawned,
      totalConsumed: tm.totalConsumed,
      activeMUs: tm.mus.length,
      mus: tm.mus.map(mu => ({
        name: mu.getName(),
        ...serializeProps(mu, 1),
      })),
      sources: tm.sources.map(src => ({
        name: src.node.name,
        ...serializeProps(src, 1),
      })),
      sinks: tm.sinks.map(sink => ({
        name: sink.node.name,
        ...serializeProps(sink, 1),
      })),
    });
  }

  @McpTool('Get LogicStep flow hierarchy with step states and progress')
  async webLogicFlow(): Promise<string> {
    const engine = this.viewer?.logicEngine;
    if (!engine) return JSON.stringify({ error: 'No logic engine' });

    const mapStep = (step: RVLogicStep): object => {
      const props = serializeProps(step, 1);
      const base: Record<string, unknown> = {
        name: step.name,
        type: step.constructor.name,
        state: step.state,
        progress: step.progress,
        ...props,
      };
      if ('children' in step) {
        base.children = (step as { children: RVLogicStep[] }).children.map(mapStep);
      }
      return base;
    };

    return JSON.stringify({
      stats: engine.stats,
      roots: engine.roots.map(mapStep),
    });
  }

  @McpTool('Get browser console logs (errors, warnings, debug messages)')
  async webLogs(
    @McpParam('level', 'Minimum log level: trace|debug|info|warn|error', 'string', false) level: string,
    @McpParam('limit', 'Max number of entries to return', 'integer', false) limit: number,
  ): Promise<string> {
    if (level || limit) {
      return JSON.stringify(queryLogs({
        level: (level as LogLevel) || undefined,
        limit: limit || 100,
      }));
    }
    return JSON.stringify(getLastLogs(100));
  }
}
