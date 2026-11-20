import threading
import time
from concurrent.futures import ThreadPoolExecutor

from app import main


def test_concurrent_live_clients_share_one_revision_read(monkeypatch):
    calls = 0
    calls_lock = threading.Lock()
    barrier = threading.Barrier(25)

    def read_revision(event_id):
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)
        return f"{event_id}:revision"

    monkeypatch.setattr(main, "_read_live_revision", read_revision)
    with main._live_revision_guard:
        main._live_revision_cache.clear()
        main._live_revision_locks.clear()

    def client_read(_):
        barrier.wait()
        return main._cached_live_revision("shared-event")

    with ThreadPoolExecutor(max_workers=25) as pool:
        revisions = list(pool.map(client_read, range(25)))

    assert revisions == ["shared-event:revision"] * 25
    assert calls == 1
