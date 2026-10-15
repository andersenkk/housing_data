import json
import os
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
import us
import pandas as pd

#API Key for FRED Stats
api_key = "06c30a349ad2f1a1858cd6a345fd9d98"

#importing state dictionary
from state_name_abb import us_states

#creating empty lists to store median house prices and income
affordability_metrics = []

#Looping entire list of state names
for state_name, abbreviation in us_states.items():

    #Printing state_name to show where in sequence
    print(state_name)

    #URL for Median House Price MEDLISPRIC"State_Ab"
    url_med_list_price = f"https://api.stlouisfed.org/fred/series/observations?series_id=MEDLISPRI{abbreviation}&api_key={api_key}&file_type=json"
    with urlopen(url_med_list_price) as med_list_price_response:
        med_list_price_data = json.load(med_list_price_response)

    #creating dictionary to store median listing prices to eventually calculate average
    prices_by_year = {}

    #Comments
    for med_list_price_observation in med_list_price_data["observations"]:
        if med_list_price_observation["value"] == ".":
            continue

        #capturing monthly median list price for year year of data
        year = med_list_price_observation["date"][:4]
        price = float(med_list_price_observation["value"])
        prices_by_year.setdefault(year, []).append(price)

        #appending median list price to dataframe
        affordability_metrics.append({
            "state": state_name,
            "date": med_list_price_observation["date"],
            "frequency": "monthly",
            "metric": "median_listing_price",
            "value": float(med_list_price_observation["value"]),
        })

    #URL for Median Household Income MEHOINUS"State_Ab"A646N
    url_med_hh_inc = f"https://api.stlouisfed.org/fred/series/observations?series_id=MEHOINUS{abbreviation}A646N&api_key={api_key}&file_type=json"
    with urlopen(url_med_hh_inc) as med_hh_inc_response:
        med_hh_inc_data = json.load(med_hh_inc_response)

    #creating method to capture income for each year
    income_by_year = {}

    for med_hh_inc_observation in med_hh_inc_data["observations"]:
        if med_hh_inc_observation["value"] == ".":
            continue

        #caputuring median hh income for each year...
        year = med_hh_inc_observation["date"][:4]
        income = float(med_hh_inc_observation["value"])
        income_by_year[year] = income

        affordability_metrics.append({
            "state": state_name,
            "date": med_hh_inc_observation["date"],
            "frequency": "annual",
            "metric": "median_household_income",
            "value": float(med_hh_inc_observation["value"]),
        })

    #calculating affordability metrics
    for year, monthly_prices in prices_by_year.items():
        if len(monthly_prices) != 12 or year not in income_by_year:
            continue

        annual_average_price = sum(monthly_prices) / 12
        ratio = annual_average_price / income_by_year[year]

        affordability_metrics.append({
            "state": state_name,
            "date": f"{year}-01-01",
            "frequency": "annual",
            "metric": "price_to_income_ratio",
            "value": ratio,
        })

dataframe = pd.DataFrame(affordability_metrics, columns=["state", "date","metric","frequency","value"])
dataframe.to_csv("affordability_metrics.csv", index=False)
dataframe.to_json("affordability_metrics.json", orient="records", indent=2)
