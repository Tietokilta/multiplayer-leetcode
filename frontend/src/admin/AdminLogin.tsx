import { useLocalStorage } from "usehooks-ts";
import type { AdminState } from "./adminState";
import { stateColors } from "../connection";

export function AdminLogin({ state }: { state: AdminState }) {
  const [serverIp, setServerIp] = useLocalStorage("leetcode-admin-server-ip", "");
  const [password, setPassword] = useLocalStorage("leetcode-admin-password", "");

  const { connect, connState, loginError } = state;

  return (
    <form
      className="p-4 max-w-md mx-auto"
      onSubmit={(e) => {
        e.preventDefault();
        connect(serverIp, password);
      }}
    >
      <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
      <div className="flex items-center mb-2">
        <span className={`w-3 h-3 rounded-full inline-block mr-2 ${stateColors[connState]}`} />
        <span className="text-sm">{connState}</span>
      </div>
      {loginError && <div className="text-red-500 mb-2">{loginError}</div>}
      <div className="mb-3">
        <input
          className="border rounded p-2 w-full"
          type="text"
          value={serverIp}
          onChange={(e) => setServerIp(e.target.value)}
          placeholder="Server IP (e.g. 127.0.0.1)"
          autoFocus
        />
      </div>
      <div className="mb-3">
        <input
          className="border rounded p-2 w-full"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
        />
      </div>
      <button
        type="submit"
        className="text-blue-500 underline p-2 rounded cursor-pointer hover:bg-blue-500/25 w-full disabled:opacity-70"
        disabled={!serverIp || !password || connState === "connecting"}
      >
        Connect
      </button>
    </form>
  );
}
