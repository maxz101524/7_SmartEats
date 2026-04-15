from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Iterable
from zoneinfo import ZoneInfo

import requests

logger = logging.getLogger(__name__)

UIUC_HOURS_URL = "https://web.housing.illinois.edu/diningmenus"
CENTRAL_TZ = ZoneInfo("America/Chicago")


@dataclass(frozen=True)
class HoursRow:
    dining_option_id: int
    date: dt.date
    time_period: str
    start_24: str
    end_24: str
    start_label: str
    end_label: str


class _HoursTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_table = False
        self._in_th = False
        self._in_td = False
        self._capture_text = False
        self._headers: list[str] = []
        self._current_row: list[str] = []
        self._rows: list[list[str]] = []

    @property
    def headers(self) -> list[str]:
        return self._headers

    @property
    def rows(self) -> list[list[str]]:
        return self._rows

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[override]
        if tag == "table":
            self._in_table = True
        if not self._in_table:
            return
        if tag == "th":
            self._in_th = True
            self._capture_text = True
        elif tag == "td":
            self._in_td = True
            self._capture_text = True
        elif tag == "tr":
            self._current_row = []

    def handle_endtag(self, tag: str) -> None:  # type: ignore[override]
        if tag == "table":
            self._in_table = False
            self._in_th = False
            self._in_td = False
            self._capture_text = False
            return
        if not self._in_table:
            return
        if tag == "th":
            self._in_th = False
            self._capture_text = False
        elif tag == "td":
            self._in_td = False
            self._capture_text = False
        elif tag == "tr":
            if self._headers and self._current_row:
                self._rows.append(self._current_row)
            self._current_row = []

    def handle_data(self, data: str) -> None:  # type: ignore[override]
        if not self._in_table or not self._capture_text:
            return
        text = " ".join(data.split()).strip()
        if not text:
            return
        if self._in_th:
            self._headers.append(text)
        elif self._in_td:
            self._current_row.append(text)


def fetch_hours_html(timeout_s: int = 10) -> str | None:
    try:
        resp = requests.get(UIUC_HOURS_URL, timeout=timeout_s)
        resp.raise_for_status()
        return resp.text
    except requests.exceptions.RequestException as exc:
        logger.warning("UIUC hours fetch error: %s", exc)
        return None


def _parse_date(value: str) -> dt.date | None:
    try:
        return dt.date.fromisoformat(value.strip())
    except ValueError:
        return None


def parse_hours_rows(html: str) -> list[HoursRow]:
    """
    Parse the DiningMenus hours table from the public page HTML.

    We look for a table with headers containing DiningOptionID/Date/Time Period/Start24/End24.
    """
    rows = _parse_hours_rows_from_html_table(html)
    if rows:
        return rows

    # Fallback: the site sometimes embeds the hours table as a pipe-delimited text block.
    # This handles the format rendered in the public page body (e.g. `| DiningOptionID | Date | ... |`).
    return _parse_hours_rows_from_pipe_table(html)


def _parse_hours_rows_from_html_table(html: str) -> list[HoursRow]:
    # The public page includes the hours as a hidden table with id="sTable".
    # Parse ONLY that table to avoid mixing headers/cells from other page tables.
    start = html.find('<table id="sTable"')
    if start == -1:
        start = html.find("<table id='sTable'")
    if start != -1:
        end = html.find("</table>", start)
        if end != -1:
            html = html[start : end + len("</table>")]

    parser = _HoursTableParser()
    parser.feed(html)

    headers = [h.lower().strip().replace("\xa0", " ") for h in parser.headers]
    if not headers:
        return []

    wanted = {
        "diningoptionid": "dining_option_id",
        "date": "date",
        "time period": "time_period",
        "start24": "start_24",
        "end24": "end_24",
        "start": "start_label",
        "end": "end_label",
    }

    index: dict[str, int] = {}
    for i, h in enumerate(headers):
        if h in wanted:
            index[wanted[h]] = i

    required = {"dining_option_id", "date", "time_period", "start_24", "end_24", "start_label", "end_label"}
    if not required.issubset(index.keys()):
        return []

    rows: list[HoursRow] = []
    for raw in parser.rows:
        if len(raw) < len(headers):
            continue
        parsed = _coerce_row(raw, index)
        if parsed:
            rows.append(parsed)

    return rows


def _parse_hours_rows_from_pipe_table(text: str) -> list[HoursRow]:
    header = "| DiningOptionID | Date | Day | Time Period | Start24 | End24 | Start | End |"
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    try:
        start_idx = next(i for i, ln in enumerate(lines) if ln.startswith(header))
    except StopIteration:
        return []

    # Expect a separator line next: `| --- | --- | ... |`
    data_lines = []
    for ln in lines[start_idx + 1 :]:
        if not ln.startswith("|"):
            break
        if ln.startswith("| ---"):
            continue
        data_lines.append(ln)

    index = {
        "dining_option_id": 0,
        "date": 1,
        "time_period": 3,
        "start_24": 4,
        "end_24": 5,
        "start_label": 6,
        "end_label": 7,
    }

    rows: list[HoursRow] = []
    for ln in data_lines:
        parts = [p.strip() for p in ln.strip("|").split("|")]
        parsed = _coerce_row(parts, index)
        if parsed:
            rows.append(parsed)
    return rows


def _coerce_row(raw: list[str], index: dict[str, int]) -> HoursRow | None:
    try:
        option_id = int(raw[index["dining_option_id"]])
    except (TypeError, ValueError, KeyError, IndexError):
        return None
    try:
        date_str = raw[index["date"]]
        time_period = raw[index["time_period"]]
        start_24 = raw[index["start_24"]]
        end_24 = raw[index["end_24"]]
        start_label = raw[index["start_label"]]
        end_label = raw[index["end_label"]]
    except (KeyError, IndexError):
        return None

    date_val = _parse_date(date_str)
    if not date_val:
        return None

    return HoursRow(
        dining_option_id=option_id,
        date=date_val,
        time_period=str(time_period).strip(),
        start_24=str(start_24).strip(),
        end_24=str(end_24).strip(),
        start_label=str(start_label).strip(),
        end_label=str(end_label).strip(),
    )


def _parse_hhmm_24(value: str) -> dt.time | None:
    try:
        return dt.datetime.strptime(value.strip(), "%H:%M").time()
    except ValueError:
        return None


def _period_window(row: HoursRow) -> tuple[dt.datetime, dt.datetime] | None:
    start_t = _parse_hhmm_24(row.start_24)
    end_t = _parse_hhmm_24(row.end_24)
    if not start_t or not end_t:
        return None
    start_dt = dt.datetime.combine(row.date, start_t, tzinfo=CENTRAL_TZ)
    end_dt = dt.datetime.combine(row.date, end_t, tzinfo=CENTRAL_TZ)
    if end_dt <= start_dt:
        end_dt += dt.timedelta(days=1)
    return start_dt, end_dt


def compute_status(
    rows: Iterable[HoursRow],
    now_dt: dt.datetime | None = None,
    option_ids: Iterable[int] | None = None,
) -> dict[int, dict[str, object]]:
    """
    Compute current status per dining option id.

    Returns:
      { option_id: { is_open: bool, meal_label: str|None, closes_at: str|None } }
    """
    now_local = (now_dt or dt.datetime.now(tz=CENTRAL_TZ)).astimezone(CENTRAL_TZ)
    today = now_local.date()

    by_option: dict[int, list[HoursRow]] = {}
    for row in rows:
        if row.date != today:
            continue
        by_option.setdefault(row.dining_option_id, []).append(row)

    if option_ids is None:
        option_ids = sorted(by_option.keys())

    status: dict[int, dict[str, object]] = {}
    for option_id in option_ids:
        active: HoursRow | None = None
        active_end: dt.datetime | None = None
        for row in by_option.get(option_id, []):
            window = _period_window(row)
            if not window:
                continue
            start_dt, end_dt = window
            if start_dt <= now_local < end_dt:
                active = row
                active_end = end_dt
                break

        if active and active_end:
            closes_at = active.end_label or active_end.strftime("%-I:%M %p")
            status[option_id] = {
                "is_open": True,
                "meal_label": active.time_period,
                "closes_at": closes_at,
            }
        else:
            status[option_id] = {
                "is_open": False,
                "meal_label": None,
                "closes_at": None,
            }

    return status

