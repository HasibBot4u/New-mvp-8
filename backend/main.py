# NexusEdu Backend — canonical file. Root main.py is deleted.
import asyncio
import math
import time
import os
import sys
from contextlib import asynccontextmanager
from typing import Optional, Tuple
from collections import OrderedDict

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response, RedirectResponse
from pyrogram import Client

# ─── CONFIG ───────────────────────────────────────────────────
def _require_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        print(f"[NexusEdu] FATAL: {key} environment variable is not set. Backend cannot start.", flush=True)
        # Don't crash — return empty string and handle gracefully
    return val

API_ID_STR  = _require_env("TELEGRAM_API_ID")
API_HASH    = _require_env("TELEGRAM_API_HASH")
SESSION_STRING = _require_env("PYROGRAM_SESSION_STRING")
SESSION_STRING_2 = os.environ.get("PYROGRAM_SESSION_STRING_2", "").strip()
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# Safe integer conversion — prevents int(None) crash
try:
    API_ID = int(API_ID_STR) if API_ID_STR else 0
except ValueError:
    API_ID = 0
    print("[NexusEdu] FATAL: TELEGRAM_API_ID must be an integer", flush=True)

TEST_CHANNEL_ID = -1003569793885
TEST_MESSAGE_ID = 3
CHUNK_SIZE      = 1024 * 1024        # 1 MB per chunk from Telegram
CATALOG_TTL     = 300                # 5 min cache
INITIAL_BUFFER  = 512 * 1024         # 512 KB first response — starts playing fast

# ─── STATE ────────────────────────────────────────────────────
class LRUDict:
    def __init__(self, max_size: int = 300, ttl_seconds: int = 3600):
        self.max_size = max_size
        self.ttl = ttl_seconds
        self._store: OrderedDict = OrderedDict()
    
    def __setitem__(self, key, value):
        if key in self._store:
            del self._store[key]
        elif len(self._store) >= self.max_size:
            self._store.popitem(last=False)  # Remove oldest (O(1))
        self._store[key] = (value, time.time())
    
    def __getitem__(self, key):
        if key not in self._store:
            raise KeyError(key)
        value, ts = self._store[key]
        if time.time() - ts > self.ttl:
            del self._store[key]
            raise KeyError(key)
        self._store.move_to_end(key)  # O(1) LRU update
        return value
    
    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default

    def __contains__(self, key):
        try:
            self[key]
            return True
        except KeyError:
            return False
            
    def __len__(self):
        return len(self._store)

tg: Optional[Client] = None
tg2: Optional[Client] = None   # Second Telegram client for failover
_tg_check_ts: float = 0.0
_tg_check_ok: bool = False
catalog_cache   = {"data": None, "timestamp": 0}
video_map       = {}          # uuid → {channel_id, message_id}
message_cache: LRUDict = LRUDict(max_size=300, ttl_seconds=3600)
resolved_channels = set()

# ─── TELEGRAM HELPERS ─────────────────────────────────────────
async def resolve_channel(channel_id: int | str) -> bool:
    cid = int(str(channel_id))
    if cid in resolved_channels:
        return True
    try:
        await tg.get_chat(cid)
        resolved_channels.add(cid)
        print(f"[NexusEdu] Resolved channel {cid}")
        return True
    except Exception as e:
        print(f"[NexusEdu] Could not resolve {cid}: {e}")
        return False


async def preload_channels():
    try:
        async for dialog in tg.get_dialogs():
            try:
                resolved_channels.add(dialog.chat.id)
            except Exception:
                pass
        print(f"[NexusEdu] {len(resolved_channels)} channels loaded from dialogs.")
    except Exception as e:
        print(f"[NexusEdu] Dialog preload error: {e}")


async def get_message(channel_id: int, message_id: int):
    """Fetch and cache a Telegram message object."""
    key = f"{channel_id}_{message_id}"
    if key not in message_cache:
        client = get_active_client()
        if client is None:
            raise Exception("No Telegram client available")
        msg = await client.get_messages(channel_id, message_id)
        message_cache[key] = msg
    return message_cache.get(key)


async def get_file_info(channel_id: int, message_id: int, video_id: str = None) -> Tuple[int, str]:
    """Get file size and MIME type, with Supabase caching to avoid repeated Telegram API calls."""
    # Check Supabase cache first (avoids hitting Telegram API every play)
    if video_id and SUPABASE_URL and SUPABASE_KEY:
        try:
            async with httpx.AsyncClient(timeout=3.0) as hclient:
                r = await hclient.get(
                    f"{SUPABASE_URL}/rest/v1/videos",
                    params={"id": f"eq.{video_id}", "select": "file_size_bytes,mime_type"},
                    headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
                )
                if r.status_code == 200:
                    data = r.json()
                    if data and data[0].get("file_size_bytes"):
                        return int(data[0]["file_size_bytes"]), data[0].get("mime_type", "video/mp4")
        except Exception:
            pass  # Fall through to Telegram fetch
    # Fetch from Telegram
    msg = await get_message(channel_id, message_id)
    size = 0
    mime = "video/mp4"
    
    media = msg.video or msg.document
    if media:
        size = media.file_size or 0
        if hasattr(media, 'mime_type') and media.mime_type:
            mime = media.mime_type
        else:
            file_name = getattr(media, 'file_name', '') or ''
            file_name_lower = file_name.lower()
            if file_name_lower.endswith('.mkv'):
                mime = 'video/x-matroska'
            elif file_name_lower.endswith('.avi'):
                mime = 'video/x-msvideo'
            elif file_name_lower.endswith('.webm'):
                mime = 'video/webm'
            elif file_name_lower.endswith('.mov'):
                mime = 'video/quicktime'
            
    # Cache to Supabase (fire and forget — don't block streaming)
    if video_id and size > 0 and SUPABASE_URL and SUPABASE_KEY:
        asyncio.create_task(_save_file_metadata(video_id, size, mime))
    return size, mime

async def _save_file_metadata(video_id: str, size: int, mime: str):
    """Save file metadata to Supabase so we never fetch from Telegram again for this video."""
    try:
        import json as _json
        async with httpx.AsyncClient(timeout=5.0) as hclient:
            await hclient.patch(
                f"{SUPABASE_URL}/rest/v1/videos",
                params={"id": f"eq.{video_id}"},
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                },
                content=_json.dumps({
                    "file_size_bytes": size,
                    "mime_type": mime,
                    "telegram_fetched_at": "now()"
                })
            )
    except Exception as e:
        print(f"[NexusEdu] Failed to cache file metadata: {e}", flush=True)


# ─── PRE-WARM (eliminates cold-start delay on first play) ─────
async def _prewarm_all(video_items: list):
    total = len(video_items)
    if total == 0: return
    print(f"[NexusEdu] Pre-warming {total} videos in parallel batches...")
    BATCH_SIZE = 10
    fetched = 0
    for i in range(0, total, BATCH_SIZE):
        batch = video_items[i:i+BATCH_SIZE]
        tasks = []
        for video_id, info in batch:
            cid_str = info.get("channel_id", "")
            message_id = info.get("message_id", 0)
            if not cid_str or not message_id:
                continue
            key = f"{cid_str}_{message_id}"
            if key not in message_cache:
                tasks.append(_prewarm_single(cid_str, message_id, key))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        fetched += sum(1 for r in results if r is True)
        await asyncio.sleep(0.5)  # 0.5s between batches of 10
    print(f"[NexusEdu] Pre-warm done: {fetched}/{total} cached.")

async def _prewarm_single(cid_str: str, message_id: int, cache_key: str) -> bool:
    try:
        cid = int(cid_str)
        await resolve_channel(cid)
        msg = await tg.get_messages(cid, message_id)
        if msg and not msg.empty:
            message_cache[cache_key] = msg
            return True
    except Exception:
        pass
    return False


# ─── SUPABASE FETCH ───────────────────────────────────────────
async def fetch_supabase(path: str, client: httpx.AsyncClient) -> list:
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, timeout=30
    )
    r.raise_for_status()
    return r.json()


async def fetch_all_videos(client: httpx.AsyncClient) -> list:
    """Paginated — handles 1,458+ videos reliably."""
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    all_videos, offset = [], 0
    while True:
        url = (
            f"{SUPABASE_URL}/rest/v1/videos"
            f"?is_active=eq.true&order=display_order"
            f"&select=id,chapter_id,title,telegram_channel_id,telegram_message_id,source_type,drive_file_id,youtube_video_id,size_mb,duration,display_order"
            f"&offset={offset}&limit=1000"
        )
        r = await client.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        all_videos.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return all_videos


# ─── CATALOG BUILD ────────────────────────────────────────────
async def refresh_catalog():
    global catalog_cache, video_map

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[NexusEdu] Supabase not configured — skipping catalog.")
        return

    try:
        async with httpx.AsyncClient() as client:
            subjects_task = fetch_supabase("subjects?is_active=eq.true&order=display_order", client)
            cycles_task   = fetch_supabase("cycles?is_active=eq.true&order=display_order", client)
            chapters_task = fetch_supabase("chapters?is_active=eq.true&order=display_order", client)
            videos_task   = fetch_all_videos(client)

            subjects, cycles, chapters, videos = await asyncio.gather(
                subjects_task, cycles_task, chapters_task, videos_task
            )

        # Build video_map for O(1) stream lookups
        new_map = {}
        for v in videos:
            new_map[v["id"]] = {
                "source_type": v.get("source_type", "telegram"),
                "drive_file_id": v.get("drive_file_id", ""),
                "channel_id": v.get("telegram_channel_id", ""),
                "message_id": v.get("telegram_message_id", 0),
            }
        video_map = new_map

        # Resolve all Telegram channels found in cycles
        for cid in {c.get("telegram_channel_id") for c in cycles
                    if c.get("telegram_channel_id")}:
            await resolve_channel(cid)

        # Assemble nested hierarchy
        result = []
        for subj in subjects:
            s_cycles = sorted(
                [c for c in cycles if c["subject_id"] == subj["id"]],
                key=lambda x: x.get("display_order", 0),
            )
            subj_data = {**subj, "cycles": []}
            for cyc in s_cycles:
                c_chapters = sorted(
                    [ch for ch in chapters if ch["cycle_id"] == cyc["id"]],
                    key=lambda x: x.get("display_order", 0),
                )
                cyc_data = {**cyc, "chapters": []}
                for chap in c_chapters:
                    c_videos = sorted(
                        [v for v in videos if v["chapter_id"] == chap["id"]],
                        key=lambda x: x.get("display_order", 0),
                    )
                    cyc_data["chapters"].append({
                        **chap,
                        "videos": [
                            {
                                "id":       v["id"],
                                "title":    v["title"],
                                "duration": v.get("duration", "00:00:00"),
                                "size_mb":  v.get("size_mb", 0),
                            }
                            for v in c_videos
                        ],
                    })
                subj_data["cycles"].append(cyc_data)
            result.append(subj_data)

        catalog_cache = {
            "data":      {"subjects": result, "total_videos": len(videos)},
            "timestamp": time.time(),
        }
        print(f"[NexusEdu] Catalog loaded: {len(videos)} video(s).")

        # Pre-warm all messages in background — eliminates first-play delay
        asyncio.create_task(_prewarm_all(list(video_map.items())))

    except Exception as e:
        print(f"[NexusEdu] Catalog load error: {e}")


# ─── LIFESPAN ─────────────────────────────────────────────────
async def ensure_telegram_connected() -> bool:
    global tg, tg2, _tg_check_ts, _tg_check_ok
    now = time.time()
    # Use cached result if checked recently and it was good
    if _tg_check_ok and (now - _tg_check_ts) < 20:
        return True
    
    # Check primary client
    if tg is not None:
        try:
            if tg.is_connected:
                _tg_check_ok = True
                _tg_check_ts = now
                return True
        except Exception:
            pass
            
    # Check secondary client
    if tg2 is not None:
        try:
            if tg2.is_connected:
                print("[NexusEdu] Primary down, secondary client is connected.", flush=True)
                _tg_check_ok = True
                _tg_check_ts = now
                return True
        except Exception:
            pass
            
    # Need to reconnect primary
    print("[NexusEdu] Telegram disconnected — reconnecting...", flush=True)
    try:
        if tg is not None:
            try:
                await asyncio.wait_for(tg.stop(), timeout=5)
            except Exception:
                pass
        if API_ID and API_HASH and SESSION_STRING:
            tg = Client("nexusedu_session", api_id=API_ID, api_hash=API_HASH,
                        session_string=SESSION_STRING, in_memory=True)
            await asyncio.wait_for(tg.start(), timeout=30)
            print("[NexusEdu] Primary Telegram reconnected.", flush=True)
            asyncio.create_task(preload_channels())
            _tg_check_ok = True
            _tg_check_ts = now
            return True
    except Exception as e:
        print(f"[NexusEdu] Primary reconnect failed: {e}", flush=True)
    # Try secondary as fallback
    if SESSION_STRING_2:
        try:
            if tg2 is not None:
                try:
                    await asyncio.wait_for(tg2.stop(), timeout=5)
                except Exception:
                    pass
            tg2 = Client("nexusedu_session2", api_id=API_ID, api_hash=API_HASH,
                          session_string=SESSION_STRING_2, in_memory=True)
            await asyncio.wait_for(tg2.start(), timeout=30)
            print("[NexusEdu] Secondary Telegram connected as fallback.", flush=True)
            _tg_check_ok = True
            _tg_check_ts = now
            return True
        except Exception as e2:
            print(f"[NexusEdu] Secondary reconnect also failed: {e2}", flush=True)
    _tg_check_ok = False
    return False

async def telegram_watchdog():
    """Monitor Telegram connection with exponential backoff."""
    fail_count = 0
    while True:
        try:
            await ensure_telegram_connected()
            fail_count = 0
            await asyncio.sleep(60)
        except Exception as e:
            fail_count += 1
            wait = min(60 * (2 ** (fail_count - 1)), 900)
            print(f"[watchdog] fail #{fail_count}, retry in {wait}s: {e}")
            await asyncio.sleep(wait)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global tg, tg2
    api_id   = API_ID
    api_hash = API_HASH
    session  = SESSION_STRING

    if not session or not api_id or not api_hash:
        print("[NexusEdu] WARNING: Telegram credentials not set. Starting without Telegram.", flush=True)
    else:
        print("[NexusEdu] Starting Telegram client...", flush=True)
        try:
            tg = Client(
                "nexusedu_session",
                api_id=api_id,
                api_hash=api_hash,
                session_string=session,
                in_memory=True,
            )
            await tg.start()
            print("[NexusEdu] Telegram client started successfully.", flush=True)
            await preload_channels()
            await resolve_channel(TEST_CHANNEL_ID)
        except Exception as e:
            print(f"[NexusEdu] TELEGRAM STARTUP FAILED: {e}", flush=True)
            print("[NexusEdu] Backend starting WITHOUT Telegram. Videos will not stream.", flush=True)
            tg = None  # Reset to None so health endpoint shows disconnected cleanly

    # Start secondary client if available
    if SESSION_STRING_2 and API_ID and API_HASH:
        try:
            tg2 = Client("nexusedu_session2", api_id=API_ID, api_hash=API_HASH,
                          session_string=SESSION_STRING_2, in_memory=True)
            await asyncio.wait_for(tg2.start(), timeout=30)
            print("[NexusEdu] Secondary Telegram client started.", flush=True)
        except Exception as e:
            print(f"[NexusEdu] Secondary client failed to start: {e}", flush=True)
            tg2 = None

    await refresh_catalog()
    asyncio.create_task(telegram_watchdog())
    yield  # FastAPI serves requests here

    if tg is not None:
        try:
            await tg.stop()
        except Exception:
            pass

    if tg2 is not None:
        try:
            await tg2.stop()
        except Exception:
            pass


# ─── APP ──────────────────────────────────────────────────────
app = FastAPI(title="NexusEdu Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://nexus-educations.netlify.app",
        "https://educations.netlify.app"
    ],
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Range", "Accept-Ranges", "Content-Length", "Content-Type"
    ],
)


# ─── STREAMING CORE ───────────────────────────────────────────
def get_active_client() -> Optional[Client]:
    """Return the first connected Telegram client available."""
    if tg is not None:
        try:
            if tg.is_connected: return tg
        except Exception: pass
    if tg2 is not None:
        try:
            if tg2.is_connected: return tg2
        except Exception: pass
    return tg  # Return primary even if disconnected (will trigger reconnect)

async def _stream_telegram(
    channel_id: int, message_id: int,
    start: int, end: int, total: int
):
    """
    Async generator — pulls 1MB chunks from Telegram and yields bytes.
    Byte-accurate: handles non-aligned range starts via skip_bytes.
    """
    chunk_offset = start // CHUNK_SIZE
    skip_bytes   = start % CHUNK_SIZE
    needed       = math.ceil((end - start + 1 + skip_bytes) / CHUNK_SIZE)

    msg = await get_message(channel_id, message_id)

    bytes_sent  = 0
    target      = end - start + 1
    first_chunk = True

    client = get_active_client()
    if client is None:
        raise Exception("No Telegram client available")
    
    try:
        async for chunk in client.stream_media(msg, offset=chunk_offset, limit=needed):
            data = bytes(chunk)
            if first_chunk and skip_bytes:
                data        = data[skip_bytes:]
                first_chunk = False
            remaining = target - bytes_sent
            if len(data) > remaining:
                data = data[:remaining]
            if not data:
                break
            bytes_sent += len(data)
            yield data
            if bytes_sent >= target:
                break
    except Exception as e:
        if "flood" in str(e).lower() or "FloodWait" in type(e).__name__:
            print(f"[NexusEdu] Telegram FloodWait on stream: {e}", flush=True)
        else:
            print(f"[NexusEdu] Stream error: {e}", flush=True)


def _parse_range(range_header: str, total: int) -> Tuple[int, int]:
    """Parse 'bytes=X-Y' or 'bytes=X-' into (start, end)."""
    try:
        val   = range_header.replace("bytes=", "").strip()
        parts = val.split("-")
        start = int(parts[0]) if parts[0].strip() else 0
        end   = int(parts[1]) if len(parts) > 1 and parts[1].strip() else total - 1
        start = max(0, min(start, total - 1))
        end   = max(start, min(end, total - 1))
        return start, end
    except (ValueError, IndexError):
        return 0, total - 1


# ─── ENDPOINTS ────────────────────────────────────────────────

@app.api_route("/", methods=["GET", "HEAD"])
async def root():
    return {"service": "NexusEdu Backend", "status": "running"}


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health():
    is_conn = False
    try:
        if tg is not None:
            is_conn = bool(tg.is_connected)
    except Exception:
        pass
    
    tg_status = "connected" if is_conn else ("reconnecting" if tg is not None else "disconnected")
    overall = "ok" if is_conn else "degraded"
    
    catalog_age = round((time.time() - catalog_cache.get("timestamp", 0)) / 60, 1) if catalog_cache.get("timestamp") else 0.0
    
    tg2_status = "not_configured"
    if SESSION_STRING_2:
        try:
            tg2_status = "connected" if (tg2 is not None and tg2.is_connected) else "disconnected"
        except Exception:
            tg2_status = "disconnected"
    
    return JSONResponse({
        "status": overall,
        "telegram": tg_status,
        "telegram_secondary": tg2_status,
        "videos_cached": len(video_map),
        "messages_cached": len(message_cache),
        "catalog_age_minutes": catalog_age,
        "session_set": bool(SESSION_STRING),
        "session2_set": bool(SESSION_STRING_2),
    }, headers={"Access-Control-Allow-Origin": "*"})


@app.get("/api/debug")
async def debug(request: Request):
    admin_token = os.environ.get("ADMIN_TOKEN", "")
    if not admin_token:
        raise HTTPException(status_code=403, detail="Debug endpoint disabled. Set ADMIN_TOKEN env var.")
    if request.headers.get("X-Admin-Token") != admin_token:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    info = {
        "telegram_connected":     False,
        "test_channel_resolved":  int(str(TEST_CHANNEL_ID)) in resolved_channels,
        "test_message_found":     False,
        "test_message_has_media": False,
        "resolved_channels":      [str(c) for c in resolved_channels],
        "channels_count":         len(resolved_channels),
        "videos_cached":          len(video_map),
        "messages_cached":        len(message_cache),
        "catalog_age_seconds":    (
            round(time.time() - catalog_cache["timestamp"])
            if catalog_cache["timestamp"] else None
        ),
        "catalog_loaded":         catalog_cache["data"] is not None,
        "errors":                 [],
    }
    try:
        info["telegram_connected"] = tg.is_connected
    except Exception as e:
        info["errors"].append(f"telegram check: {e}")
    try:
        await resolve_channel(TEST_CHANNEL_ID)
        info["test_channel_resolved"] = True
        msg = await get_message(TEST_CHANNEL_ID, TEST_MESSAGE_ID)
        if msg and not msg.empty:
            info["test_message_found"] = True
            media = msg.video or msg.document
            if media:
                info["test_message_has_media"] = True
                info["media_type"]   = "video" if msg.video else "document"
                info["file_size_mb"] = round(media.file_size / 1024 / 1024, 1)
    except Exception as e:
        info["errors"].append(f"message check: {e}")
    try:
        me = await tg.get_me()
        info["logged_in_as"] = f"{me.first_name} (ID: {me.id})"
    except Exception as e:
        info["errors"].append(f"get_me: {e}")
    return JSONResponse(info)


@app.get("/api/catalog")
async def catalog():
    now = time.time()
    if (catalog_cache["data"] is None
            or now - catalog_cache["timestamp"] > CATALOG_TTL):
        await refresh_catalog()
    return catalog_cache["data"] or {"subjects": [], "total_videos": 0}


_last_refresh_time = 0.0

@app.get("/api/refresh")
async def force_refresh():
    global _last_refresh_time
    now = time.time()
    if now - _last_refresh_time < 60:
        return {"status": "throttled", "retry_after": round(60 - (now - _last_refresh_time))}
    _last_refresh_time = now
    await refresh_catalog()
    return {"status": "refreshed", "videos": len(video_map)}


@app.get("/api/warmup")
async def warmup():
    """
    Called by frontend on app startup.
    Triggers immediate pre-warming of all video messages in background.
    """
    if video_map:
        asyncio.create_task(_prewarm_all(list(video_map.items())))
        return {"status": "warming", "videos": len(video_map)}
    await refresh_catalog()
    return {"status": "catalog_refreshed_and_warming", "videos": len(video_map)}


@app.get("/api/prefetch/{video_id}")
async def prefetch_video(video_id: str):
    """
    Warms the message cache for a single video without streaming bytes.
    Frontend calls this for every video when a chapter list loads,
    so by the time user taps play the message is already cached.
    """
    if video_id not in video_map:
        await refresh_catalog()
    if video_id not in video_map:
        return {"status": "not_found", "cached": False}

    info       = video_map[video_id]
    cid_str    = info.get("channel_id", "")
    message_id = info.get("message_id", 0)

    if not cid_str or not message_id:
        return {"status": "not_linked", "cached": False}

    key = f"{cid_str}_{message_id}"
    if key in message_cache:
        return {"status": "already_cached", "cached": True}

    try:
        cid = int(cid_str)
        await resolve_channel(cid)
        msg = await tg.get_messages(cid, message_id)
        if msg and not msg.empty:
            message_cache[key] = msg
            media = msg.video or msg.document
            size_mb = round(media.file_size / 1024 / 1024, 1) if media else 0
            return {"status": "cached", "cached": True, "size_mb": size_mb}
        return {"status": "message_empty", "cached": False}
    except Exception as e:
        return {"status": "error", "cached": False, "error": str(e)}


# Pyrogram streams media in exact 1MB chunks internally.
# Using any other math will cause byte misalignment and browser decoding errors (like MKV/AVI format errors).
PYROGRAM_CHUNK_SIZE = 1048576

async def stream_telegram_chunks(client, message, start_byte: int, end_byte: int):
    """
    RAM-efficient chunked streamer using Pyrogram MTProto.
    Downloads and yields chunks without loading entire file into memory.
    """
    try:
        # Get file attributes
        media = message.video or message.document
        if not media:
            raise HTTPException(404, "No media found in message")
        
        file_size = media.file_size
        total_bytes = end_byte - start_byte + 1
        
        # Pyrogram uses 1MB chunks. We must calculate the offset using exactly 1MB.
        chunk_offset = start_byte // PYROGRAM_CHUNK_SIZE
        current_offset = chunk_offset * PYROGRAM_CHUNK_SIZE
        bytes_sent = 0
        
        # Calculate exactly how many chunks we need to avoid massive over-streaming
        import math
        needed_bytes = end_byte - current_offset + 1
        limit = math.ceil(needed_bytes / PYROGRAM_CHUNK_SIZE)
        
        # Use Pyrogram's internal chunked download with offset
        async for chunk in client.stream_media(message, limit=limit, offset=chunk_offset):
            chunk_len = len(chunk)
            
            # Calculate overlap with requested range
            chunk_start = current_offset
            chunk_end = current_offset + chunk_len - 1
            
            # If chunk overlaps with requested range
            if chunk_end >= start_byte and chunk_start <= end_byte:
                overlap_start = max(0, start_byte - chunk_start)
                overlap_end = min(chunk_len, end_byte - chunk_start + 1)
                
                yield chunk[overlap_start:overlap_end]
                bytes_sent += (overlap_end - overlap_start)
                
                if bytes_sent >= total_bytes:
                    break
            
            current_offset += chunk_len
            
    except Exception as e:
        print(f"[NexusEdu] Stream error: {e}")
        raise HTTPException(status_code=500, detail=f"Stream failed: {str(e)}")

@app.api_route("/api/stream/{video_id}", methods=["GET", "HEAD"])
async def stream_video(video_id: str, request: Request, c: str = None, m: str = None, source: str = None):
    """
    Stream video from Telegram using MTProto (bypasses 20MB limit)
    """
    try:
        # 1. Fetch video metadata from query params or map
        if c and m:
            channel_id_str = c
            message_id_str = m
            source_type = source or "telegram"
        else:
            if video_id not in video_map:
                await refresh_catalog()
            if video_id not in video_map:
                raise HTTPException(status_code=404, detail="Video not found in active catalog. Provide c and m parameters.")
            
            video = video_map[video_id]
            source_type = video.get("source_type", "telegram")
            channel_id_str = video.get("channel_id", "")
            message_id_str = video.get("message_id", 0)
            
            if source_type == "drive":
                drive_file_id = video.get("drive_file_id")
                if not drive_file_id:
                    raise HTTPException(status_code=400, detail="Drive file ID missing")
                worker_url = os.environ.get("VITE_CLOUDFLARE_WORKER_URL", "https://nexusedu-proxy.mdhosainp414.workers.dev")
                return RedirectResponse(url=f"{worker_url}/drive/{drive_file_id}", status_code=302)

        if source_type == "youtube":
            raise HTTPException(status_code=400, detail="YouTube videos stream directly on client")

        # 2. Get active Telegram client
        connected = await ensure_telegram_connected()
        if not connected:
            raise HTTPException(status_code=503, detail="Telegram client is not connected.")

        if not channel_id_str or not message_id_str:
            raise HTTPException(status_code=400, detail="Video not linked to Telegram")

        channel_id = int(channel_id_str)
        message_id = int(message_id_str)
        
        await resolve_channel(channel_id)
        
        tg_client = get_active_client()
        if not tg_client:
            raise HTTPException(status_code=503, detail="No active Pyrogram client found")

        message = await get_message(channel_id, message_id)
        if not message:
            raise HTTPException(status_code=404, detail="Telegram message not found")

        media = message.video or message.document
        if not media:
            raise HTTPException(status_code=404, detail="Message has no media")

        file_size = media.file_size
        
        # Detect actual MIME type from file content or extension
        if media and hasattr(media, 'mime_type') and media.mime_type:
            mime_type = media.mime_type
        else:
            # Fallback based on file name extension
            file_name = getattr(media, 'file_name', '') or ''
            file_name_lower = file_name.lower()
            if file_name_lower.endswith('.mkv'):
                mime_type = 'video/x-matroska'
            elif file_name_lower.endswith('.avi'):
                mime_type = 'video/x-msvideo'
            elif file_name_lower.endswith('.webm'):
                mime_type = 'video/webm'
            elif file_name_lower.endswith('.mov'):
                mime_type = 'video/quicktime'
            else:
                mime_type = 'video/mp4'  # Safe fallback

        if request.method == "HEAD":
            return Response(
                status_code=200,
                media_type=mime_type,
                headers={
                    "Content-Length": str(file_size),
                    "Accept-Ranges": "bytes",
                    "Content-Type": mime_type,
                    "Cache-Control": "no-cache",
                }
            )
        
        # 3. Parse Range header
        range_header = request.headers.get("Range")
        start_byte = 0
        end_byte = file_size - 1
        
        if range_header:
            range_str = range_header.replace("bytes=", "").strip()
            if "-" in range_str:
                start_str, end_str = range_str.split("-")
                start_byte = int(start_str) if start_str else 0
                end_byte = int(end_str) if end_str else file_size - 1
        else:
            # Without range, maybe limit it so it doesn't try to buffer 1GB immediately in Chrome on some profiles
            end_byte = file_size - 1

        start_byte = max(0, min(start_byte, file_size - 1))
        end_byte = max(start_byte, min(end_byte, file_size - 1))

        # Cap range size per request to 50MB to prevent memory exhaustion
        MAX_RANGE_SIZE = 50 * 1024 * 1024
        if end_byte - start_byte + 1 > MAX_RANGE_SIZE:
            end_byte = start_byte + MAX_RANGE_SIZE - 1

        # 4. Stream chunks
        return StreamingResponse(
            stream_telegram_chunks(tg_client, message, start_byte, end_byte),
            status_code=206 if range_header else 200,
            media_type=mime_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start_byte}-{end_byte}/{file_size}",
                "Content-Length": str(end_byte - start_byte + 1),
                "Content-Type": mime_type,
                "Cache-Control": "public, max-age=31536000",
                "X-Content-Type-Options": "nosniff",
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[NexusEdu] Stream endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/api/test-stream")
async def test_stream(request: Request):
    """Streams the hardcoded test video — used for diagnostics."""
    await resolve_channel(TEST_CHANNEL_ID)
    try:
        total, mime_type = await get_file_info(TEST_CHANNEL_ID, TEST_MESSAGE_ID)
        if not total:
            raise HTTPException(500, "Test message has no media. Check channel.")

        range_header = request.headers.get("range")
        if range_header:
            start, end = _parse_range(range_header, total)
            length = end - start + 1
            return StreamingResponse(
                _stream_telegram(TEST_CHANNEL_ID, TEST_MESSAGE_ID, start, end, total),
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range":  f"bytes {start}-{end}/{total}",
                    "Content-Length": str(length),
                    "Accept-Ranges": "bytes",
                    "Content-Type": mime_type,
                    "Cache-Control": "no-cache",
                },
            )
        else:
            initial_end = min(total - 1, INITIAL_BUFFER - 1)
            length = initial_end + 1
            return StreamingResponse(
                _stream_telegram(TEST_CHANNEL_ID, TEST_MESSAGE_ID, 0, initial_end, total),
                status_code=206,
                media_type=mime_type,
                headers={
                    "Content-Range":  f"bytes 0-{initial_end}/{total}",
                    "Content-Length": str(length),
                    "Accept-Ranges": "bytes",
                    "Content-Type": mime_type,
                    "Cache-Control": "no-cache",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[NexusEdu] Test stream error: {e}")
        raise HTTPException(500, f"Test stream error: {e}")


# ─── RUN ──────────────────────────────────────────────────────
if __name__ == "__main__":
    print("[NexusEdu] Starting server on port 8080...")
    uvicorn.run(app, host="0.0.0.0", port=8080)
