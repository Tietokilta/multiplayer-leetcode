import { useCallback, useEffect, useRef, useState } from "react";
import { useInterval, useLocalStorage } from "usehooks-ts";
import { stateColors } from "../connection";
import { RenderedEditor } from "./Editor";
import Game from "./Game";
import LocalKeyboard from "./LocalKeyboard";
import Login from "./Login";
import { PlayerController } from "./PlayerController";

function KeyboardList({ controller }: { controller: PlayerController }) {
  const current = controller.usePlayerStore((state) => state.currentKeyboard);
  const keyboards = controller.usePlayerStore((state) => state.keyboardList);
  return (
    <div className="m-3 font-mono text-sm">
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
  const [myId, setMyId] = useLocalStorage("multiplayer-leetcode-my-id", "");
  const [serverIp, setServerIp] = useLocalStorage("multiplayer-leetcode-server-ip", "");
  const [serverIpError, setServerIpError] = useLocalStorage("multiplayer-leetcode-server-ip-error", "");
  const canConnect = !!myId && !!serverIp && !serverIpError;

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

  const gameConnected = controller.usePlayerStore((state) => state.connected);
  const gameHasConnected = controller.usePlayerStore((state) => state.hasBeenConnected);
  const keyboardConnected = controller.usePlayerStore((state) => state.keyboardConnected);

  useEffect(() => {
    controller.server.handleLoginError = setServerIpError;
  }, [controller, setServerIpError]);

  useEffect(() => {
    if (!canConnect) return;

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

  const connState = (
    <div className="absolute top-6 right-6 flex items-center">
      <span
        className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[gameConnected]} cursor-pointer`}
        onDoubleClick={() => {
          setMyId("");
          setServerIp("");
          controller.server.disconnect();
        }}
      />
      <span className="mr-2">Game server</span>
      <span className={`w-4 h-4 rounded-full inline-block mr-2 ${stateColors[keyboardConnected]}`} />
      <span className="mr-2">Keyboard server</span>
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
      </>
    );
  }

  return (
    <div className="flex flex-col p-4 gap-4 h-screen">
      {connState}
      {localKeyboard}
      {showKeyboards && <KeyboardList controller={controller} />}
      <Game outputRef={outputRef} controller={controller} />
    </div>
  );
}

export default App;
