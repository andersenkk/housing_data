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
med_house_prices = []
med_income = []

#Looping entire list of state names
for state_name, abbreviation in us_states.items():

    #Printing state_name to show where in sequence
    print(state_name)

    #URL for Median House Price MEDLISPRIC"State_Ab"
    url_med_house_price = f"https://api.stlouisfed.org/fred/series/observations?series_id=MEDLISPRI{abbreviation}&api_key={api_key}&file_type=json"
    with urlopen(url_med_house_price) as response:
        data = json.load(response)

    for observation in data["observations"]:
        if observation["value"] == ".":
            continue

        med_house_prices.append({
            "state": state_name,
            "date": observation["date"],
            "med_house_price": float(observation["value"]),
        })

    #URL for Median Household Income MEHOINUS"State_Ab"A646N
    url_med_hh_income = f"https://api.stlouisfed.org/fred/series/observations?series_id=MEHOINUS{abbreviation}A646N&api_key={api_key}&file_type=json"
    with urlopen(url_med_hh_income) as inc_response:
        inc_data = json.load(inc_response)

    for observation in inc_data["observations"]:
        if observation["value"] == ".":
            continue

        med_income.append({
            "state": state_name,
            "date": observation["date"],
            "med_income": float(observation["value"]),
        })


dataframe = pd.DataFrame(med_house_prices, columns=["state", "date", "med_house_price"])
dataframe.to_csv("median_listing_prices.csv", index=False)
dataframe.to_json("median_listing_prices.json", orient="records", indent=2)

dataframe = pd.DataFrame(med_income, columns=["state", "date", "med_income"])
dataframe.to_csv("median_incomes.csv", index=False)
dataframe.to_json("median_incomes.json", orient="records", indent=2)
#So I am converting these to CSV so I can inspect to make sure that the data is being
#Extracted properly. I will want to also convert these to JSON files so that the website can
#Display these properly... It might be good to convert this script to a function, so that I can 
#call the function in a differnt program... i.e. being javascript that the website will use...
#overall the extraction for this is pretty clean...
