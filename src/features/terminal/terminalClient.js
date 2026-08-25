import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

function terminalUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/terminal`;
}

export function createTerminalClient({ element, serverId, path, onState }) {
  const terminal = new Terminal({
    allowProposedApi: false,
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 14,
    scrollback: 5000,
    theme: {
      background: "#020617",
      foreground: "#dbeafe",
      cursor: "#6ee7b7",
      cursorAccent: "#020617",
      selectionBackground: "#334155",
      black: "#0f172a",
      brightBlack: "#64748b",
      red: "#fb7185",
      green: "#6ee7b7",
      yellow: "#facc15",
      blue: "#7dd3fc",
      magenta: "#c4b5fd",
      cyan: "#67e8f9",
      white: "#e2e8f0"
    }
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(element);

  let connected = false;
  let disposed = false;
  let finalStateReceived = false;
  let resizeTimer = null;
  const socket = new WebSocket(terminalUrl());

  function send(message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function fit(sendResize = connected) {
    if (disposed || !element.isConnected || element.clientWidth === 0 || element.clientHeight === 0) return;
    try {
      fitAddon.fit();
      if (sendResize) send({ type: "resize", cols: terminal.cols, rows: terminal.rows });
    } catch {
      // The container may be between layout states during navigation.
    }
  }

  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => fit(), 80);
  });
  resizeObserver.observe(element);

  const inputSubscription = terminal.onData((data) => {
    if (connected) send({ type: "input", data });
  });

  socket.addEventListener("open", () => {
    fit(false);
    send({ type: "init", serverId, path, cols: terminal.cols, rows: terminal.rows });
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      onState({ kind: "error", label: "Terminal protocol error" });
      socket.close();
      return;
    }
    if (message.type === "ready") {
      connected = true;
      fit(true);
      terminal.focus();
      onState({ kind: "connected", label: "Connected" });
    } else if (message.type === "output" && typeof message.data === "string") {
      terminal.write(message.data);
    } else if (message.type === "exit") {
      connected = false;
      finalStateReceived = true;
      onState({ kind: "exited", label: "Terminal process exited" });
    } else if (message.type === "error") {
      connected = false;
      finalStateReceived = true;
      onState({ kind: "error", label: message.message || "Terminal session failed" });
    }
  });

  socket.addEventListener("close", () => {
    connected = false;
    if (!disposed && !finalStateReceived) onState({ kind: "disconnected", label: "Disconnected" });
  });
  socket.addEventListener("error", () => {
    connected = false;
    if (!disposed) onState({ kind: "error", label: "Terminal connection failed" });
  });

  window.setTimeout(() => fit(false), 0);

  return {
    focus: () => terminal.focus(),
    dispose() {
      disposed = true;
      connected = false;
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      inputSubscription.dispose();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(1000, "Terminal view closed");
      terminal.dispose();
    }
  };
}
