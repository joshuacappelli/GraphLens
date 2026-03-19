import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createServer, type Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { forward } from "vscode-ws-jsonrpc/server";
import {
  createProcessStreamConnection,
  createWebSocketConnection,
} from "vscode-ws-jsonrpc/server";
import { toSocket } from "vscode-ws-jsonrpc";

type Bridge = {
  port: number;
  workspaceRoot: string;
  stop: () => Promise<void>;
};

function resolveBin(binName: string): string {
  // Prefer local node_modules/.bin so packaging/dev behave similarly.
  return path.resolve(process.cwd(), "node_modules", ".bin", binName);
}

export async function startTypeScriptLspBridge(workspaceRoot: string): Promise<Bridge> {
  const root = path.resolve(workspaceRoot);
  console.info("[ts-lsp] starting", { workspaceRoot: root });

  const server = createServer();
  const wss = new WebSocketServer({ server });

  const child: ChildProcessWithoutNullStreams = spawn(
    resolveBin("typescript-language-server"),
    ["--stdio"],
    {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    }
  );
  child.stderr.on("data", (chunk) => {
    console.error("[ts-lsp] stderr:", chunk.toString("utf8"));
  });

  const processConnection = createProcessStreamConnection(child);
  if (!processConnection) {
    throw new Error("Unable to create tsserver process connection");
  }

  // One LSP server process per bridge; allow multiple websocket clients by forwarding on connect.
  wss.on("connection", (webSocket) => {
    const socket = toSocket(webSocket as unknown as WebSocket);
    const wsConnection = createWebSocketConnection(socket);
    forward(wsConnection, processConnection);
    forward(processConnection, wsConnection);
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind LSP bridge port"));
        return;
      }
      resolve(addr.port);
    });
  });
  console.info("[ts-lsp] bridge listening", { port, workspaceRoot: root });

  const stop = async () => {
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      (server as HttpServer).close(() => resolve());
    });
    child.kill();
  };

  return { port, workspaceRoot: root, stop };
}

