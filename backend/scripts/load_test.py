"""Run a disposable concurrent-user scenario against a non-production API."""

import argparse
import asyncio
import io
import json
import math
import random
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
        if not ordered:
            return f"{self.name}: requests=0"
        p95 = ordered[math.ceil(len(ordered) * 0.95) - 1]
        return (
            f"{self.name}: requests={len(ordered)} failures={len(self.failures)} "
            f"p50={statistics.median(ordered):.3f}s p95={p95:.3f}s "
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


async def run_batch(*actions):
    results = await asyncio.gather(*actions, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            raise result
    return results


async def scenario(base_url: str, users: int, read_rounds: int, photo_size: int, login_burst: bool, metrics):
    run = uuid.uuid4().hex[:10]
    limits = httpx.Limits(max_connections=max(50, users * 3), max_keepalive_connections=max(25, users))
    timeout = httpx.Timeout(65)
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

        await run_batch(*(join(i) for i in range(1, users)))

        image = io.BytesIO()
        pixels = random.Random(0).randbytes(photo_size ** 2 * 3)
        Image.frombytes("RGB", (photo_size, photo_size), pixels).save(image, format="JPEG", quality=75)
        image_bytes = image.getvalue()
        print(f"Photo pair: {len(image_bytes) * 2:,} bytes", flush=True)

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

        async def detail(index: int, ended=False, uploading=False):
            response = await checked(client, "GET", f"/competitions/{competition['id']}", headers=headers[index])
            data = response.json()
            if data["competition"]["participants"] != users or len(data["standings"]) != users:
                raise RuntimeError("Incorrect multiplayer roster")
            expected = (0, 1) if uploading else (1,)
            if any(row["count"] not in expected or row["count"] != row["points"] for row in data["standings"]):
                raise RuntimeError("A player did not receive exactly one check-in point")
            if not uploading and (len(data["feed"]) != min(users, 20) or bool(data["next_cursor"]) != (users > 20)):
                raise RuntimeError("Incorrect feed page after concurrent uploads")
            if ended and (not data["competition"]["ended_at"] or len(data["recap"]) != users):
                raise RuntimeError("Final standings or recap did not catch up to the live revision")
            return data["competition"]["revision"]

        # Verify that existing players can still read while every player uploads.
        await run_batch(
            *(submit(i) for i in range(users)),
            *(measured(metrics["detail-during-upload"], lambda i=i: detail(i, uploading=True)) for i in range(users)),
        )

        async def login(index: int):
            await measured(metrics["login-burst"], lambda: checked(
                client, "POST", "/auth/login",
                json={"username": f"load_{run}_{index}", "password": "Load-test-password-42!"},
            ))

        if login_burst:
            await run_batch(
                *(login(i) for i in range(users)),
                *(measured(metrics["detail-during-login"], lambda i=i: detail(i)) for i in range(users)),
            )

        for _ in range(read_rounds):
            await run_batch(*(measured(metrics["detail"], lambda i=i: detail(i)) for i in range(users)))
        before_end = await detail(0)

        ws_base = base_url.replace("http://", "ws://").replace("https://", "wss://")

        close_started = 0.0

        async def listen(index: int, ready: asyncio.Event):
            metric = metrics["websocket-connect"]
            started = time.perf_counter()
            try:
                async with websockets.connect(f"{ws_base}/ws/competitions/{competition['id']}", open_timeout=10) as socket:
                    await socket.send(json.dumps({"token": tokens[index]}))

                    async def wait_for_revision(expected):
                        async with asyncio.timeout(10):
                            while True:
                                message = json.loads(await socket.recv())
                                if message.get("type") == "changed" and message["revision"] == f"{expected}:-1":
                                    return

                    await wait_for_revision(before_end)
                    metric.record(started)
                    ready.set()
                    metric = metrics["websocket-fanout"]
                    started = close_started
                    await wait_for_revision(before_end + 1)
                    metric.record(close_started)
                    metric = metrics["live-refresh"]
                    started = close_started
                    await detail(index, ended=True)
                    metric.record(close_started)
            except Exception as error:
                metric.record(started or close_started or time.perf_counter(), error)
                raise

        ready = [asyncio.Event() for _ in range(users)]
        listeners = [asyncio.create_task(listen(i, ready[i])) for i in range(users)]
        try:
            await asyncio.wait_for(asyncio.gather(*(event.wait() for event in ready)), timeout=15)
            close_started = time.perf_counter()
            await measured(metrics["close"], lambda: checked(client, "POST", f"/competitions/{competition['id']}/end", headers=headers[0]))
            await run_batch(*listeners)
        finally:
            for listener in listeners:
                listener.cancel()
            await asyncio.gather(*listeners, return_exceptions=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8011")
    parser.add_argument("--users", type=int, default=25)
    parser.add_argument("--read-rounds", type=int, default=3)
    parser.add_argument("--photo-size", type=int, default=32, help="Synthetic JPEG width and height in pixels")
    parser.add_argument("--login-burst", action="store_true", help="Sign everyone in again while game reads are running")
    parser.add_argument("--allow-remote", action="store_true")
    args = parser.parse_args()
    host = urlparse(args.base_url).hostname
    if host not in {"127.0.0.1", "localhost", "::1"} and not args.allow_remote:
        raise SystemExit("Refusing to create load-test data on a remote API; pass --allow-remote explicitly.")
    if not 2 <= args.users <= 100:
        raise SystemExit("--users must be between 2 and 100")
    if args.read_rounds < 1:
        raise SystemExit("--read-rounds must be at least 1")
    if not 32 <= args.photo_size <= 1600:
        raise SystemExit("--photo-size must be between 32 and 1600")
    if args.login_burst and args.users > 50:
        raise SystemExit("--login-burst supports at most 50 users from one IP because of auth throttling")
    names = ("register", "join", "submit", "detail-during-upload", "login-burst", "detail-during-login", "detail",
             "websocket-connect", "close", "websocket-fanout", "live-refresh")
    metrics = {name: Metric(name) for name in names}
    try:
        asyncio.run(scenario(args.base_url.rstrip("/"), args.users, args.read_rounds, args.photo_size, args.login_burst, metrics))
    finally:
        for metric in metrics.values():
            if metric.seconds:
                print(metric.summary())
                for failure in metric.failures[:3]:
                    print(f"  failure: {failure}")


if __name__ == "__main__":
    main()
