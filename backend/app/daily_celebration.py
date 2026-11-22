import json
from calendar import isleap
from datetime import date
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
CURATED_FALLBACKS = {
    (11, 22): {
        "title": "Independence Day in Lebanon",
        "fact": "Lebanon marks its Independence Day on 22 November.",
        "source_title": "Banque du Liban official banking holidays",
        "source_url": "https://bdl.gov.lb/bankingholidays.php",
    },
}


def _calendar_fallback(day: date) -> dict:
    """Return a sourced fact that is correct for every Gregorian date."""
    day_number = day.timetuple().tm_yday
    days_in_year = 366 if isleap(day.year) else 365
    days_left = days_in_year - day_number
    return {
        "title": day.strftime("%A, %d %B").replace(" 0", " "),
        "fact": (
            f"{day.strftime('%d %B').lstrip('0')} is day {day_number} of {day.year}, "
            f"with {days_left} days remaining after today."
        ),
        "source_title": "Timeanddate Weekday Calculator",
        "source_url": (
            "https://www.timeanddate.com/date/weekday.html"
            f"?day={day.day}&month={day.month}&year={day.year}"
        ),
    }


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
        for source in item.get("action", {}).get("sources", []):
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
    month_day = day.strftime("%m-%d")
    schema = {
        "type": "object",
        "properties": {
            "month_day": {"type": "string"},
            "title": {"type": "string"},
            "fact": {"type": "string"},
            "source_title": {"type": "string"},
            "source_url": {"type": "string"},
        },
        "required": ["month_day", "title", "fact", "source_title", "source_url"],
        "additionalProperties": False,
    }
    prompt = f"""
Find one real, light reason to celebrate that occurs every year or occurred historically on {day.strftime('%B %d')}.
Prefer an official festival, holiday, cultural tradition, sporting achievement, entertainment milestone, or positive science anniversary.
Use web search and cite an official organizer, government, institution, league, club, museum, archive, or other primary source that explicitly confirms the date.
Avoid deaths, disasters, war, crime, politics, religious persuasion, and instructions to consume alcohol.
Write a short title and one factual sentence under 240 characters. Return month_day as {month_day} and source_url as the exact HTTPS page used.
""".strip()
    payload = _request_openai(
        {
            "model": settings.openai_daily_fact_model,
            "store": False,
            "reasoning": {"effort": "low"},
            "tools": [{"type": "web_search", "search_context_size": "low"}],
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
    if data.get("month_day") != month_day:
        raise ValueError("The response used the wrong calendar date")
    source_url = _normalize_url(data.get("source_url", ""))
    if source_url not in _response_sources(payload):
        raise ValueError("The displayed source was not returned by web search")
    title = " ".join(str(data.get("title", "")).split())
    fact = " ".join(str(data.get("fact", "")).split())
    source_title = " ".join(str(data.get("source_title", "")).split())
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


def build_daily_celebration(day: date) -> dict:
    try:
        generated = _openai_fact(day)
        if generated:
            return generated
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        pass
    return CURATED_FALLBACKS.get((day.month, day.day)) or _calendar_fallback(day)
