import { useState, type ReactNode } from "react";
import { useReadLocalStorage } from "usehooks-ts";

type Props = {
  children: ReactNode;
  onConnect: (myId: string, serverIp: string) => void;
};

const Login = ({ children, onConnect }: Props) => {
  const myId = useReadLocalStorage<string>("multiplayer-leetcode-my-id") ?? "";
  const [myIdInput, setMyIdInput] = useState(myId);

  const serverIp = useReadLocalStorage<string>("multiplayer-leetcode-server-ip") ?? "";
  const [serverIpInput, setServerIpInput] = useState(serverIp);

  const serverIpError = useReadLocalStorage<string>("multiplayer-leetcode-server-ip-error") ?? "";

  return (
    <div className="m-4 border rounded p-4 flex flex-col gap-3">
      <div>Please set the team name and game server IP.</div>
      {serverIpError && (
        <div className="text-red-500">
          Error connecting to server: "{serverIpError}" Please check the IP and try again.
        </div>
      )}
      <div>
        <input
          className="border-1 rounded p-1"
          type="text"
          value={myIdInput}
          onChange={(e) => setMyIdInput(e.target.value)}
          placeholder="TiK"
        />
      </div>
      <div>
        <input
          className="border-1 rounded p-1"
          type="text"
          value={serverIpInput}
          onChange={(e) => setServerIpInput(e.target.value)}
          placeholder="1.2.3.4"
        />
      </div>
      {children}
      <div>
        <button
          className="border-1 rounded p-1 disabled:opacity-50"
          disabled={!myIdInput || !serverIpInput}
          onClick={() => onConnect(myIdInput, serverIpInput)}
        >
          Connect
        </button>
      </div>
    </div>
  );
};

export default Login;
