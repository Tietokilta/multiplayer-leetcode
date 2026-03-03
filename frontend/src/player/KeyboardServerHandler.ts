import type { ConnState } from "../connection";
import type { KeyboardServerCmd, KeyboardServerMessage } from "../messages";

export class KeyboardServerHandler {
  active: boolean = false;
  socket: WebSocket | null = null;
  timeout?: number;
  ledState: KeyboardServerCmd | null = null;
  handleMessage: ((data: KeyboardServerMessage) => void) | null = null;
  handleState: ((state: ConnState) => void) | null = null;

  send(cmd: KeyboardServerCmd) {
    this.ledState = cmd;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(cmd));
    }
  }

  connect() {
    this.active = true;
    this.socket = new WebSocket("ws://localhost:6969/");
    console.log("Connecting to keyboard server");
    this.socket.addEventListener("open", () => {
      console.log("Keyboard server connection opened");
      this.handleState?.("connected");
      if (this.ledState) {
        this.socket!.send(JSON.stringify(this.ledState));
      }
    });
    this.socket.addEventListener("message", (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      // console.log("Keyboard server message:", data);
      this.handleMessage?.(data);
    });
    this.socket.addEventListener("close", (event: CloseEvent) => {
      console.log("Keyboard server connection closed:", event.code);
      this.handleState?.("not");
      // Reconnect if mounted
      if (event.target === this.socket) {
        this.socket = null;
        if (this.active) this.timeout = window.setTimeout(() => this.connect(), 1000);
      }
    });
  }

  disconnect() {
    this.active = false;
    this.socket?.close();
    this.socket = null;
    clearTimeout(this.timeout);
  }
}
