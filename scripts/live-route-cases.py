#!/usr/bin/env python3
"""Run one real fresh-session TUI route for each shipped target preset.

Prerequisites: this bundle installed in the selected TUI profile, working
DeepSeek Official credentials, and `zstd` on PATH. The script creates four
short durable sessions, interrupts each after the target's first model step,
and verifies the resulting logs.
"""

from __future__ import annotations

import fcntl
import glob
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import sys
import termios
import time


DSH_HOME = Path(os.environ.get("DSH_HOME", Path.home() / ".dsh")).expanduser().resolve()
DSH = os.environ.get("DSH_BIN") or shutil.which("dsh")
PROFILE = os.environ.get("DSH_TUI_PROFILE", "tui")
SESSION_GLOB = str(DSH_HOME / "sessions" / "**" / "session.jsonl.zstd")

CASES = [
    {
        "preset": "standard",
        "prompt": "请联网查询 DeepSeek 官方网站当前最新的 API 公告标题，只回答标题，不修改文件。",
        "required_tools": {"web_search"},
    },
    {
        "preset": "code",
        "prompt": "请把四个互不依赖的只读目录检查并行完成后给出一行汇总，不要修改文件。",
        "required_tools": {"run_code"},
    },
    {
        "preset": "minimal",
        "prompt": "请实现一个自包含算法：用 O(n log n) 求最长递增子序列并解释正确性；不联网，只回答代码。",
        "required_tools": {"bash", "str_replace_editor"},
    },
    {
        "preset": "cordis",
        "prompt": "请检查 DSH Agent preset 的 Cordis composition，并判断路由插件应属于 host plane 还是 preset plane。",
        "required_tools": {"cordis_inspect_self"},
    },
]


def session_files() -> set[str]:
    return set(glob.glob(SESSION_GLOB, recursive=True))


def read_available(master: int, timeout: float) -> bytes:
    chunks: list[bytes] = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready, _, _ = select.select([master], [], [], min(0.1, deadline - time.monotonic()))
        if not ready:
            continue
        try:
            chunk = os.read(master, 65536)
        except OSError:
            break
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def wait_for(master: int, needle: bytes, timeout: float, initial: bytes = b"") -> bytes:
    output = bytearray(initial)
    deadline = time.monotonic() + timeout
    while needle not in output and time.monotonic() < deadline:
        output.extend(read_available(master, min(0.5, deadline - time.monotonic())))
    if needle not in output:
        tail = bytes(output[-1200:]).decode("utf-8", "replace")
        raise AssertionError(f"TUI did not show {needle!r}; tail:\n{tail}")
    return bytes(output)


def load_events(path: str) -> list[dict]:
    raw = subprocess.check_output(["zstd", "-dc", path], text=True)
    return [json.loads(line) for line in raw.splitlines() if line]


def drain_until_exit(master: int, process: subprocess.Popen, timeout: float) -> bytes:
    output = bytearray()
    deadline = time.monotonic() + timeout
    while process.poll() is None and time.monotonic() < deadline:
        output.extend(read_available(master, min(0.5, deadline - time.monotonic())))
    if process.poll() is None:
        raise subprocess.TimeoutExpired(process.args, timeout)
    output.extend(read_available(master, 0.2))
    return bytes(output)


def run_case(case: dict) -> tuple[str, list[dict]]:
    before = session_files()
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 36, 120, 0, 0))
    process = subprocess.Popen(
        [DSH, "--profile", PROFILE, "--preset", "auto"],
        cwd=Path.cwd(),
        env={**os.environ, "DSH_HOME": str(DSH_HOME)},
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
        start_new_session=True,
    )
    os.close(slave)
    output = b""
    try:
        output = wait_for(master, b"preset: auto", 20)
        os.write(master, case["prompt"].encode("utf-8") + b"\r")
        output = wait_for(master, b"step 1", 45, output)
        os.write(master, b"\x1b")
        output = wait_for(master, f"preset: {case['preset']}".encode(), 30, output)
        os.write(master, b"/exit\r")
        output += drain_until_exit(master, process, 20)
        if process.returncode != 0:
            raise AssertionError(f"TUI exited with status {process.returncode}")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
        os.close(master)

    created = session_files() - before
    if len(created) != 1:
        raise AssertionError(f"expected one new session log, found {sorted(created)}")
    path = created.pop()
    return path, load_events(path)


def verify(case: dict, events: list[dict]) -> None:
    assert events[0]["type"] == "session"
    assert events[0]["agentPreset"] == "auto"

    selected_index = next(
        index
        for index, event in enumerate(events)
        if event["type"] == "agent-preset/selected"
        and event["data"]["agentPreset"] == case["preset"]
    )
    turn_index = next(index for index, event in enumerate(events) if event["type"] == "turn/start")
    request_index = next(index for index, event in enumerate(events) if event["type"] == "request/header")
    assert selected_index < turn_index < request_index

    user_message = next(
        event
        for event in events
        if event["type"] == "user/message" and event["data"]["source"]["kind"] == "user"
    )
    assert user_message["data"]["content"][0]["text"] == case["prompt"]

    tools = {tool["name"] for tool in events[request_index]["data"]["header"].get("tools", [])}
    missing = case["required_tools"] - tools
    assert not missing, f"missing target tools {sorted(missing)}; got {sorted(tools)}"


def main() -> int:
    if DSH is None:
        raise RuntimeError("dsh is not on PATH; set DSH_BIN to its absolute path")
    if shutil.which("zstd") is None:
        raise RuntimeError("zstd is required to inspect durable session logs")

    for case in CASES:
        path, events = run_case(case)
        verify(case, events)
        print(f"  ✓ {case['preset']}: selected before turn/start; target tools on first request")
        print(f"    {path}")
    print("\nALL FOUR LIVE AUTO ROUTE CASES PASSED")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"LIVE ROUTE TEST FAILED: {error}", file=sys.stderr)
        raise
