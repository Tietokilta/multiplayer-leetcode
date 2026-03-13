import { useState, type ReactNode } from "react";
import { useReadLocalStorage } from "usehooks-ts";

type Props = {
  children: ReactNode;
  onConnect: (myId: string, serverIp: string) => void;
  error: string | null;
  storageKey?: string;
};

const Login = ({ children, onConnect, error, storageKey = "multiplayer-leetcode" }: Props) => {
  const myId = useReadLocalStorage<string>(`${storageKey}-my-id`) ?? "";
  const [myIdInput, setMyIdInput] = useState(myId);

  const serverIp = useReadLocalStorage<string>(`${storageKey}-server-ip`) ?? "";
  const [serverIpInput, setServerIpInput] = useState(serverIp);

  return (
    <div className="m-4 border rounded p-4 flex flex-col gap-3">
      <div>Please set the team name and game server IP.</div>
      {error && (
        <div className="text-red-500">Error connecting to server: "{error}" Please check the IP and try again.</div>
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
