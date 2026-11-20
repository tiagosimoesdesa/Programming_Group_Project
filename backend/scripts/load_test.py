"""Run a disposable concurrent-user scenario against a non-production API."""

import argparse
import asyncio
import io
import statistics
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx
import websockets
from PIL import Image


@dataclass
class Metric:
    name: str
    seconds: list[float] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)

    def record(self, started: float, error: Exception | None = None):
        self.seconds.append(time.perf_counter() - started)
        if error:
            self.failures.append(str(error))

    def summary(self):
        ordered = sorted(self.seconds)
        percentile = lambda p: ordered[min(len(ordered) - 1, int((len(ordered) - 1) * p))]
        return (
            f"{self.name}: requests={len(ordered)} failures={len(self.failures)} "
            f"p50={statistics.median(ordered):.3f}s p95={percentile(0.95):.3f}s "
            f"max={ordered[-1]:.3f}s"
        )


async def checked(client: httpx.AsyncClient, method: str, path: str, **kwargs):
    response = await client.request(method, path, **kwargs)
    if response.is_error:
        raise RuntimeError(f"{method} {path}: {response.status_code} {response.text[:160]}")
    return response


async def measured(metric: Metric, action):
    started = time.perf_counter()
    try:
        result = await action()
        metric.record(started)
        return result
    except Exception as error:
        metric.record(started, error)
        raise


async def scenario(base_url: str, users: int, read_rounds: int):
    run = uuid.uuid4().hex[:10]
    limits = httpx.Limits(max_connections=max(50, users * 3), max_keepalive_connections=max(25, users))
    timeout = httpx.Timeout(65)
    metrics = {name: Metric(name) for name in ("register", "join", "submit", "detail", "websocket-fanout")}
    async with httpx.AsyncClient(base_url=base_url, timeout=timeout, limits=limits) as client:
        async def register(index: int):
            response = await measured(
                metrics["register"],
                lambda: checked(
                    client,
                    "POST",
                    "/auth/register",
                    json={"username": f"load_{run}_{index}", "password": "Load-test-password-42!", "legal_age": True},
                ),
            )
            return response.json()["access_token"]

        # Account creation is setup, not the shared-event load under test. Keeping it
        # sequential also makes the disposable SQLite scenario match production setup.
        tokens = [await register(i) for i in range(users)]
        headers = [{"Authorization": f"Bearer {token}"} for token in tokens]
        created = await checked(client, "POST", "/competitions", headers=headers[0], json={"name": f"Load {run}", "mode": "classic"})
        competition = created.json()

        async def join(index: int):
            await measured(
                metrics["join"],
                lambda: checked(client, "POST", "/competitions/join", headers=headers[index], json={"code": competition["code"]}),
            )

        await asyncio.gather(*(join(i) for i in range(1, users)))

        image = io.BytesIO()
        Image.new("RGB", (32, 32), color=(255, 191, 48)).save(image, format="JPEG")
        image_bytes = image.getvalue()

        async def submit(index: int):
            request_headers = {**headers[index], "Idempotency-Key": str(uuid.uuid4())}
            await measured(
                metrics["submit"],
                lambda: checked(
                    client,
                    "POST",
                    f"/competitions/{competition['id']}/submissions",
                    headers=request_headers,
                    data={"beer_count": "1", "pint_count": "0"},
                    files={
                        "rear": ("rear.jpg", image_bytes, "image/jpeg"),
                        "front": ("front.jpg", image_bytes, "image/jpeg"),
                    },
                ),
            )

        # Concurrent captures exercise image validation, storage writes, event locking,
        # score updates, and a realistically populated feed before the read burst.
        await asyncio.gather(*(submit(i) for i in range(users)))

        async def read(index: int):
            await measured(
                metrics["detail"],
                lambda: checked(client, "GET", f"/competitions/{competition['id']}", headers=headers[index]),
            )

        for _ in range(read_rounds):
            await asyncio.gather(*(read(i) for i in range(users)))

        ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")

        async def listen(index: int, ready: asyncio.Event):
            started = time.perf_counter()
            try:
                async with websockets.connect(f"{ws_base}/ws/competitions/{competition['id']}", open_timeout=10) as socket:
                    await socket.send(f'{{"token":"{tokens[index]}"}}')
                    first = await asyncio.wait_for(socket.recv(), timeout=10)
                    if '"changed"' not in first:
                        raise RuntimeError(f"unexpected initial WebSocket message: {first[:120]}")
                    ready.set()
                    while True:
                        message = await asyncio.wait_for(socket.recv(), timeout=10)
                        if '"changed"' in message:
                            metrics["websocket-fanout"].record(started)
                            return
            except Exception as error:
                metrics["websocket-fanout"].record(started, error)
                raise

        ready = [asyncio.Event() for _ in range(users)]
        listeners = [asyncio.create_task(listen(i, ready[i])) for i in range(users)]
        await asyncio.wait_for(asyncio.gather(*(event.wait() for event in ready)), timeout=15)
        await checked(client, "POST", f"/competitions/{competition['id']}/end", headers=headers[0])
        await asyncio.gather(*listeners)

    for metric in metrics.values():
        print(metric.summary())
        for failure in metric.failures[:3]:
            print(f"  failure: {failure}")
    failures = sum(len(metric.failures) for metric in metrics.values())
    if failures:
        raise SystemExit(f"load test failed with {failures} operation(s)")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8011")
    parser.add_argument("--users", type=int, default=25)
    parser.add_argument("--read-rounds", type=int, default=3)
    parser.add_argument("--allow-remote", action="store_true")
    args = parser.parse_args()
    host = urlparse(args.base_url).hostname
    if host not in {"127.0.0.1", "localhost", "::1"} and not args.allow_remote:
        raise SystemExit("Refusing to create load-test data on a remote API; pass --allow-remote explicitly.")
    if not 2 <= args.users <= 100:
        raise SystemExit("--users must be between 2 and 100")
    if args.read_rounds < 1:
        raise SystemExit("--read-rounds must be at least 1")
    asyncio.run(scenario(args.base_url.rstrip("/"), args.users, args.read_rounds))


if __name__ == "__main__":
    main()
