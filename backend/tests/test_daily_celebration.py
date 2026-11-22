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
        json={"username": username, "password": "a-secure-password", "legal_age": True},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def openai_payload(source_url, *, returned_url=None):
    card = {
        "month_day": "11-22",
        "title": "A verified sporting anniversary",
        "fact": "A national team recorded a milestone victory on 22 November.",
        "source_title": "Official sporting archive",
        "source_url": source_url,
    }
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


def test_openai_card_requires_the_displayed_source_to_come_from_search(monkeypatch):
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
    fallback = daily.build_daily_celebration(date(2026, 1, 2))
    assert fallback["title"] == "Friday, 2 January"
    assert fallback["source_url"].startswith("https://www.timeanddate.com/date/weekday.html")


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
    assert daily.build_daily_celebration(date(2026, 1, 2))["fact"].startswith(
        "2 January is day 2"
    )

    unsafe = openai_payload("https://example.org/official-anniversary")
    unsafe_card = json.loads(unsafe["output"][1]["content"][0]["text"])
    unsafe_card["fact"] = "This anniversary tells everyone to drink beer today."
    unsafe["output"][1]["content"][0]["text"] = json.dumps(unsafe_card)
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
    for offset in range(366):
        day = first + timedelta(days=offset)
        card = daily.build_daily_celebration(day)
        assert card
        assert card["source_url"].startswith("https://")
        if (day.month, day.day) in daily.CURATED_FALLBACKS:
            continue
        day_number = offset + 1
        assert card["title"] == day.strftime("%A, %d %B").replace(" 0", " ")
        assert card["fact"] == (
            f"{day.strftime('%d %B').lstrip('0')} is day {day_number} of 2024, "
            f"with {366 - day_number} days remaining after today."
        )
        assert card["source_url"] == (
            "https://www.timeanddate.com/date/weekday.html"
            f"?day={day.day}&month={day.month}&year=2024"
        )


def test_common_year_calendar_fallback_ends_on_day_365(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    card = daily.build_daily_celebration(date(2025, 12, 31))
    assert card["fact"] == "31 December is day 365 of 2025, with 0 days remaining after today."


def test_calendar_fallback_is_correct_across_a_full_gregorian_cycle():
    day = date(2000, 1, 1)
    end = date(2400, 1, 1)
    while day < end:
        card = daily._calendar_fallback(day)
        day_number = day.timetuple().tm_yday
        days_in_year = 366 if day.replace(month=12, day=31).timetuple().tm_yday == 366 else 365
        assert f"day {day_number} of {day.year}" in card["fact"]
        assert f"with {days_in_year - day_number} days remaining" in card["fact"]
        assert f"day={day.day}&month={day.month}&year={day.year}" in card["source_url"]
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
        return daily._calendar_fallback(day)

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
    monkeypatch.setattr(
        main,
        "build_daily_celebration",
        lambda day: daily._calendar_fallback(day),
    )
    response = client.get("/daily-celebration", headers=headers)
    assert response.status_code == 200
    assert response.json()["date"] == "2026-01-02"
    assert response.json()["title"] == "Friday, 2 January"


def test_daily_card_requires_authentication(client):
    response = client.get("/daily-celebration")
    assert response.status_code == 401
