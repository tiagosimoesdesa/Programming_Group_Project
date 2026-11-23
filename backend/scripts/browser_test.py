"""Exercise a production web export against a fresh loopback API and SQLite database."""

import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import time


def main():
    backend = Path(__file__).resolve().parents[1]
    mobile = backend.parent / "mobile"
    scratch = backend.parent / ".tools"
    scratch.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix="browser-e2e-", dir=scratch) as directory, socket.socket() as listener:
        root = Path(directory)
        export = root / "web"
        listener.bind(("127.0.0.1", 0))
        origin = f"http://127.0.0.1:{listener.getsockname()[1]}"
        os.environ.pop("SSLKEYLOGFILE", None)
        os.environ.update(
            DATABASE_URL=f"sqlite:///{(root / 'test.db').as_posix()}",
            JWT_SECRET=secrets.token_hex(32), STORAGE_MODE="local", UPLOAD_DIR=str(root / "uploads"),
            OPENAI_API_KEY="", PUBLIC_URL=origin, CORS_ORIGINS=f'["{origin}"]',
            CI="1", EXPO_NO_TELEMETRY="1", EXPO_NO_DOTENV="1",
            EXPO_PUBLIC_WEB_API_URL=origin, EXPO_PUBLIC_WEB_SOCKET_URL=origin,
            E2E_ORIGIN=origin,
        )
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=backend, check=True)
        subprocess.run(
            ["node", "node_modules/expo/bin/cli", "export", "--platform", "web", "--max-workers", "2",
             "--output-dir", str(export)], cwd=mobile, check=True,
        )

        import uvicorn
        from fastapi.staticfiles import StaticFiles
        from app.db import engine
        from app.main import app

        app.mount("/", StaticFiles(directory=export, html=True))
        server = uvicorn.Server(uvicorn.Config(app, access_log=False, timeout_graceful_shutdown=5))
        thread = Thread(target=server.run, kwargs={"sockets": [listener]})
        thread.start()
        try:
            deadline = time.monotonic() + 10
            while not server.started and thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.05)
            if not server.started:
                raise RuntimeError("The disposable API did not start")
            return subprocess.run(["node", "--test", "tests/e2e.test.cjs"], cwd=mobile).returncode
        finally:
            server.should_exit = True
            thread.join()
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
