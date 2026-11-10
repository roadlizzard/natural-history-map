"""Cached HTTP fetches. Every raw response is stored under cache/ so nothing is downloaded twice."""
import fcntl
import hashlib
import http.client
import json
import os
import ssl
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache")
DATA = os.path.join(ROOT, "data")
# python.org builds ship without CA certs; use the macOS system bundle when present.
SSL_CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)
USER_AGENT = "anthropocene-natural-history-map/0.2 (https://anthropocene.bladedestroyer.workers.dev; non-commercial)"


# Seconds between requests, shared by every build on this Mac. Each Wikimedia service has its own queue:
# the APIs answer serial requests quickly; image files (upload.wikimedia.org) are rate-limited harder.
WIKI_GAPS = {"upload.wikimedia.org": 0.5, "en.wikipedia.org": 0.5, "commons.wikimedia.org": 0.5, "other": 0.5}


def wiki_turn(url):
    """Wait our turn so all builds together stay within the gaps in WIKI_GAPS."""
    host = urllib.parse.urlparse(url).hostname or ""
    if not host.endswith(("wikipedia.org", "wikimedia.org", "wikidata.org")):
        return False
    queue = host if host in WIKI_GAPS else "other"
    gap = WIKI_GAPS[queue]
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, f"wiki-rate-{queue}.lock"), "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        try:
            last = float(f.read() or 0)
        except ValueError:
            last = 0
        wait = last + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        f.seek(0)
        f.truncate()
        f.write(str(time.time()))
        fcntl.flock(f, fcntl.LOCK_UN)
    return True


def fetch(url, sub, data=None, ext="json", pause=0.5, retries=7):
    """Return the response bytes for url (POST if data is given), reading from cache/<sub>/ when present."""
    key = url + ("|" + urllib.parse.urlencode(data) if data else "")
    path = os.path.join(CACHE, sub, hashlib.sha1(key.encode()).hexdigest()[:16] + "." + ext)
    # A refresh run (scripts/refresh.py) sets NETCACHE_FRESH (e.g. "pbdb") and NETCACHE_SINCE (a Unix time):
    # cached answers of those sources older than that are fetched again, once per run, to pick up new records.
    fresh = sub in os.environ.get("NETCACHE_FRESH", "").split(",") and \
        os.path.exists(path) and os.path.getmtime(path) < float(os.environ.get("NETCACHE_SINCE", "0"))
    if os.path.exists(path) and not fresh:
        with open(path, "rb") as f:
            return f.read()
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
    paced = False
    for attempt in range(retries):
        try:
            paced = wiki_turn(url)
            with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
                raw = r.read()
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                raise
            # Honour the server's Retry-After when it gives one; otherwise back off 10s, 20s, 40s...
            wait = e.headers.get("Retry-After", "")
            time.sleep(min(int(wait), 300) if wait.isdigit() else min(10 * 2 ** attempt, 300))
        except (urllib.error.URLError, TimeoutError, ConnectionError, http.client.HTTPException):
            # Dropped connection, cut-off download or failed DNS lookup: wait and try again.
            if attempt == retries - 1:
                raise
            time.sleep(min(10 * 2 ** attempt, 300))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(raw)
    if not paced:          # Wikimedia is paced by the shared queue above; other hosts by this pause
        time.sleep(pause)
    return raw


def fetch_json(url, sub, data=None, **kw):
    return json.loads(fetch(url, sub, data, **kw))
