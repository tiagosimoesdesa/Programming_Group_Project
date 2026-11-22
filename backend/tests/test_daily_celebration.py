import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from threading import Lock

import httpx
import pytest

from app import daily_celebration as daily
from app import main
from app.config import settings
from app.db import Session
from app.models import DailyCelebration


def auth(client, username="daily_fact_user"):
    response = client.post(
        "/auth/register",
        json={"username": username, "password": "a-secure-password-1", "legal_age": True},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def openai_payload(source_url, *, returned_url=None, **overrides):
    card = {
        "date_evidence": "The team won the championship on November 22, 1994.",
        "title": "A verified sporting anniversary",
        "fact": "A national team recorded a milestone victory on 22 November.",
        "source_title": "Official sporting archive",
        "source_url": source_url,
    }
    card.update(overrides)
    return {
        "output": [
            {
                "type": "web_search_call",
                "action": {"sources": [{"url": returned_url or source_url}]},
            },
            {
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps(card)}],
            },
        ]
    }


def test_openai_card_requires_the_source_to_come_from_search(monkeypatch):
    day = date(2026, 11, 22)
    official = "https://example.org/official-anniversary"
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(daily, "_request_openai", lambda _payload: openai_payload(official))
    assert daily._openai_fact(day)["source_url"] == official

    monkeypatch.setattr(
        daily,
        "_request_openai",
        lambda _payload: openai_payload(official, returned_url="https://example.org/different-page"),
    )
    assert daily.build_daily_celebration(day) == daily.verified_fallback(day)


@pytest.mark.parametrize(
    "overrides",
    [
        {"date_evidence": "The team lifted the cup on 1 January."},
        {"date_evidence": "The team lifted the cup that year."},
        {"fact": "The team lifted the cup on 1 January."},
        {"fact": "Find the results at https://example.org/official-anniversary."},
    ],
)
def test_openai_rejects_missing_or_conflicting_date_evidence_and_urls(monkeypatch, overrides):
    day = date(2026, 11, 22)
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(
        daily,
        "_request_openai",
        lambda _payload: openai_payload("https://example.org/official-anniversary", **overrides),
    )
    assert daily.build_daily_celebration(day) == daily.verified_fallback(day)


@pytest.mark.parametrize(
    "source_url",
    [
        "http://example.org/fact",
        "javascript:alert(1)",
        "https://wikipedia.org/wiki/Fact",
        "https://en.wikipedia.org/wiki/Fact",
        "not a URL",
    ],
)
def test_source_urls_must_be_https_and_not_blocked(source_url):
    with pytest.raises(ValueError):
        daily._normalize_url(source_url)


def test_openai_failures_and_unsafe_copy_use_the_guaranteed_fallback(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "test-key")
    monkeypatch.setattr(
        daily,
        "_request_openai",
        lambda _payload: (_ for _ in ()).throw(httpx.TimeoutException("provider timeout")),
    )
    assert daily.build_daily_celebration(date(2026, 1, 2))["title"] == "National Science Fiction Day"

    unsafe = openai_payload(
        "https://example.org/official-anniversary",
        fact="This anniversary tells everyone to drink beer today.",
    )
    monkeypatch.setattr(daily, "_request_openai", lambda _payload: unsafe)
    assert daily.build_daily_celebration(date(2026, 11, 22))["title"] == (
        "Independence Day in Lebanon"
    )


def test_preverified_fallback_is_used_without_an_openai_key(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    card = daily.build_daily_celebration(date(2026, 11, 22))
    assert card["title"] == "Independence Day in Lebanon"
    assert card["source_url"] == "https://bdl.gov.lb/bankingholidays.php"


def test_every_calendar_date_has_a_correct_sourced_fallback(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    first = date(2024, 1, 1)
    titles = set()
    for offset in range(366):
        day = first + timedelta(days=offset)
        card = daily.build_daily_celebration(day)
        assert daily._normalize_url(card["source_url"])
        assert not card["source_url"].startswith(daily.LEGACY_CALENDAR_SOURCE)
        assert 3 <= len(card["title"]) <= 140 and 10 <= len(card["fact"]) <= 360
        assert daily._dates_in(card["fact"]) == {(day.month, day.day)}
        titles.add(card["title"])
    assert len(titles) == 366
    assert daily.build_daily_celebration(date(2024, 2, 29))["title"] == "National Surf and Turf Day"


def test_common_year_ends_with_a_celebration(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    card = daily.build_daily_celebration(date(2025, 12, 31))
    assert card["fact"] == "Hogmanay is observed on 31 December."


def test_calendar_fallback_is_correct_across_a_full_gregorian_cycle():
    day = date(2000, 1, 1)
    end = date(2400, 1, 1)
    while day < end:
        card = daily.verified_fallback(day)
        assert daily._dates_in(card["fact"]) == {(day.month, day.day)}
        day += timedelta(days=1)


def test_daily_card_is_created_once_and_persisted_for_every_user(client, monkeypatch):
    first_user = auth(client)
    second_user = auth(client, "daily_fact_user_two")
    calls = []
    monkeypatch.setattr(main, "current_celebration_date", lambda: date(2026, 11, 22))
    monkeypatch.setattr(
        main,
        "build_daily_celebration",
        lambda day: calls.append(day) or {
            "title": "Independence Day in Lebanon",
            "fact": "Lebanon marks its Independence Day on 22 November.",
            "source_title": "Banque du Liban official banking holidays",
            "source_url": "https://bdl.gov.lb/bankingholidays.php",
        },
    )

    first = client.get("/daily-celebration", headers=first_user)
    second = client.get("/daily-celebration", headers=second_user)
    assert first.status_code == 200
    assert first.json() == second.json()
    assert first.json()["display_date"] == "22 NOV"
    assert calls == [date(2026, 11, 22)]
    with Session() as db:
        assert db.get(DailyCelebration, "2026-11-22").title == "Independence Day in Lebanon"


def test_concurrent_first_reads_generate_and_store_only_one_card(client, monkeypatch):
    headers = auth(client)
    calls = 0
    calls_lock = Lock()
    monkeypatch.setattr(main, "current_celebration_date", lambda: date(2026, 1, 2))

    def build(day):
        nonlocal calls
        with calls_lock:
            calls += 1
        time.sleep(0.05)
        return daily.verified_fallback(day)

    monkeypatch.setattr(main, "build_daily_celebration", build)
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(
            pool.map(lambda _index: client.get("/daily-celebration", headers=headers), range(4))
        )

    assert [response.status_code for response in responses] == [200, 200, 200, 200]
    assert len({response.json()["title"] for response in responses}) == 1
    assert calls == 1
    with Session() as db:
        assert db.query(DailyCelebration).count() == 1


def test_provider_unavailable_still_returns_a_daily_card(client, monkeypatch):
    headers = auth(client)
    monkeypatch.setattr(main, "current_celebration_date", lambda: date(2026, 1, 2))
    monkeypatch.setattr(settings, "openai_api_key", "test-key")

    def timeout(_payload):
        raise httpx.TimeoutException("provider timeout")

    monkeypatch.setattr(daily, "_request_openai", timeout)
    response = client.get("/daily-celebration", headers=headers)
    assert response.status_code == 200
    assert response.json()["date"] == "2026-01-02"
    assert response.json()["title"] == "National Science Fiction Day"


def test_prepare_buffer_retries_missing_dates_and_serves_prepared_card(client, monkeypatch):
    today = date(2026, 12, 29)
    upcoming = [today + timedelta(days=offset) for offset in range(1, 8)]
    missing = upcoming[2]
    calls = []

    def find(day):
        calls.append(day)
        if day == missing and calls.count(day) == 1:
            return None
        return {**daily.verified_fallback(day), "title": "Prepared celebration"}

    monkeypatch.setattr(main, "find_openai_celebration", find)
    asyncio.run(main.prepare_celebration_buffer(today))
    with Session() as db:
        assert db.get(DailyCelebration, today.isoformat()) is None
        assert db.get(DailyCelebration, missing.isoformat()) is None
        assert db.query(DailyCelebration).count() == 6

    asyncio.run(main.prepare_celebration_buffer(today))
    assert calls == [*upcoming, missing]
    with Session() as db:
        assert db.query(DailyCelebration).count() == 7

    def unexpected_generation(_day):
        pytest.fail("A prepared card must be served without a provider call")

    monkeypatch.setattr(main, "current_celebration_date", lambda: missing)
    monkeypatch.setattr(main, "build_daily_celebration", unexpected_generation)
    response = client.get("/daily-celebration", headers=auth(client))
    assert response.status_code == 200
    assert response.json()["title"] == "Prepared celebration"


def test_legacy_calendar_arithmetic_is_replaced_in_place(client, monkeypatch):
    day = date(2026, 1, 2)
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(main, "current_celebration_date", lambda: day)
    with Session() as db:
        db.add(DailyCelebration(
            date=day.isoformat(),
            title="Friday, 2 January",
            fact="2 January is day 2 of 2026, with 363 days remaining after today.",
            source_title="Timeanddate Weekday Calculator",
            source_url=f"{daily.LEGACY_CALENDAR_SOURCE}day=2&month=1&year=2026",
        ))
        db.commit()

    response = client.get("/daily-celebration", headers=auth(client))
    assert response.status_code == 200
    assert response.json()["title"] == "National Science Fiction Day"
    with Session() as db:
        assert db.query(DailyCelebration).count() == 1
        assert db.get(DailyCelebration, day.isoformat()).title == "National Science Fiction Day"


def test_daily_card_requires_authentication(client):
    response = client.get("/daily-celebration")
    assert response.status_code == 401
