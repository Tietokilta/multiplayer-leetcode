import asyncio
import json
import queue
import select
import signal
import threading
import time
import traceback
import typing

import evdev
import pyudev
import websockets.asyncio.server


def is_keyboard(device: pyudev.Device) -> bool:
    return (
        "ID_INPUT_KEYBOARD" in device.properties
        and "DEVNAME" in device.properties
        and device.properties["DEVNAME"].startswith("/dev/input/")
    )


def udev_handler(addqueue: queue.Queue, done: asyncio.Event):
    context = pyudev.Context()

    # initially scan existing input devices
    for device in context.list_devices(subsystem="input"):
        if is_keyboard(device):
            addqueue.put((device.properties["ID_PATH"], device.properties["DEVNAME"]))

    # poll for new input devices
    monitor = pyudev.Monitor.from_netlink(context)
    monitor.filter_by(subsystem="input")

    while not done.is_set():
        device = monitor.poll(0.2)

        if device != None and device.action == "add" and is_keyboard(device):
            addqueue.put((device.properties["ID_PATH"], device.properties["DEVNAME"]))


def kbd_handler(
    addqueue: queue.Queue,
    port_to_dev: dict[str, evdev.InputDevice],
    enqueue: typing.Callable[[tuple[str, str]], None],
    done: asyncio.Event,
):
    fd_to_dev = dict[int, evdev.InputDevice]()
    fd_to_port = dict[int, str]()
    current_paths = set()
    while not done.is_set():
        try:
            while device := addqueue.get_nowait():
                path_id, device = device
                if device in current_paths:
                    continue

                # parse port path from ID_PATH
                if "usb-" in path_id:
                    port = path_id.split("usb-", 1)[1].rsplit(":", 1)[0]
                else:
                    port = "not_usb"

                assert port not in port_to_dev

                dev = evdev.InputDevice(device)
                caps = dev.capabilities()
                if (
                    evdev.ecodes.EV_KEY in caps
                    and evdev.ecodes.KEY_A in caps[evdev.ecodes.EV_KEY]
                ):
                    print(f"Keyboard found: {dev.path} - {port} - {dev.name}")
                    fd_to_dev[dev.fd] = dev
                    fd_to_port[dev.fd] = port
                    port_to_dev[port] = dev
                    current_paths.add(dev.path)
        except queue.Empty:
            pass

        if not fd_to_dev:
            time.sleep(0.2)
            continue

        r, w, x = select.select(fd_to_dev, [], fd_to_dev, 0.2)
        for fd in r:
            keyboard = fd_to_dev[fd]
            port = fd_to_port[fd]
            try:
                while event := keyboard.read_one():
                    event = evdev.categorize(event)
                    match event:
                        case evdev.KeyEvent() as key_event:
                            if key_event.keystate == evdev.KeyEvent.key_down:
                                print(f"Key pressed: {key_event.keycode} on {port}")
                                enqueue(
                                    (
                                        port,
                                        (
                                            ",".join(key_event.keycode)
                                            if isinstance(key_event.keycode, tuple)
                                            else key_event.keycode
                                        ),
                                    )
                                )
            except OSError as e:
                if e.errno == 19:  # No such device
                    print(f"Keyboard disconnected: {keyboard.path}")
                    port_to_dev.pop(fd_to_port[fd])
                    fd_to_port.pop(fd)
                    fd_to_dev.pop(fd).close()
                    current_paths.remove(keyboard.path)


async def ws_handler(
    websocket: websockets.asyncio.server.ServerConnection,
    clients: list[asyncio.Queue],
    port_to_device: dict[str, evdev.InputDevice],
):
    print(f"WebSocket connected from {websocket.remote_address}")

    kbdqueue = asyncio.Queue()
    clients.append(kbdqueue)

    async def receive():
        try:
            async for msg in websocket:
                print(msg)
                try:
                    msg = json.loads(msg)
                    assert isinstance(msg, list) and len(msg) == 4
                    port = msg[0]
                    device = port_to_device.get(port)
                except Exception:
                    traceback.print_exc()
                    await websocket.send(json.dumps({"error": "failed to parse"}), True)
                else:
                    try:
                        if device:
                            for led, state in enumerate(msg[1:]):
                                device.set_led(led, state)
                        else:
                            await websocket.send(
                                json.dumps({"error": "no such device"}), True
                            )
                    except Exception:
                        traceback.print_exc()
                        await websocket.send(
                            json.dumps({"error": "failed to set"}), True
                        )
        except Exception:
            traceback.print_exc()
        else:
            print(f"WebSocket disconnected from {websocket.remote_address}")
        finally:
            clients.remove(kbdqueue)
            kbdqueue.put_nowait(None)

    asyncio.create_task(receive())

    while event := await kbdqueue.get():
        await websocket.send(json.dumps(list(event)), True)


async def main():
    loop = asyncio.get_event_loop()
    done = asyncio.Event()

    def on_shutdown():
        done.set()

    loop.add_signal_handler(signal.SIGINT, on_shutdown)

    broadcast = list[asyncio.Queue]()
    port_to_device = dict[str, evdev.InputDevice]()
    udevqueue = queue.Queue()

    def enqueue(msg: tuple[str, str]):
        def do():
            for client in broadcast:
                client.put_nowait(msg)

        loop.call_soon_threadsafe(do)

    server = websockets.asyncio.server.serve(
        lambda ws: ws_handler(ws, broadcast, port_to_device),
        host="127.0.0.1",
        port=6969,
    )

    kbd_thread = threading.Thread(
        target=kbd_handler, args=(udevqueue, port_to_device, enqueue, done)
    )
    kbd_thread.start()

    udev_thread = threading.Thread(target=udev_handler, args=(udevqueue, done))
    udev_thread.start()

    async with server:
        await done.wait()


if __name__ == "__main__":
    asyncio.run(main())
