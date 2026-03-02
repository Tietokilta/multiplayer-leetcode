from enum import IntEnum
from io import FileIO
from os import PathLike

__version__: str
__all__: list[str]

class Event:
    wd: int
    mask: int
    cookie: int
    name: str
    def __new__(cls, wd: int, mask: int, cookie: int, name: str) -> "Event": ...
    def __getitem__(self, index: int) -> object: ...

class INotify(FileIO):
    fd: int
    def __init__(
        self,
        inheritable: bool = False,
        nonblocking: bool = False,
        closefd: bool = True,
    ) -> None: ...
    def add_watch(self, path: str | bytes | PathLike[str], mask: int) -> int: ...
    def rm_watch(self, wd: int) -> None: ...
    def read(
        self,
        timeout: int | None = None,
        read_delay: int | None = None,
    ) -> list[Event]: ...

def parse_events(data: bytes) -> list[Event]: ...

class flags(IntEnum):
    ACCESS = 0x00000001
    MODIFY = 0x00000002
    ATTRIB = 0x00000004
    CLOSE_WRITE = 0x00000008
    CLOSE_NOWRITE = 0x00000010
    OPEN = 0x00000020
    MOVED_FROM = 0x00000040
    MOVED_TO = 0x00000080
    CREATE = 0x00000100
    DELETE = 0x00000200
    DELETE_SELF = 0x00000400
    MOVE_SELF = 0x00000800
    UNMOUNT = 0x00002000
    Q_OVERFLOW = 0x00004000
    IGNORED = 0x00008000
    ONLYDIR = 0x01000000
    DONT_FOLLOW = 0x02000000
    EXCL_UNLINK = 0x04000000
    MASK_ADD = 0x20000000
    ISDIR = 0x40000000
    ONESHOT = 0x80000000
    @classmethod
    def from_mask(cls, mask: int) -> list["flags"]: ...

class masks(IntEnum):
    CLOSE = flags.CLOSE_WRITE | flags.CLOSE_NOWRITE
    MOVE = flags.MOVED_FROM | flags.MOVED_TO
    ALL_EVENTS = (
        flags.ACCESS
        | flags.MODIFY
        | flags.ATTRIB
        | flags.CLOSE_WRITE
        | flags.CLOSE_NOWRITE
        | flags.OPEN
        | flags.MOVED_FROM
        | flags.MOVED_TO
        | flags.CREATE
        | flags.DELETE
        | flags.DELETE_SELF
        | flags.MOVE_SELF
    )
