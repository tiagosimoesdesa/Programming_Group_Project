"""Run paced multiplayer, spike, recovery, and integrity tests on a disposable local API."""

import argparse
import asyncio
from collections import Counter, defaultdict
from contextlib import asynccontextmanager, contextmanager, suppress
from dataclasses import dataclass, field
import io
import json
import math
import os
from pathlib import Path
import random
import secrets
import socket
import statistics
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlsplit
import uuid

import httpx
from PIL import Image
import psutil
import websockets

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
MIB = 1024 ** 2


def stats(samples):
    if not samples:
        return {}
    ordered = sorted(samples)
    return {key: round(value, 3) for key, value in {
        "avg": statistics.mean(ordered),
        "p95": ordered[math.ceil(len(ordered) * .95) - 1],
        "p99": ordered[math.ceil(len(ordered) * .99) - 1],
        "max": ordered[-1],
    }.items()}


@dataclass
class Operation:
    kind: str
    ok: bool
    elapsed_ms: float
    status: str
    service_ms: float | None = None
    sql_ms: float | None = None
    statements: int | None = None


@dataclass
class Phase:
    name: str
    vus: int
    operations: list[Operation] = field(default_factory=list)
    samples: list[dict] = field(default_factory=list)
    started: float = field(default_factory=time.perf_counter)
    finished: float = 0

    def summarize(self):
        duration = (self.finished or time.perf_counter()) - self.started
        groups = defaultdict(list)
        for op in self.operations:
            groups[op.kind].append(op)
        ordinary = [op for op in self.operations if op.kind in {"profile", "history", "detail", "filter",
                                                                "page", "archives", "reaction"}]
        return {
            "phase": self.name, "vus": self.vus, "seconds": round(duration, 3),
            "rps": round(len(self.operations) / duration, 3),
            **self.summarize_ops(self.operations),
            "ordinary": self.summarize_ops(ordinary),
            "routes": {name: self.summarize_ops(items) for name, items in sorted(groups.items())},
            "resources": {name: stats([point[name] for point in self.samples if name in point])
                          for name in sorted({key for point in self.samples for key in point})},
        }

    @staticmethod
    def summarize_ops(ops):
        failures = sum(not op.ok for op in ops)
        return {
            "requests": len(ops), "ok": len(ops) - failures, "failed": failures,
            "error_pct": round(100 * failures / len(ops), 3) if ops else 0,
            "status_counts": dict(Counter(op.status for op in ops)),
            "latency_ms": stats([op.elapsed_ms for op in ops]),
            "service_ms": stats([op.service_ms for op in ops if op.service_ms is not None]),
            "sql_ms": stats([op.sql_ms for op in ops if op.sql_ms is not None]),
            "sql_statements": stats([op.statements for op in ops if op.statements is not None]),
        }


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


@contextmanager
def database(root, postgres_bin):
    if postgres_bin is None:
        yield f"sqlite:///{(root / 'test.sqlite').as_posix()}", None
        return
    data = root / "pg"
    port = free_port()
    suffix = ".exe" if os.name == "nt" else ""
    initdb, ctl = (postgres_bin / f"{name}{suffix}" for name in ("initdb", "pg_ctl"))
    with (root / "postgres-init.log").open("wb") as log:
        subprocess.run([initdb, "-D", data, "-A", "trust", "-U", "postgres", "-E", "UTF8", "--no-locale"],
                       stdout=log, stderr=log, check=True, timeout=45)
    command = [ctl, "-D", data, "-w", "-t", "15"]
    try:
        subprocess.run([*command, "-l", root / "postgres.log", "-o",
                        f"-h 127.0.0.1 -p {port} -c max_connections=35 -c shared_buffers=32MB -c unix_socket_directories=", "start"],
                       check=True, timeout=20)
        pid = int((data / "postmaster.pid").read_text().splitlines()[0])
        yield f"postgresql+psycopg://postgres@127.0.0.1:{port}/postgres", pid
    finally:
        if (data / "postmaster.pid").is_file():
            subprocess.run([*command, "-m", "fast", "stop"], check=True, timeout=20)


def synthetic_photo(size):
    pixels = random.Random(11).randbytes(size * size * 3)
    image = io.BytesIO()
    Image.frombytes("RGB", (size, size), pixels).save(image, "JPEG", quality=75)
    return image.getvalue()


class Session:
    def __init__(self, client, index, base_url):
        self.client = client
        self.index = index
        self.base_url = base_url
        self.tokens = {}
        self.user_id = ""
        self.socket = None
        self.listener = None
        self.snap = None
        self.revision = None
        self.live_updates = 0
        self.downloaded = set()
        self.random = random.Random(1000 + index)

    async def request(self, phase, kind, method, path, expected=(200,), **kwargs):
        started = time.perf_counter()
        response = None
        failure_status = "transport-error"
        try:
            headers = kwargs.pop("headers", {})
            if self.tokens:
                headers = {**headers, "Authorization": "Bearer " + self.tokens["access_token"]}
            response = await self.client.request(method, path, headers=headers, **kwargs)
            if response.status_code not in expected:
                raise RuntimeError(f"{kind} received HTTP {response.status_code}")
            return response
        except asyncio.CancelledError:
            failure_status = "cancelled"
            raise
        except httpx.TransportError as error:
            failure_status = type(error).__name__
            raise
        finally:
            headers = response.headers if response is not None else {}
            phase.operations.append(Operation(
                kind, response is not None and response.status_code in expected,
                (time.perf_counter() - started) * 1000,
                str(response.status_code) if response is not None else failure_status,
                float(headers["x-capacity-service-ms"]) if "x-capacity-service-ms" in headers else None,
                float(headers["x-capacity-sql-ms"]) if "x-capacity-sql-ms" in headers else None,
                int(headers["x-capacity-sql-count"]) if "x-capacity-sql-count" in headers else None,
            ))

    async def login(self, phase, password):
        self.tokens = (await self.request(phase, "login", "POST", "/auth/login",
                       json={"username": f"capacity_{self.index}", "password": password})).json()
        self.user_id = (await self.request(phase, "profile", "GET", "/me")).json()["id"]

    async def join(self, phase, event):
        await self.request(phase, "join", "POST", "/competitions/join", json={"code": "CAPACITY"})
        self.snap = (await self.request(phase, "detail", "GET", event)).json()

    async def connect(self, event_id):
        self.socket = await websockets.connect(
            self.base_url.replace("http:", "ws:") + f"/ws/competitions/{event_id}",
            open_timeout=8, proxy=None,
        )
        await self.socket.send(json.dumps({"token": self.tokens["access_token"]}))
        first = json.loads(await asyncio.wait_for(self.socket.recv(), timeout=8))
        if first["type"] != "changed":
            raise RuntimeError("Initial live revision missing")
        self.revision = first["revision"]
        self.listener = asyncio.create_task(self.watch())

    async def watch(self):
        async for frame in self.socket:
            data = json.loads(frame)
            if data["type"] == "changed":
                self.revision = data["revision"]
                self.live_updates += 1

    async def logout(self, phase):
        if self.socket is not None:
            await self.socket.close()
            if self.listener is not None:
                await self.listener
        if self.tokens:
            refresh = self.tokens["refresh_token"]
            await self.request(phase, "logout", "POST", "/auth/logout", (204,), json={"refresh_token": refresh})
            self.tokens = {}


class Rehearsal:
    def __init__(self, client, base, manifest, photo, password, api, pg, report, rss_limit):
        self.client = client
        self.base = base
        self.manifest = manifest
        self.event = "/competitions/" + manifest["event"]
        self.files = {side: (f"{side}.jpg", photo, "image/jpeg") for side in ("rear", "front")}
        self.password = password
        self.api = psutil.Process(api)
        self.pg = psutil.Process(pg) if pg else None
        self.pg_processes = {}
        self.driver = psutil.Process()
        self.report = report
        self.rss_limit = rss_limit
        self.accepted = {}
        self.host = Session(client, 0, base)
        self.players = []

    async def sample(self, phase):
        response = await self.client.get("/__capacity")
        response.raise_for_status()
        pool = response.json()
        if pool["pid"] != self.api.pid:
            raise RuntimeError("The test API changed process unexpectedly")
        api_rss = self.api.memory_info().rss / MIB
        sample = {"api_cpu_pct_one_core": self.api.cpu_percent(), "api_rss_mib": api_rss,
                  "client_cpu_pct_one_core": self.driver.cpu_percent(),
                  **{name: value for name, value in pool.items() if name != "pid"}}
        if self.pg is not None:
            totals = Counter()
            for child in [self.pg, *self.pg.children(recursive=True)]:
                try:
                    process = self.pg_processes.setdefault(child.pid, child)
                    totals["cpu"] += process.cpu_percent()
                    totals["rss"] += process.memory_info().rss
                except psutil.NoSuchProcess:
                    continue
            sample.update(db_cpu_pct_one_core=totals["cpu"], db_aggregate_rss_mib=totals["rss"] / MIB)
        phase.samples.append(sample)
        if api_rss > self.rss_limit:
            raise RuntimeError(f"API RSS exceeded the local {self.rss_limit} MiB abort limit")

    async def monitor(self, phase):
        while True:
            await asyncio.sleep(.75)
            await self.sample(phase)
            if len(phase.operations) >= 40 and sum(not op.ok for op in phase.operations) / len(phase.operations) > .05:
                raise RuntimeError("More than 5% of requests failed")

    @asynccontextmanager
    async def measure(self, name, users):
        # Reset checkout high-water mark so the next phase only includes its work.
        (await self.client.get("/__capacity")).raise_for_status()
        phase = Phase(name, users)
        self.api.cpu_percent()
        self.driver.cpu_percent()
        async with asyncio.TaskGroup() as group:
            reporter = group.create_task(self.monitor(phase))
            try:
                yield phase
            finally:
                phase.finished = time.perf_counter()
                reporter.cancel()
                try:
                    await self.sample(phase)
                finally:
                    summary = phase.summarize()
                    self.report["phases"].append(summary)
                    latency = summary["latency_ms"]
                    print(f"{name}: VUs={users} RPS={summary['rps']} OK={summary['ok']} "
                          f"failed={summary['failed']} p95={latency.get('p95')}ms p99={latency.get('p99')}ms", flush=True)

    async def submit(self, phase, player, key=None, expected=(201,)):
        response = await player.request(
            phase, "upload", "POST", self.event + "/submissions", expected,
            headers={"Idempotency-Key": key or str(uuid.uuid4())},
            files=self.files, data={"beer_count": "2", "pint_count": "1"},
        )
        if response.status_code == 201:
            photo = response.json()
            self.accepted[photo["id"]] = [player.user_id, 2, 1]
            return photo["id"]

    async def activate(self, phase, player):
        await asyncio.sleep(player.random.uniform(.05, 1.5))
        await player.login(phase, self.password)
        await player.request(phase, "history", "GET", "/competitions")
        await player.join(phase, self.event)
        if player.index % 3:
            await player.connect(self.manifest["event"])

    async def browse(self, phase, player, deadline):
        rng = player.random
        choices = ("history", "detail", "filter", "page", "archives", "media", "reaction", "upload")
        weights = (.23, .24, .12, .08, .06, .09, .12, .06)
        consecutive_failures = 0
        while time.perf_counter() < deadline:
            await asyncio.sleep(min(max(0, deadline - time.perf_counter()), rng.uniform(.65, 2.5)))
            if time.perf_counter() >= deadline:
                break
            try:
                kind = rng.choices(choices, weights)[0]
                await self.interact(phase, player, kind)
            except (httpx.HTTPError, RuntimeError):
                consecutive_failures += 1
                if consecutive_failures == 3:
                    raise
            else:
                consecutive_failures = 0

    async def interact(self, phase, player, kind):
        if kind == "upload":
            await self.submit(phase, player)
        elif kind == "reaction":
            photo = self.manifest["photo"]
            await player.request(phase, kind, "PUT", f"{self.event}/photos/{photo}/reaction",
                                 json={"emoji": player.random.choice(["❤️", "🔥", "😂"])})
        elif kind == "history":
            await player.request(phase, kind, "GET", "/competitions")
        elif kind == "archives":
            archived = player.random.choice(self.manifest["archive"])
            await player.request(phase, kind, "GET", f"/competitions/{archived}")
        elif kind == "media":
            unseen = [p for p in player.snap["feed"] if p["id"] not in player.downloaded]
            if unseen:
                photo = player.random.choice(unseen)
                url = urlsplit(photo["rear_url"])
                if f"{url.scheme}://{url.netloc}" != self.base or url.path != "/media":
                    raise AssertionError("Media points outside the disposable API")
                await player.request(phase, kind, "GET", f"{url.path}?{url.query}")
                player.downloaded.add(photo["id"])
        elif kind == "filter":
            await player.request(phase, kind, "GET", self.event, params={"player": self.manifest["host"]})
        elif kind == "page" and player.snap["next_cursor"]:
            await player.request(phase, kind, "GET", self.event, params={"before": player.snap["next_cursor"]})
        else:
            player.snap = (await player.request(phase, "detail", "GET", self.event)).json()

    async def plateau(self, name, players, seconds):
        async with self.measure(name, len(players)) as phase:
            deadline = time.perf_counter() + seconds
            async with asyncio.TaskGroup() as group:
                for player in players:
                    group.create_task(self.browse(phase, player, deadline))
        summary = self.report["phases"][-1]
        if summary["error_pct"] > 5 or summary["latency_ms"].get("p95", 0) > 5000:
            raise RuntimeError("Stopped escalation at the local error or latency safety limit")

    async def probe_recovery(self):
        started = time.perf_counter()
        while time.perf_counter() - started < 40:
            try:
                response = await self.client.get("/health", timeout=1)
                if response.is_success:
                    self.report["abort_recovery_seconds"] = round(time.perf_counter() - started, 3)
                    return
            except httpx.TransportError:
                pass
            await asyncio.sleep(1)
        self.report["abort_recovery_seconds"] = None

    async def run(self, levels, seconds, spike):
        async with self.measure("host-setup", 1) as phase:
            await self.host.login(phase, self.password)
            await self.host.request(phase, "create", "POST", "/competitions", (201,),
                                    json={"name": "Capacity form test", "mode": "classic"})
        for level in levels:
            async with self.measure(f"arrivals-{level}", level) as phase:
                additions = [Session(self.client, i, self.base) for i in range(len(self.players) + 1, level + 1)]
                self.players.extend(additions)
                async with asyncio.TaskGroup() as group:
                    for player in additions:
                        group.create_task(self.activate(phase, player))
            await self.plateau(f"steady-{level}", self.players, seconds)
        if spike:
            async with self.measure("history-spike", len(self.players)) as phase:
                for _ in range(3):
                    async with asyncio.TaskGroup() as group:
                        for player in self.players:
                            group.create_task(player.request(phase, "history", "GET", "/competitions"))
                    await asyncio.sleep(.2)
            async with self.measure("upload-spike", len(self.players)) as phase:
                async with asyncio.TaskGroup() as group:
                    for player in self.players:
                        group.create_task(self.submit(phase, player))
                        group.create_task(player.request(phase, "detail", "GET", self.event))
        recovery = self.players[:10]
        await self.plateau(f"recovery-{len(recovery)}", recovery, min(seconds, 15))
        await self.integrity()

    async def integrity(self):
        async with self.measure("integrity", 12) as phase:
            player = self.players[0]
            key = str(uuid.uuid4())
            photos = await asyncio.gather(*(self.submit(phase, player, key) for _ in range(12)))
            assert len(set(photos)) == 1, "Duplicate retries returned multiple submissions"
            reaction_path = f"{self.event}/photos/{photos[0]}/reaction"
            await asyncio.gather(*(player.request(phase, "reaction", "PUT", reaction_path, json={"emoji": emoji})
                                   for emoji in ["🔥", "😂", "❤️"] * 4))
            state = (await player.request(phase, "filter", "GET", self.event, params={"player": player.user_id})).json()
            current = next(photo for photo in state["feed"] if photo["id"] == photos[0])
            assert sum(current["reactions"].values()) == 1 and current["my_reaction"], "Conflicting reaction lost or duplicated"
            refresh = player.tokens["refresh_token"]
            rotations = await asyncio.gather(*(player.request(phase, "rotate", "POST", "/auth/refresh", (200, 401),
                                                               json={"refresh_token": refresh}) for _ in range(2)))
            assert sorted(result.status_code for result in rotations) == [200, 401], "Refresh token was reused"
            player.tokens = next(result.json() for result in rotations if result.status_code == 200)
            secret = "/competitions/" + self.manifest["private"]
            await asyncio.gather(*(p.request(phase, "privacy", "GET", secret, (404,)) for p in self.players[:10]))
            await player.request(phase, "privacy", "PUT", secret + f"/photos/{photos[0]}/reaction", (404,), json={"emoji": "🔥"})
            archived = (await player.request(phase, "history", "GET", "/competitions")).json()
            spectator_night = next(item for item in archived if item["id"] == self.manifest["archive"][0])
            assert spectator_night["my_role"] == "spectator" and spectator_night["code"] == "", "Player code exposed"
            overlap = await asyncio.gather(
                *(self.submit(phase, p, expected=(201, 409)) for p in self.players[:10]),
                self.host.request(phase, "finish", "POST", self.event + "/end"),
            )
            await self.submit(phase, player, expected=(409,))
            final = (await player.request(phase, "detail", "GET", self.event)).json()
            expected_revision = f"{final['competition']['revision']}:-1"
            viewers = [p for p in self.players if p.socket is not None]
            async with asyncio.timeout(8):
                while any(p.revision != expected_revision for p in viewers):
                    await asyncio.sleep(.05)
            self.report["integrity"] = {"idempotent_retries": 12, "conflicting_reactions": 12,
                                        "one_refresh_winner": True, "private_denials": 11,
                                        "live_clients_caught_up": len(viewers),
                                        "finish_overlap_commits": sum(photo is not None for photo in overlap[:-1]),
                                        "finish_overlap_rejections": sum(photo is None for photo in overlap[:-1])}
            expected = Counter({self.manifest["host"]: len(self.manifest["seed_photos"])})
            for user_id, count, pints in self.accepted.values():
                expected[user_id] += count + pints
            observed = {item["id"]: item["points"] for item in final["standings"]}
            assert len(observed) == len(self.players) + 1 and all(points == expected[user] for user, points in observed.items()), "Incorrect final scoring"

    async def shutdown(self):
        async with self.measure("logout", len(self.players)) as phase:
            results = await asyncio.gather(*(person.logout(phase) for person in [self.host, *self.players]),
                                           return_exceptions=True)
            if any(isinstance(result, Exception) for result in results):
                raise RuntimeError("A session did not close cleanly")


async def exercise(port, server, pg, root, args, password, photo, report):
    base = f"http://127.0.0.1:{port}"
    limits = httpx.Limits(max_connections=2 * args.levels[-1] + 8, max_keepalive_connections=args.levels[-1] + 8)
    async with httpx.AsyncClient(base_url=base, timeout=10, limits=limits, trust_env=False) as client:
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError("The disposable API exited during startup")
            try:
                readiness = await client.get("/__capacity", timeout=1)
                if readiness.is_success:
                    api_pid = readiness.json()["pid"]
                    if api_pid == server.pid or api_pid in {p.pid for p in psutil.Process(server.pid).children(recursive=True)}:
                        break
                    raise RuntimeError("Readiness response came from an unowned process")
            except httpx.TransportError:
                await asyncio.sleep(.25)
        else:
            raise RuntimeError("The disposable API did not become ready")
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        game = Rehearsal(client, base, manifest, photo, password, api_pid, pg, report, args.rss_limit)
        try:
            await game.run(args.levels, args.seconds, not args.no_spike)
        except Exception:
            await game.probe_recovery()
            raise
        await game.shutdown()
    return manifest, game.accepted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--postgres-bin", type=lambda path: Path(path).resolve(), help="PostgreSQL bin directory. Default: disposable SQLite.")
    parser.add_argument("--levels", nargs="+", type=int, default=[10, 25, 50, 60])
    parser.add_argument("--seconds", type=int, default=25, help="Duration of each steady stage")
    parser.add_argument("--history", type=int, default=24)
    parser.add_argument("--photo-size", type=int, default=600)
    parser.add_argument("--rss-limit", type=int, default=480, help="Abort if API RSS exceeds this MiB limit")
    parser.add_argument("--no-spike", action="store_true")
    parser.add_argument("--label", default="local")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.levels != sorted(set(args.levels)) or not 2 <= min(args.levels) <= max(args.levels) <= 60:
        parser.error("--levels must be increasing and between 2 and 60")
    if not 5 <= args.seconds <= 120 or not 1 <= args.history <= 100 or not 32 <= args.photo_size <= 1200:
        parser.error("Use 5–120 seconds, 1–100 archived nights, and a photo size of 32–1200 pixels")
    scratch = ROOT / ".tools"
    scratch.mkdir(exist_ok=True)
    root = Path(tempfile.mkdtemp(prefix="capacity-", dir=scratch))
    photo = synthetic_photo(args.photo_size)
    report = {"label": args.label, "database": "postgresql" if args.postgres_bin else "sqlite",
              "archive_nights": args.history, "photo_pair_bytes": len(photo) * 2,
              "stage_seconds": args.seconds, "logical_cpus": psutil.cpu_count(), "phases": []}
    print(f"Disposable loopback test data and logs: {root}", flush=True)
    try:
        with database(root, args.postgres_bin) as (url, pg):
            port = free_port()
            password = secrets.token_urlsafe(18)
            env = dict(os.environ)
            env.pop("SSLKEYLOGFILE", None)
            env.update(CAPACITY_SANDBOX=str(root), CAPACITY_PASSWORD=password, DATABASE_URL=url,
                       STORAGE_MODE="local", UPLOAD_DIR=str(root / "uploads"), JWT_SECRET=secrets.token_hex(32),
                       PUBLIC_URL=f"http://127.0.0.1:{port}", PYTHONPATH=str(BACKEND),
                       PASSWORD_HASH_CONCURRENCY="2", CORS_ORIGINS="[]")
            fixture = root / "uploads" / "fixture"
            fixture.mkdir(parents=True)
            for side in ("rear", "front"):
                (fixture / f"{side}.jpg").write_bytes(photo)
            command = [sys.executable, "-m", "scripts.capacity_server"]
            subprocess.run([*command, "seed", str(args.levels[-1]), str(args.history)], cwd=root, env=env, check=True)
            with (root / "api.log").open("wb") as log:
                api = subprocess.Popen([*command, "serve", str(port)], cwd=root, env=env, stdout=log, stderr=log)
                try:
                    manifest, accepted = asyncio.run(exercise(port, api, pg, root, args, password, photo, report))
                    subprocess.run([*command, "audit", manifest["event"]], cwd=root, env=env, check=True)
                    audit = json.loads((root / "audit.json").read_text(encoding="utf-8"))
                    saved = {key: value for key, value in audit.pop("photos").items() if key not in manifest["seed_photos"]}
                    assert saved == accepted, "Committed photo rows differ from accepted API writes"
                    assert audit["members"] == args.levels[-1] + 1 and audit["ended"], "Incorrect final membership or status"
                    assert audit["missing_media"] == 0 and audit["orphan_media"] == 0, "Missing or orphaned photo files"
                    report["integrity"].update(audit, accepted_uploads=len(accepted))
                finally:
                    with suppress(psutil.NoSuchProcess):
                        for child in psutil.Process(api.pid).children(recursive=True):
                            with suppress(psutil.NoSuchProcess):
                                child.terminate()
                    if api.poll() is None:
                        api.terminate()
                    api.wait(timeout=10)
    finally:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
