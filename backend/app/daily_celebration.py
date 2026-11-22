import json
import re
from calendar import month_name
from datetime import date
from pathlib import Path
from random import choice
from urllib.parse import urlsplit, urlunsplit

import httpx

from .config import settings


RESPONSES_URL = "https://api.openai.com/v1/responses"
BLOCKED_SOURCE_HOSTS = {
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "tiktok.com",
    "wikipedia.org",
    "x.com",
}
DRINKING_WORDS = {"alcohol", "beer", "cocktail", "drink", "shot", "wine"}
LEGACY_CALENDAR_SOURCE = "https://www.timeanddate.com/date/weekday.html?"
CELEBRATION_THEMES = (
    "local festivals and traditions",
    "food, arts and crafts",
    "music, film and literature",
    "sport and games",
    "science and nature",
)
MONTHS = {name.casefold(): number for number, name in enumerate(month_name) if number}
MONTH_PATTERN = "|".join(MONTHS)
NAMED_DATE = re.compile(
    rf"\b(?:({MONTH_PATTERN})\s+(\d{{1,2}})(?:st|nd|rd|th)?"
    rf"|(\d{{1,2}})(?:st|nd|rd|th)?\s+(?:of\s+)?({MONTH_PATTERN}))\b",
    re.IGNORECASE,
)
ISO_DATE = re.compile(r"\b\d{4}-(\d{2})-(\d{2})\b")
URL_IN_COPY = re.compile(r"https?://|www\.", re.IGNORECASE)
VERIFIED_FALLBACKS = json.loads(
    Path(__file__).with_name("celebration_calendar.json").read_text(encoding="utf-8")
)


def verified_fallback(day: date) -> dict:
    title, source_title, source_url = VERIFIED_FALLBACKS[day.strftime("%m-%d")]
    return {
        "title": title,
        "fact": f"{title} is observed on {day.day} {month_name[day.month]}.",
        "source_title": source_title,
        "source_url": source_url,
    }


def _dates_in(text: str) -> set[tuple[int, int]]:
    named = {
        (MONTHS[(first_month or last_month).casefold()], int(last_day or first_day))
        for first_month, last_day, first_day, last_month in NAMED_DATE.findall(text)
    }
    return named | {(int(month), int(day)) for month, day in ISO_DATE.findall(text)}


def _normalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if parts.scheme != "https" or not parts.hostname:
        raise ValueError("The source must be an HTTPS URL")
    host = parts.hostname.casefold()
    if any(host == blocked or host.endswith(f".{blocked}") for blocked in BLOCKED_SOURCE_HOSTS):
        raise ValueError("The source must be an official or primary page")
    return urlunsplit((parts.scheme, parts.netloc.casefold(), parts.path.rstrip("/"), parts.query, ""))


def _response_text(payload: dict) -> str:
    texts = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                texts.append(content["text"])
    if not texts:
        raise ValueError("The response did not contain text")
    return "".join(texts)


def _response_sources(payload: dict) -> set[str]:
    urls = set()
    for item in payload.get("output", []):
        if item.get("type") != "web_search_call":
            continue
        for source in (item.get("action") or {}).get("sources") or []:
            if isinstance(source, dict) and isinstance(source.get("url"), str):
                try:
                    urls.add(_normalize_url(source["url"]))
                except ValueError:
                    continue
    return urls


def _request_openai(payload: dict) -> dict:
    response = httpx.post(
        RESPONSES_URL,
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        json=payload,
        timeout=25,
    )
    response.raise_for_status()
    return response.json()


def _openai_fact(day: date) -> dict | None:
    if not settings.openai_api_key:
        return None
    schema = {
        "type": "object",
        "properties": {
            "date_evidence": {"type": "string"},
            "title": {"type": "string"},
            "fact": {"type": "string"},
            "source_title": {"type": "string"},
            "source_url": {"type": "string"},
        },
        "required": ["date_evidence", "title", "fact", "source_title", "source_url"],
        "additionalProperties": False,
    }
    prompt = f"""
Find one real celebration anywhere in the world for {day.isoformat()} ({day.strftime('%d %B')}).
Prefer an event taking place on this exact date, a fixed annual observance, or a positive anniversary of an event on this month and day. Prefer the theme {choice(CELEBRATION_THEMES)} when a suitable example exists.
Use web search to find a primary source, such as the organizer, government, institution, league, museum or archive. Return a brief quotation in date_evidence that names the event and gives its date in English using the full month name, or gives an ISO date. Use the exact HTTPS page for source_url.
Avoid deaths, disasters, war, crime, politics, religious persuasion, and instructions to consume alcohol.
Write a short title and one factual sentence under 240 characters. Keep URLs and source credits out of the title and fact. Use an empty date_evidence when no primary source supports the celebration date.
""".strip()
    payload = _request_openai(
        {
            "model": settings.openai_daily_fact_model,
            "store": False,
            "reasoning": {"effort": "low"},
            "tools": [{"type": "web_search", "search_context_size": "low"}],
            "tool_choice": "required",
            "include": ["web_search_call.action.sources"],
            "input": prompt,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "daily_celebration",
                    "strict": True,
                    "schema": schema,
                }
            },
        }
    )
    data = json.loads(_response_text(payload))
    expected_dates = {(day.month, day.day)}
    if _dates_in(data.get("date_evidence", "")) != expected_dates:
        raise ValueError("The search evidence must give the requested calendar date")
    source_url = _normalize_url(data.get("source_url", ""))
    if source_url not in _response_sources(payload):
        raise ValueError("The source was not returned by web search")
    title = " ".join(str(data.get("title", "")).split())
    fact = " ".join(str(data.get("fact", "")).split())
    source_title = " ".join(str(data.get("source_title", "")).split())
    if _dates_in(f"{title} {fact}") - expected_dates:
        raise ValueError("The card mentions a conflicting calendar date")
    if URL_IN_COPY.search(f"{title} {fact}"):
        raise ValueError("The card text must not contain URLs")
    if not (3 <= len(title) <= 140 and 10 <= len(fact) <= 360 and 3 <= len(source_title) <= 180):
        raise ValueError("The generated card has invalid text lengths")
    words = {word.strip(".,:;!?()[]{}\"'").casefold() for word in f"{title} {fact}".split()}
    if words & DRINKING_WORDS:
        raise ValueError("The generated card must not encourage drinking")
    return {
        "title": title,
        "fact": fact,
        "source_title": source_title,
        "source_url": source_url,
    }


def find_openai_celebration(day: date) -> dict | None:
    try:
        return _openai_fact(day)
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def build_daily_celebration(day: date) -> dict:
    return find_openai_celebration(day) or verified_fallback(day)
