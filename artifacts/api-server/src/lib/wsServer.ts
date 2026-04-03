import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger.js";
import type { AgentEvent, AgentTask } from "./sessionManager.js";
import type { ActionRecord } from "./orchestrator/actionModel.js";
import type { RunPhase, InterventionKind } from "./orchestrator/types.js";

interface ServerMessage {
  type: "agent_event" | "task_updated" | "terminal_output" | "action_updated" | "ping" | "live_phase";
  taskId?: string;
  event?: AgentEvent;
  task?: AgentTask;
  data?: string;
  action?: ActionRecord;
  phase?: RunPhase;
  step?: number;
  maxSteps?: number;
  unverifiedWriteCount?: number;
  consecutiveFailures?: number;
  recoverable?: boolean;
  interventionKind?: InterventionKind;
  blockedContext?: string | null;
  gateTriggers?: Record<string, number> | null;
  verificationQuality?: string | null;
}

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocketServer(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    logger.info("WebSocket client connected");

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      logger.info("WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket client error");
      clients.delete(ws);
    });

    ws.send(JSON.stringify({ type: "ping" }));
  });

  logger.info("WebSocket server initialized at /api/ws");
  return wss;
}

export function broadcast(message: ServerMessage): void {
  const json = JSON.stringify(message, null, 0);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

export function broadcastAgentEvent(taskId: string, event: AgentEvent): void {
  broadcast({ type: "agent_event", taskId, event });
}

export function broadcastTaskUpdate(task: AgentTask): void {
  broadcast({ type: "task_updated", task });
}

export function broadcastTerminalOutput(data: string): void {
  broadcast({ type: "terminal_output", data });
}

export function broadcastActionUpdate(taskId: string, action: ActionRecord): void {
  broadcast({ type: "action_updated", taskId, action });
}

export function broadcastLivePhase(
  taskId:               string,
  phase:                RunPhase,
  step:                 number,
  maxSteps:             number,
  unverifiedWriteCount: number,
  consecutiveFailures:  number,
  recoverable:          boolean,
  interventionKind:     InterventionKind          = null,
  blockedContext:       string | null             = null,
  gateTriggers:         Record<string, number> | null = null,
  verificationQuality:  string | null             = null,
): void {
  broadcast({ type: "live_phase", taskId, phase, step, maxSteps, unverifiedWriteCount, consecutiveFailures, recoverable, interventionKind, blockedContext, gateTriggers, verificationQuality });
}
