const mapContainer = document.querySelector("#us-map");

if (mapContainer) {
  const mapUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
  const dataUrl = "affordability_metrics.json";
  const metricSelect = document.querySelector("#metric-filter");
  const yearSelect = document.querySelector("#year-filter");
  const monthSelect = document.querySelector("#month-filter");
  const startYearSelect = document.querySelector("#start-year");
  const endYearSelect = document.querySelector("#end-year");
  const playbackButton = document.querySelector("#playback-toggle");
  const playbackYear = document.querySelector("#playback-year");
  const legendMin = document.querySelector("#legend-min");
  const legendMax = document.querySelector("#legend-max");
  const statePicker = document.querySelector("#state-filter");
  const stateFilterList = document.querySelector("#state-filter-list");
  const filterStatus = document.querySelector("#filter-status");
  const playbackInterval = 350;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const metricLabels = {
    house_price_index: "House price index",
    median_listing_price: "Median listing price",
    median_household_income: "Median household income",
    price_to_income_ratio: "Price-to-income ratio",
    housing_price_growth_relative_to_income: "Housing price growth relative to income",
  };
  const relativeGrowthMetric = "housing_price_growth_relative_to_income";

  Promise.all([d3.json(mapUrl), d3.json(dataUrl)])
    .then(([topology, dataRows]) => {
      const states = topojson.feature(topology, topology.objects.states);
      states.features = states.features.filter((state) => Number(state.id) <= 56);
      const width = 960;
      const height = 600;
      const projection = d3.geoAlbersUsa().fitSize([width, height], states);
      const path = d3.geoPath(projection);
      const svg = d3
        .select(mapContainer)
        .html("")
        .append("svg")
        .attr("class", "us-map")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "us-map-title");

      const tooltip = d3
        .select(mapContainer)
        .append("div")
        .attr("class", "map-tooltip")
        .attr("role", "status")
        .attr("aria-live", "polite")
        .attr("hidden", true);

      const stateNames = states.features.map((state) => state.properties.name);
      const selectedStates = new Set(stateNames);
      const annualHpiByStateYear = new Map();
      const annualIncomeByStateYear = new Map();
      for (const row of dataRows) {
        const year = row.date.slice(0, 4);
        if (row.metric === "house_price_index" && row.date.slice(5, 7) === "10") {
          annualHpiByStateYear.set(`${row.state}|${year}`, Number(row.value));
        } else if (row.metric === "median_household_income") {
          annualIncomeByStateYear.set(`${row.state}|${year}`, Number(row.value));
        }
      }
      let activeStateNode = null;
      let pointerPosition = null;
      let playbackTimer = null;
      let colorScale = null;

      function formatMetricValue(row) {
        if (row.metric === "house_price_index") {
          return Number(row.value).toFixed(2);
        }
        if (row.metric === "price_to_income_ratio") {
          return `${Number(row.value).toFixed(1)}× annual income`;
        }
        if (row.metric === relativeGrowthMetric) {
          const value = Number(row.value);
          const sign = value > 0 ? "+" : value < 0 ? "−" : "";
          return `${sign}${Math.abs(value).toFixed(1)}%`;
        }
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(Number(row.value));
      }

      function formatObservationDate(row) {
        if (row.metric === "house_price_index") return `Q4 ${row.date.slice(0, 4)}`;
        if (row.frequency === "annual") return row.date.slice(0, 4);
        return new Intl.DateTimeFormat("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${row.date}T00:00:00Z`));
      }

      function selectedMetricRows() {
        const metric = metricSelect.value;
        const year = yearSelect.value;
        if (metric === relativeGrowthMetric) {
          return buildRelativeGrowthRows(Number(startYearSelect.value), Number(year));
        }
        const frequency = dataRows.find((row) => row.metric === metric)?.frequency;
        return dataRows.filter((row) => {
          if (row.metric !== metric || row.date.slice(0, 4) !== year) return false;
          if (metric === "house_price_index") return row.date.slice(5, 7) === "10";
          return frequency !== "monthly" || row.date.slice(5, 7) === monthSelect.value;
        });
      }

      function metricRangeRows() {
        const metric = metricSelect.value;
        const startYear = Number(startYearSelect.value);
        const endYear = Number(endYearSelect.value);
        if (metric === relativeGrowthMetric) {
          return buildRelativeGrowthRows(startYear, endYear);
        }
        const isMonthly = dataRows.some((row) => row.metric === metric && row.frequency === "monthly");

        return dataRows.filter((row) => {
          const year = Number(row.date.slice(0, 4));
          if (row.metric !== metric || year < startYear || year > endYear) return false;
          if (metric === "house_price_index") return row.date.slice(5, 7) === "10";
          return !isMonthly || row.date.slice(5, 7) === monthSelect.value;
        });
      }

      function getAvailableYears(metric) {
        if (metric === relativeGrowthMetric) {
          const years = new Set();
          for (const key of annualHpiByStateYear.keys()) {
            const [state, year] = key.split("|");
            if (annualIncomeByStateYear.has(`${state}|${year}`)) years.add(year);
          }
          return [...years].sort();
        }
        return [...new Set(
          dataRows
            .filter((row) => row.metric === metric
              && (metric !== "house_price_index" || row.date.slice(5, 7) === "10"))
            .map((row) => row.date.slice(0, 4)),
        )].sort();
      }

      function buildRelativeGrowthRows(baselineYear, throughYear) {
        if (!Number.isFinite(baselineYear) || !Number.isFinite(throughYear)) return [];
        const rows = [];
        for (const state of stateNames) {
          const baselineKey = `${state}|${baselineYear}`;
          const baselineHpi = annualHpiByStateYear.get(baselineKey);
          const baselineIncome = annualIncomeByStateYear.get(baselineKey);
          if (!baselineHpi || !baselineIncome) continue;

          for (let year = baselineYear; year <= throughYear; year += 1) {
            const key = `${state}|${year}`;
            const hpi = annualHpiByStateYear.get(key);
            const income = annualIncomeByStateYear.get(key);
            if (!hpi || !income) continue;

            const baselinePriceToIncome = baselineHpi / baselineIncome;
            const currentPriceToIncome = hpi / income;
            rows.push({
              state,
              date: `${year}-01-01`,
              metric: relativeGrowthMetric,
              frequency: "annual",
              value: (currentPriceToIncome / baselinePriceToIncome - 1) * 100,
            });
          }
        }
        return rows;
      }

      function updateLegend(values) {
        if (!values.length) {
          legendMin.textContent = "No data";
          legendMax.textContent = "No data";
          colorScale = null;
          return;
        }

        const minimum = Math.min(...values);
        const maximum = Math.max(...values);
        colorScale = minimum === maximum
          ? () => "#f4e6a5"
          : d3.scaleSequential(d3.interpolateRdYlGn).domain([maximum, minimum]);
        legendMin.textContent = formatMetricValue({ metric: metricSelect.value, value: minimum });
        legendMax.textContent = formatMetricValue({ metric: metricSelect.value, value: maximum });
      }

      function updateFilterStatus(rows) {
        const selectedMonth = monthSelect.disabled ? "" : `, ${monthNames[Number(monthSelect.value) - 1]}`;
        const selectedLabel = metricLabels[metricSelect.value] || metricSelect.value;
        const selectedCount = new Set(rows
          .filter((row) => selectedStates.has(row.state)
            && row.date.slice(0, 4) === yearSelect.value)
          .map((row) => row.state)).size;
        filterStatus.textContent = `${selectedLabel} · ${yearSelect.value}${selectedMonth} · ${selectedCount} selected states with data`;
        playbackYear.value = yearSelect.value || "—";
      }

      function stopPlayback() {
        if (playbackTimer !== null) {
          window.clearInterval(playbackTimer);
          playbackTimer = null;
        }
        playbackButton.querySelector(".playback-icon").innerHTML = "&#9654;";
        playbackButton.querySelector(".playback-button-label").textContent = "Play";
        playbackButton.setAttribute("aria-label", "Play year-by-year map animation");
        playbackButton.setAttribute("aria-pressed", "false");
      }

      function advancePlayback() {
        const years = [...new Set(
          metricRangeRows().map((row) => row.date.slice(0, 4)),
        )].sort();
        const currentIndex = years.indexOf(yearSelect.value);
        if (currentIndex < 0 || currentIndex >= years.length - 1) {
          stopPlayback();
          return;
        }
        yearSelect.value = years[currentIndex + 1];
        populateMonthOptions();
      }

      function togglePlayback() {
        if (playbackTimer !== null) {
          stopPlayback();
          return;
        }

        const startYear = Number(startYearSelect.value);
        const finishYear = Number(endYearSelect.value);
        if (!Number.isFinite(startYear) || !Number.isFinite(finishYear) || startYear > finishYear) return;

        const isMonthly = dataRows.some((row) => row.metric === metricSelect.value && row.frequency === "monthly");
        const availableYears = getAvailableYears(metricSelect.value).filter((year) => {
          const numericYear = Number(year);
          if (numericYear < startYear || numericYear > finishYear) return false;
          return !isMonthly || dataRows.some((row) => row.metric === metricSelect.value
            && row.date.slice(0, 4) === year
            && row.date.slice(5, 7) === monthSelect.value);
        });

        if (!availableYears.length) return;
        if (!availableYears.includes(yearSelect.value) || Number(yearSelect.value) >= finishYear) {
          yearSelect.value = availableYears[0];
          populateMonthOptions();
        }

        playbackButton.querySelector(".playback-icon").innerHTML = "&#10074;&#10074;";
        playbackButton.querySelector(".playback-button-label").textContent = "Pause";
        playbackButton.setAttribute("aria-label", "Pause year-by-year map animation");
        playbackButton.setAttribute("aria-pressed", "true");
        playbackTimer = window.setInterval(advancePlayback, playbackInterval);
      }

      function positionTooltip(stateNode, event) {
        const bounds = mapContainer.getBoundingClientRect();
        if (event && event.type.startsWith("pointer")) {
          pointerPosition = {
            x: event.clientX - bounds.left,
            y: event.clientY - bounds.top,
          };
        }
        const point = pointerPosition || (() => {
          const stateBounds = stateNode.getBoundingClientRect();
          return {
            x: stateBounds.left + stateBounds.width / 2 - bounds.left,
            y: stateBounds.top + stateBounds.height / 2 - bounds.top,
          };
        })();
        const tooltipWidth = 230;
        const tooltipHeight = 105;
        tooltip
          .style("left", `${Math.max(8, Math.min(point.x + 14, bounds.width - tooltipWidth - 8))}px`)
          .style("top", `${Math.max(8, Math.min(point.y + 14, bounds.height - tooltipHeight - 8))}px`);
      }

      function showStateDetails(event, state) {
        activeStateNode = this;
        const name = state.properties.name;
        const row = selectedMetricRows().find((item) => item.state === name
          && item.date.slice(0, 4) === yearSelect.value);

        tooltip
          .html("")
          .append("strong")
          .text(name);

        if (row) {
          tooltip.append("span").text(formatMetricValue(row));
          tooltip
            .append("small")
            .text(row.metric === relativeGrowthMetric
              ? `${metricLabels[row.metric]} · ${startYearSelect.value} baseline · ${formatObservationDate(row)}`
              : `${metricLabels[row.metric] || row.metric} · ${formatObservationDate(row)}`);
        } else {
          tooltip.append("span").text("No data for this selection");
          tooltip
            .append("small")
            .text(`${metricLabels[metricSelect.value] || metricSelect.value} · ${yearSelect.value}`);
        }

        tooltip
          .attr("hidden", null)
          .call(() => positionTooltip(this, event));
      }

      function hideStateDetails() {
        activeStateNode = null;
        pointerPosition = null;
        tooltip.attr("hidden", true);
      }

      function refreshMap() {
        const rows = selectedMetricRows();
        const rowsByState = new Map(rows.map((row) => [row.state, row]));
        const metric = metricSelect.value;
        const rangeValues = metricRangeRows().map((row) => Number(row.value)).filter(Number.isFinite);
        updateLegend(rangeValues);

        svg.selectAll(".state-shape")
          .classed("is-filtered-out", (state) => !selectedStates.has(state.properties.name))
          .style("fill", (state) => {
            const name = state.properties.name;
            const row = rowsByState.get(name);
            if (!selectedStates.has(name)) return "#e3e8e5";
            if (!row || !colorScale) return "#d9ddda";
            return colorScale(Number(row.value));
          })
          .attr("aria-label", (state) => {
            const name = state.properties.name;
            const row = rowsByState.get(name);
            return row
              ? `${name}: ${formatMetricValue(row)}, ${formatObservationDate(row)}`
              : `${name}: no data for selected ${metricLabels[metric] || metric} period`;
          })
          .select("title")
          .text((state) => {
            const name = state.properties.name;
            const row = rowsByState.get(name);
            return row
              ? `${name}: ${formatMetricValue(row)} (${formatObservationDate(row)})`
              : `${name}: no data for this selection`;
          });

        updateFilterStatus(rows);
        if (activeStateNode && activeStateNode.matches(":hover, :focus")) {
          const state = d3.select(activeStateNode).datum();
          showStateDetails.call(activeStateNode, null, state);
        } else {
          tooltip.attr("hidden", true);
        }
      }

      function populateYearOptions() {
        stopPlayback();
        const years = getAvailableYears(metricSelect.value).reverse();
        yearSelect.replaceChildren(...years.map((year) => new Option(year, year)));
        yearSelect.disabled = years.length === 0;
        playbackButton.disabled = years.length < 2;
        const ascendingYears = [...years].reverse();
        startYearSelect.replaceChildren(...ascendingYears.map((year) => new Option(year, year)));
        endYearSelect.replaceChildren(...ascendingYears.map((year) => new Option(year, year)));
        startYearSelect.disabled = years.length === 0;
        endYearSelect.disabled = years.length === 0;
        if (ascendingYears.length) {
          startYearSelect.value = ascendingYears[0];
          endYearSelect.value = ascendingYears[ascendingYears.length - 1];
          yearSelect.value = ascendingYears[ascendingYears.length - 1];
        }
        document.querySelector('label[for="year-filter"]').textContent =
          metricSelect.value === relativeGrowthMetric
            ? "Compare year"
            : metricSelect.value === "house_price_index" ? "Year (Q4)" : "Year";
        populateMonthOptions();
      }

      function populateMonthOptions() {
        const monthly = dataRows.some((row) => row.metric === metricSelect.value && row.frequency === "monthly");
        const previousMonth = monthSelect.value;
        const months = monthly ? [...new Set(
          dataRows
            .filter((row) => row.metric === metricSelect.value && row.date.slice(0, 4) === yearSelect.value)
            .map((row) => row.date.slice(5, 7)),
        )].sort().reverse() : [];

        monthSelect.replaceChildren(...months.map((month) => new Option(
          monthNames[Number(month) - 1],
          month,
        )));
        monthSelect.disabled = !monthly || months.length === 0;
        if (months.length === 0) {
          monthSelect.add(new Option("Not applicable", "not-applicable"));
        } else if (months.includes(previousMonth)) {
          monthSelect.value = previousMonth;
        }
        refreshMap();
      }

      function updateStateSummary() {
        const summary = statePicker.querySelector("summary");
        summary.textContent = selectedStates.size === stateNames.length
          ? "All states"
          : `${selectedStates.size} of ${stateNames.length} states`;
      }

      function renderStateOptions() {
        const options = stateNames.map((name) => {
          const label = document.createElement("label");
          label.className = "state-option";
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = name;
          checkbox.checked = true;
          const text = document.createElement("span");
          text.textContent = name;
          label.append(checkbox, text);
          return label;
        });
        stateFilterList.replaceChildren(...options);
        updateStateSummary();
      }

      svg.append("title")
        .attr("id", "us-map-title")
        .text("Map of the United States divided by state");

      svg.selectAll("path")
        .data(states.features)
        .join("path")
        .attr("class", "state-shape")
        .attr("d", path)
        .attr("tabindex", 0)
        .on("pointerenter pointermove", showStateDetails)
        .on("pointerleave", hideStateDetails)
        .on("focus", showStateDetails)
        .on("blur", hideStateDetails)
        .append("title")
        .text((state) => state.properties.name);

      const metrics = [...new Set(dataRows.map((row) => row.metric))]
        .filter((metric) => metric !== "house_price_index")
        .concat("house_price_index", relativeGrowthMetric);
      metricSelect.replaceChildren(...metrics.map((metric) => new Option(
        metricLabels[metric] || metric.replaceAll("_", " "),
        metric,
      )));
      metricSelect.disabled = metrics.length === 0;
      renderStateOptions();
      populateYearOptions();

      metricSelect.addEventListener("change", populateYearOptions);
      yearSelect.addEventListener("change", () => {
        stopPlayback();
        if (Number(yearSelect.value) < Number(startYearSelect.value)) {
          startYearSelect.value = yearSelect.value;
        }
        endYearSelect.value = yearSelect.value;
        populateMonthOptions();
      });
      monthSelect.addEventListener("change", () => {
        stopPlayback();
        refreshMap();
      });
      playbackButton.addEventListener("click", togglePlayback);
      startYearSelect.addEventListener("change", () => {
        stopPlayback();
        if (Number(startYearSelect.value) > Number(endYearSelect.value)) {
          endYearSelect.value = startYearSelect.value;
        }
        if (metricSelect.value === relativeGrowthMetric) {
          const validTargetYears = getAvailableYears(relativeGrowthMetric)
            .filter((year) => Number(year) >= Number(startYearSelect.value)
              && Number(year) <= Number(endYearSelect.value))
            .reverse();
          yearSelect.replaceChildren(...validTargetYears.map((year) => new Option(year, year)));
          if (!validTargetYears.includes(yearSelect.value)) {
            yearSelect.value = startYearSelect.value;
          }
        }
        if (Number(yearSelect.value) < Number(startYearSelect.value)) {
          yearSelect.value = startYearSelect.value;
          populateMonthOptions();
        } else {
          refreshMap();
        }
      });
      endYearSelect.addEventListener("change", () => {
        stopPlayback();
        if (Number(endYearSelect.value) < Number(startYearSelect.value)) {
          startYearSelect.value = endYearSelect.value;
        }
        if (metricSelect.value === relativeGrowthMetric) {
          const validTargetYears = getAvailableYears(relativeGrowthMetric)
            .filter((year) => Number(year) >= Number(startYearSelect.value)
              && Number(year) <= Number(endYearSelect.value))
            .reverse();
          yearSelect.replaceChildren(...validTargetYears.map((year) => new Option(year, year)));
          if (!validTargetYears.includes(yearSelect.value)) {
            yearSelect.value = endYearSelect.value;
          }
        }
        if (Number(yearSelect.value) > Number(endYearSelect.value)) {
          yearSelect.value = endYearSelect.value;
          populateMonthOptions();
        } else {
          refreshMap();
        }
      });
      stateFilterList.addEventListener("change", (event) => {
        if (event.target.matches('input[type="checkbox"]')) {
          if (event.target.checked) selectedStates.add(event.target.value);
          else selectedStates.delete(event.target.value);
          updateStateSummary();
          refreshMap();
        }
      });
      document.querySelector("#select-all-states").addEventListener("click", () => {
        stateFilterList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
          checkbox.checked = true;
          selectedStates.add(checkbox.value);
        });
        updateStateSummary();
        refreshMap();
      });
      document.querySelector("#clear-states").addEventListener("click", () => {
        stateFilterList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
          checkbox.checked = false;
          selectedStates.delete(checkbox.value);
        });
        updateStateSummary();
        refreshMap();
      });
    })
    .catch(() => {
      const message = document.createElement("p");
      message.className = "map-status";
      message.dataset.error = "true";
      message.textContent = "The map could not load. Check your internet connection and reload.";
      mapContainer.replaceChildren(message);
    });
}

document.querySelectorAll(".dashboard-filter").forEach((filter) => {
  filter.addEventListener("click", () => {
    const pressed = filter.getAttribute("aria-pressed") === "true";
    filter.setAttribute("aria-pressed", String(!pressed));
  });
});
