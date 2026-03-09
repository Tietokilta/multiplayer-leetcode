export type ConnState = "connected" | "not" | "connecting";

export const stateColors: Record<ConnState, string> = {
  connected: "bg-green-500",
  not: "bg-red-500",
  connecting: "bg-yellow-500",
};

export class GameServerHandler<TCmd extends { type: string }, TMsg extends { type: string }> {
  active: boolean = false;
  hasOpened: boolean = false;
  loggedIn: boolean = false;
  socket: WebSocket | null = null;
  timeout?: number;

  // Queue for commands sent while disconnected
  queuedEdit: TCmd | null = null;
  queuedSubmit: TCmd | null = null;

  handleState: ((state: ConnState) => void) | null = null;
  handleLogin: ((loggedIn: boolean) => void) | null = null;
  handleLoginError: ((message: string) => void) | null = null;
  handleMessage: ((data: TMsg) => void) | null = null;

  send(cmd: TCmd) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(cmd));
    } else if (cmd.type === "edit") {
      this.queuedEdit = cmd;
    } else if (cmd.type === "submit") {
      this.queuedSubmit = cmd;
    }
  }

  connect(ip: string, loginCmd: TCmd) {
    console.log("Connecting to game server at", ip);
    this.handleState?.("connecting");
    this.active = true;
    this.socket = new WebSocket(`ws://${ip}:6979/`);

    this.socket.addEventListener("open", () => {
      console.log("Game server connection opened");
      this.hasOpened = true;
      this.handleState?.("connected");
      this.onOpen(loginCmd);
    });

    this.socket.addEventListener("message", (event: MessageEvent) => {
      const data: TMsg = JSON.parse(event.data);

      // Handle login responses
      if (data.type === "welcome" || data.type === "admin_welcome") {
        this.loggedIn = true;
        this.onLogin();
      } else if (data.type === "error" && !this.loggedIn) {
        this.handleLoginError?.((data as TMsg & { message: string }).message);
      } else {
        this.handleMessage?.(data);
      }
    });

    this.socket.addEventListener("close", (event: CloseEvent) => {
      console.log("Game server connection closed:", event.code);
      // If disconnect() was already called, it has sent the changes and we can ignore the rest.
      if (event.target !== this.socket) {
        console.log("Ignoring close event from stale socket");
        return;
      }
      const connectError = !event.wasClean && !this.hasOpened;
      if (connectError) {
        this.handleLoginError?.("Failed to connect to server");
      }
      if (this.loggedIn) {
        this.loggedIn = false;
        this.handleLogin?.(false);
      } else if (!this.hasOpened) {
        // Disconnect, failed before login
        this.disconnect();
      }
      this.handleState?.("not");
      // Reconnect if still mounted
      if (event.target === this.socket) {
        this.socket = null;
        if (this.active) {
          console.log("Attempting to reconnect to game server in 1000ms...");
          this.timeout = window.setTimeout(() => this.connect(ip, loginCmd), 1000);
        }
      }
    });
  }

  protected onOpen(loginCmd: TCmd) {
    // Send login command
    if (loginCmd) {
      this.socket!.send(JSON.stringify(loginCmd));
    }
  }

  protected onLogin() {
    this.handleLogin?.(true);
    // Flush queued commands
    if (this.queuedEdit) {
      this.socket!.send(JSON.stringify(this.queuedEdit));
      this.queuedEdit = null;
    }
    if (this.queuedSubmit) {
      this.socket!.send(JSON.stringify(this.queuedSubmit));
      this.queuedSubmit = null;
    }
  }

  disconnect() {
    this.active = false;
    this.hasOpened = false;
    this.loggedIn = false;
    this.queuedEdit = null;
    this.queuedSubmit = null;
    this.socket?.close();
    this.socket = null;
    this.handleLogin?.(false);
    this.handleState?.("not");
    clearTimeout(this.timeout);
  }
}
