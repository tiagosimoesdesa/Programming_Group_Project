import asyncio
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


def test_live_revision_shares_an_in_flight_refresh(monkeypatch):
    calls = []
    release = threading.Event()

    async def scenario():
        loop = asyncio.get_running_loop()
        started = asyncio.Event()

        def read(event_id):
            calls.append(event_id)
            loop.call_soon_threadsafe(started.set)
            assert release.wait(5)
            return "7:-1"

        monkeypatch.setattr(main, "_cached_live_revision", read)
        clients = [asyncio.create_task(main.live_revision("refreshing-event")) for _ in range(40)]
        try:
            await asyncio.wait_for(started.wait(), timeout=5)
            clients[0].cancel()
        finally:
            release.set()
        results = await asyncio.gather(*clients, return_exceptions=True)
        assert isinstance(results[0], asyncio.CancelledError)
        assert results[1:] == ["7:-1"] * 39

    asyncio.run(scenario())
    assert calls == ["refreshing-event"]


def test_completed_live_reads_do_not_retain_per_competition_locks(monkeypatch):
    monkeypatch.setattr(main, "_read_live_revision", lambda event_id: f"{event_id}:revision")
    for index in range(300):
        event_id = f"completed-event-{index}"
        assert main._cached_live_revision(event_id) == f"{event_id}:revision"

    with main._live_revision_guard:
        assert not any(key.startswith("completed-event-") for key in main._live_revision_locks)
