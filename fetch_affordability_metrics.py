import csv
import json
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd

from state_name_abb import us_states

API_URL = "https://api.stlouisfed.org/fred/series/observations"
API_KEY = "06c30a349ad2f1a1858cd6a345fd9d98"
DATA_PATH = Path(__file__).resolve().parent / "affordability_metrics.json"
CSV_PATH = Path(__file__).resolve().parent / "affordability_metrics.csv"
OUTPUT_COLUMNS = ["state", "date", "metric", "frequency", "value"]

SOURCE_METRICS = (
    ("median_listing_price", "monthly", "MEDLISPRI{abbreviation}"),
    ("median_household_income", "annual", "MEHOINUS{abbreviation}A646N"),
    ("house_price_index", "quarterly", "{abbreviation}STHPI"),
)
DERIVED_METRICS = {"price_to_income_ratio"}
LEGACY_METRIC_NAMES = {"home_price_growth_ratio": "house_price_index"}


def observation_key(row):
    return row["state"], row["metric"], row["date"]


def load_existing_rows():
    if not DATA_PATH.exists():
        return {}

    with DATA_PATH.open(encoding="utf-8") as data_file:
        rows = json.load(data_file)

    existing = {}
    for row in rows:
        metric = LEGACY_METRIC_NAMES.get(row["metric"], row["metric"])
        if metric in DERIVED_METRICS:
            continue

        normalized = {
            "state": row["state"],
            "date": row["date"],
            "metric": metric,
            "frequency": row["frequency"],
            "value": float(row["value"]),
        }
        existing[observation_key(normalized)] = normalized
    return existing


def fetch_new_observations(state_name, abbreviation, metric, frequency, series_template, existing):
    series_id = series_template.format(abbreviation=abbreviation)
    matching_dates = [
        row["date"]
        for row in existing.values()
        if row["state"] == state_name and row["metric"] == metric
    ]

    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
    }
    if matching_dates:
        latest_saved_date = date.fromisoformat(max(matching_dates))
        params["observation_start"] = (latest_saved_date + timedelta(days=1)).isoformat()

    url = f"{API_URL}?{urlencode(params)}"
    with urlopen(url, timeout=30) as response:
        response_data = json.load(response)

    added_or_updated = 0
    for observation in response_data.get("observations", []):
        if observation["value"] == ".":
            continue

        row = {
            "state": state_name,
            "date": observation["date"],
            "metric": metric,
            "frequency": frequency,
            "value": float(observation["value"]),
        }
        key = observation_key(row)
        if key in existing:
            continue
        existing[key] = row
        added_or_updated += 1

    return added_or_updated


def build_price_to_income_rows(raw_rows):
    prices_by_state_year = {}
    incomes_by_state_year = {}

    for row in raw_rows:
        year = row["date"][:4]
        state = row["state"]
        if row["metric"] == "median_listing_price":
            prices_by_state_year.setdefault((state, year), {})[row["date"][5:7]] = row["value"]
        elif row["metric"] == "median_household_income":
            incomes_by_state_year[(state, year)] = row["value"]

    ratios = []
    for (state, year), monthly_prices in prices_by_state_year.items():
        income = incomes_by_state_year.get((state, year))
        if len(monthly_prices) != 12 or income is None:
            continue

        annual_average_price = sum(monthly_prices.values()) / 12
        ratios.append({
            "state": state,
            "date": f"{year}-01-01",
            "metric": "price_to_income_ratio",
            "frequency": "annual",
            "value": annual_average_price / income,
        })
    return ratios


def save_rows(rows):
    rows.sort(key=lambda row: (row["state"], row["metric"], row["date"]))
    dataframe = pd.DataFrame(rows, columns=OUTPUT_COLUMNS)
    dataframe.to_csv(CSV_PATH, index=False)
    dataframe.to_json(DATA_PATH, orient="records", indent=2)


def main():
    if API_KEY == "PASTE_YOUR_FRED_API_KEY_HERE":
        raise SystemExit("Paste your FRED API key into the API_KEY setting near the top of this file.")

    existing = load_existing_rows()
    updates = 0
    for state_name, abbreviation in us_states.items():
        print(f"Refreshing {state_name}...")
        for metric, frequency, series_template in SOURCE_METRICS:
            updates += fetch_new_observations(
                state_name,
                abbreviation,
                metric,
                frequency,
                series_template,
                existing,
            )

    raw_rows = list(existing.values())
    rows = raw_rows + build_price_to_income_rows(raw_rows)
    save_rows(rows)
    print(f"Updated {updates} source observations; saved {len(rows)} total rows.")


if __name__ == "__main__":
    main()