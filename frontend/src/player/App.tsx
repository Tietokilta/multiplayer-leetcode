import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInterval, useLocalStorage } from "usehooks-ts";
import { stateColors } from "../connection";
import { DebuffSelector } from "./DebuffSelector";
import { RenderedEditor } from "./Editor";
import Game from "./Game";
import LocalKeyboard from "./LocalKeyboard";
import Login from "./Login";
import { PlayerController } from "./PlayerController";

const generateId = () => Array.from({ length: 12 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const generatedId = import.meta.env.PROD ? /^[a-f0-9]{12}$/ : /a^/;

function useServerConfig_DEV() {
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-my-id", "");
  const [serverIp, setServerIp] = useLocalStorage("multiplayer-leetcode-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-server-ip-error", "");

  return {
    myId,
    setMyId,
    serverIp,
    setServerIp,
    serverIpError,
    setServerIpError,
    canConnect: !!myId && !!serverIp && !serverIpError,
  };
}

function useServerConfig_PROD() {
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-prod-my-id", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-prod-server-ip-error", "");

  useEffect(() => {
    if (!myId) setMyId(generateId());
  }, [myId, setMyId]);

  return {
    serverIp: window.location.hostname,
    setServerIp: () => {}, // No-op in prod since server IP is fixed
    serverIpError,
    setServerIpError,
    myId,
    setMyId,
    canConnect: !!myId,
  };
}

const useServerConfig = import.meta.env.PROD ? useServerConfig_PROD : useServerConfig_DEV;

function KeyboardList({ controller }: { controller: PlayerController }) {
  const current = controller.usePlayerStore((state) => state.currentKeyboard);
  const keyboards = controller.usePlayerStore((state) => state.keyboardList);
  return (
    <div className="ml-3 font-mono text-sm">
      <div className="mb-2">Keyboards ({keyboards.length}):</div>
      {keyboards.map((kb, i) => (
        <div key={kb} className={`${kb === current ? "text-green-400 font-bold" : "text-gray-500"}`}>
          {i + 1}. {kb} {kb === current && "← TURN"}
        </div>
      ))}
    </div>
  );
}

function App() {
  const { myId, setMyId, serverIp, setServerIp, serverIpError, setServerIpError, canConnect } = useServerConfig();

  const [allowLocalKeyboard, setAllowLocalKeyboard] = useLocalStorage("multiplayer-leetcode-allow-local", false);
  const [showKeyboards, setShowKeyboards] = useLocalStorage("multiplayer-leetcode-show-keyboards", false);
  const [ignoreWrongOrder, setIgnoreWrongOrder] = useLocalStorage("multiplayer-leetcode-ignore-wrong-order", false);
  const [debuffTestMode, setDebuffTestMode] = useLocalStorage("multiplayer-leetcode-debuff-test-mode", false);

  const [controller] = useState(() => new PlayerController());

  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    controller.turnTracker.ignoreWrongOrder = ignoreWrongOrder;
  }, [ignoreWrongOrder, controller]);

  useInterval(
    useCallback(() => controller.tick(), [controller]),
    500,
  );

  const activeDebuffs = controller.usePlayerStore((state) => state.activeDebuffNames);
  useLayoutEffect(() => {
    for (const debuff of activeDebuffs) {
      document.documentElement.classList.add(`debuff-${debuff}`);
    }
    return () => {
      for (const debuff of activeDebuffs) {
        document.documentElement.classList.remove(`debuff-${debuff}`);
      }
    };
  }, [activeDebuffs]);

  const gameConnected = controller.usePlayerStore((state) => state.connected);
  const gameHasConnected = controller.usePlayerStore((state) => state.hasBeenConnected);
  const keyboardConnected = controller.usePlayerStore((state) => state.keyboardConnected);

  useEffect(() => {
    controller.server.handleLoginError = setServerIpError;
  }, [controller, setServerIpError]);

  useEffect(() => {
    if (!canConnect) return;
    setServerIpError("");
    controller.server.connect(serverIp, { type: "login", id: myId });
    return () => {
      controller.server.disconnect();
    };
  }, [canConnect, controller, myId, serverIp, setServerIpError]);

  useEffect(() => {
    controller.keyboardServer.connect();
    return () => {
      controller.keyboardServer.disconnect();
    };
  }, [controller]);

  const minimalState = gameHasConnected && canConnect;
  const connState = (
    <div
      className={`absolute ${minimalState ? "top-2 right-2" : "top-6 right-6"} z-101 flex items-center gap-2 text-xs`}
    >
      {gameConnected !== "connected" && generatedId.test(myId) && (
        <div className="p-1 rounded bg-black text-bold">id={myId}</div>
      )}
      <span
        className={`w-4 h-4 rounded-full inline-block text-black text-semibold text-center ${stateColors[gameConnected]} cursor-pointer`}
        onDoubleClick={(evt) => {
          if (evt.shiftKey) {
            setMyId("");
            setServerIp("");
          } else {
            setServerIpError("Disconnected by user");
          }
          controller.server.disconnect();
        }}
      >
        {minimalState && "G"}
      </span>
      {!minimalState && <span>Game server</span>}
      <span
        className={`w-4 h-4 rounded-full inline-block text-black text-semibold text-center ${stateColors[keyboardConnected]}`}
      >
        {minimalState && "K"}
      </span>
      {!minimalState && <span>Keyboard server</span>}
    </div>
  );

  const localKeyboard = allowLocalKeyboard && <LocalKeyboard controller={controller} />;

  if (!canConnect) {
    return (
      <>
        {connState}
        {localKeyboard}
        <Login
          onConnect={(myId, serverIp) => {
            setMyId(myId);
            setServerIp(serverIp);
            setServerIpError("");
          }}
          error={serverIpError}
        >
          <div>
            <label>
              <input
                type="checkbox"
                checked={allowLocalKeyboard}
                onChange={(e) => setAllowLocalKeyboard(e.target.checked)}
                className="mr-2"
              />
              Enable local keyboard input (for running without evdev-ws)
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={showKeyboards}
                onChange={(e) => setShowKeyboards(e.target.checked)}
                className="mr-2"
              />
              Show detected keyboards
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={ignoreWrongOrder}
                onChange={(e) => setIgnoreWrongOrder(e.target.checked)}
                className="mr-2"
              />
              Ignore turn order
            </label>
          </div>
          <div>
            <label>
              <input
                type="checkbox"
                checked={debuffTestMode}
                onChange={(e) => setDebuffTestMode(e.target.checked)}
                className="mr-2"
              />
              Debuff test mode
            </label>
          </div>
        </Login>
        {showKeyboards && <KeyboardList controller={controller} />}
        <div className="m-4 border rounded p-4">
          <h2 className="mb-2 font-bold text-lg">You can test the editor here:</h2>
          <RenderedEditor controller={controller} />
        </div>
      </>
    );
  }

  if (!gameHasConnected) {
    return (
      <>
        {connState}
        {localKeyboard}
        <div className="m-4 border rounded p-4">Connecting to game server&hellip;</div>
        {import.meta.env.PROD && serverIpError && (
          <div className="m-4 border rounded p-4 text-red-500">
            Latest error connecting to server: "{serverIpError}"
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {connState}
      {localKeyboard}
      <Game controller={controller} outputRef={outputRef}>
        {showKeyboards && <KeyboardList controller={controller} />}
        {debuffTestMode && (
          <DebuffSelector
            server={controller.server}
            myId={myId}
            onClearAll={() => controller.handleMessage({ type: "debuffs", debuffs: [] })}
          />
        )}
      </Game>
    </>
  );
}

export default App;
