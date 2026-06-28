"""Log streaming router.

Provides real-time log streaming from the MCP server subprocess via
Server-Sent Events (SSE) and an in-memory searchable log buffer.

The process manager drains subprocess stdout into the Python logger;
this module maintains a parallel ring buffer that captures those lines
for search and SSE streaming.

Endpoints:
    GET /api/logs/stream   - SSE endpoint streaming MCP server logs
    GET /api/logs/search   - Search the in-memory log buffer
"""

from __future__ import annotations

import asyncio
import collections
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from mcp_admin_core.process import get_process_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/logs", tags=["logs"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

LOG_BUFFER_SIZE = 5000  # max lines kept in memory
STREAM_TAIL_LINES = 100  # initial lines to send on SSE connect
POLL_INTERVAL = 0.5  # seconds between buffer polls for SSE
HEARTBEAT_INTERVAL = 15  # seconds between SSE heartbeat comments


# ---------------------------------------------------------------------------
# In-memory log buffer (ring buffer)
# ---------------------------------------------------------------------------

_log_buffer: collections.deque[dict] = collections.deque(maxlen=LOG_BUFFER_SIZE)
_buffer_lock = asyncio.Lock()
_buffer_seq = 0  # monotonic sequence counter for change detection


_LEVEL_RE = re.compile(r"\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\b", re.IGNORECASE)


def _extract_level(line: str) -> str:
    """Try to extract a log level from a log line, default to 'info'."""
    m = _LEVEL_RE.search(line)
    if m:
        level = m.group(1).upper()
        if level == "CRITICAL":
            return "error"
        if level == "WARN":
            return "warning"
        return level.lower()
    return "info"


async def append_log_line(line: str, source: str = "mcp-server") -> None:
    """Append a log line to the in-memory buffer.

    Called by the log handler hook installed in ``main.py`` or by the
    process manager log drainer.
    """
    global _buffer_seq  # noqa: PLW0603
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": _extract_level(line),
        "source": source,
        "message": line.rstrip(),
    }
    async with _buffer_lock:
        _log_buffer.append(entry)
        _buffer_seq += 1


# ---------------------------------------------------------------------------
# Logging handler that feeds the ring buffer
# ---------------------------------------------------------------------------


class _BufferLogHandler(logging.Handler):
    """A logging handler that pushes ``[mcp-server]`` lines into the ring buffer."""

    _MCP_PREFIX = "[mcp-server] "

    def emit(self, record: logging.LogRecord) -> None:
        msg = self.format(record)
        # Accept any log line -- not just those with the MCP prefix
        if self._MCP_PREFIX in msg:
            # Strip the prefix for storage
            line = msg.split(self._MCP_PREFIX, 1)[-1]
        else:
            line = msg
        # Schedule append in the running event loop
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(append_log_line(line, source="mcp-server"))
        except RuntimeError:
            pass  # no event loop -- skip


def install_log_capture() -> None:
    """Install the buffer handler on the process logger so subprocess
    output captured by :class:`McpProcessManager` is also buffered.

    The process logger's level is explicitly set to DEBUG so that
    INFO-level ``[mcp-server]`` messages are not silently dropped
    when the root logger's effective level is WARNING (the default).
    """
    proc_logger = logging.getLogger("mcp_admin_core.process")
    # Ensure the logger accepts INFO messages even if root is WARNING
    if proc_logger.level == logging.NOTSET or proc_logger.level > logging.DEBUG:
        proc_logger.setLevel(logging.DEBUG)
    handler = _BufferLogHandler()
    handler.setLevel(logging.INFO)
    proc_logger.addHandler(handler)


# Auto-install when the module is imported
install_log_capture()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class LogEntry(BaseModel):
    """A single log entry.

    Accepts both ``source`` and the legacy ``pod`` field name for
    backward compatibility with entries already in the ring buffer.
    """

    timestamp: str
    level: str = "info"
    source: str = ""
    message: str

    def __init__(self, **data: Any) -> None:
        # Migrate legacy "pod" field to "source"
        if "pod" in data and "source" not in data:
            data["source"] = data.pop("pod")
        elif "pod" in data:
            data.pop("pod")
        super().__init__(**data)


class LogSearchResponse(BaseModel):
    """Response from log search."""

    query: str
    total_buffered: int
    matched: int
    entries: list[LogEntry]


# ---------------------------------------------------------------------------
# SSE streaming
# ---------------------------------------------------------------------------


async def _sse_log_generator(
    tail_lines: int = STREAM_TAIL_LINES,
) -> AsyncGenerator[str, None]:
    """Generate SSE events from the in-memory log buffer.

    First sends a ``connected`` event so the client knows the stream is
    alive, then replays the most recent *tail_lines* from the buffer,
    and finally polls for new entries yielding them as they appear.

    Periodic SSE comment heartbeats (``:``) are sent to prevent proxies
    and load-balancers from killing idle connections.
    """
    global _buffer_seq  # noqa: PLW0603

    # 0. Send a named "connected" event so the frontend can confirm the stream is alive.
    #    This is NOT a default "message" event -- the client must listen for event: connected.
    yield f"event: connected\ndata: {json.dumps({'status': 'connected'})}\n\n"

    # 1. Send tail of existing buffer
    async with _buffer_lock:
        snapshot = list(_log_buffer)
        last_seq = _buffer_seq

    for entry in snapshot[-tail_lines:]:
        log_entry = LogEntry(**entry)
        yield f"data: {json.dumps(log_entry.model_dump())}\n\n"

    # 2. Poll for new lines, with periodic heartbeat comments
    polls_since_heartbeat = 0
    heartbeat_every_n_polls = max(1, int(HEARTBEAT_INTERVAL / POLL_INTERVAL))

    try:
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            polls_since_heartbeat += 1

            async with _buffer_lock:
                current_seq = _buffer_seq
                if current_seq != last_seq:
                    # Calculate how many new entries appeared
                    new_count = current_seq - last_seq
                    new_entries = (
                        list(_log_buffer)[-new_count:]
                        if new_count <= len(_log_buffer)
                        else list(_log_buffer)
                    )
                    last_seq = current_seq
                else:
                    new_entries = []

            for entry in new_entries:
                log_entry = LogEntry(**entry)
                yield f"data: {json.dumps(log_entry.model_dump())}\n\n"
                polls_since_heartbeat = 0  # reset after real data

            # Send heartbeat comment to keep connection alive
            if polls_since_heartbeat >= heartbeat_every_n_polls:
                yield ": heartbeat\n\n"
                polls_since_heartbeat = 0

    except asyncio.CancelledError:
        logger.info("SSE log stream cancelled by client")
        return
    except Exception as exc:
        error_msg = json.dumps({"error": str(exc)})
        yield f"data: {error_msg}\n\n"
        logger.error("Log stream error: %s", exc)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/stream")
async def stream_logs(
    tail: int = Query(default=STREAM_TAIL_LINES, ge=1, le=1000, description="Number of initial tail lines"),
) -> StreamingResponse:
    """Stream MCP server logs via Server-Sent Events.

    Connect with an EventSource client:
        const es = new EventSource('/api/logs/stream?tail=100');
        es.onmessage = (e) => console.log(JSON.parse(e.data));
    """
    return StreamingResponse(
        _sse_log_generator(tail_lines=tail),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/search", response_model=LogSearchResponse)
async def search_logs(
    q: str = Query(..., min_length=1, max_length=200, description="Search query (plain text or regex)"),
    limit: int = Query(default=100, ge=1, le=1000, description="Max results to return"),
    regex: bool = Query(default=False, description="Treat query as regex pattern"),
) -> LogSearchResponse:
    """Search the in-memory log buffer.

    By default performs case-insensitive substring matching.
    Set ``regex=true`` to use the query as a regular expression pattern.
    """
    async with _buffer_lock:
        buffer_snapshot = list(_log_buffer)

    total_buffered = len(buffer_snapshot)

    # Build matcher
    if regex:
        try:
            pattern = re.compile(q, re.IGNORECASE)
        except re.error as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid regex pattern: {exc}",
            ) from exc
        matcher = lambda msg: pattern.search(msg) is not None
    else:
        q_lower = q.lower()
        matcher = lambda msg: q_lower in msg.lower()

    # Filter and limit results
    matched_entries: list[LogEntry] = []
    for entry in reversed(buffer_snapshot):  # most recent first
        if matcher(entry["message"]):
            matched_entries.append(LogEntry(**entry))
            if len(matched_entries) >= limit:
                break

    return LogSearchResponse(
        query=q,
        total_buffered=total_buffered,
        matched=len(matched_entries),
        entries=matched_entries,
    )
