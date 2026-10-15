const mapContainer = document.querySelector("#us-map");

if (mapContainer) {
  const mapUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
  const dataUrl = "affordability_metrics.json";
  const metricSelect = document.querySelector("#metric-filter");
  const yearSelect = document.querySelector("#year-filter");
  const monthSelect = document.querySelector("#month-filter");
  const statePicker = document.querySelector("#state-filter");
  const stateFilterList = document.querySelector("#state-filter-list");
  const filterStatus = document.querySelector("#filter-status");
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const metricLabels = {
    median_listing_price: "Median listing price",
    median_household_income: "Median household income",
    price_to_income_ratio: "Price-to-income ratio",
  };

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
      let activeStateNode = null;
      let pointerPosition = null;

      function formatMetricValue(row) {
        if (row.metric === "price_to_income_ratio") {
          return `${Number(row.value).toFixed(1)}× annual income`;
        }
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(Number(row.value));
      }

      function formatObservationDate(row) {
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
        const frequency = dataRows.find((row) => row.metric === metric)?.frequency;
        return dataRows.filter((row) => {
          if (row.metric !== metric || row.date.slice(0, 4) !== year) return false;
          return frequency !== "monthly" || row.date.slice(5, 7) === monthSelect.value;
        });
      }

      function updateFilterStatus(rows) {
        const selectedMonth = monthSelect.disabled ? "" : `, ${monthNames[Number(monthSelect.value) - 1]}`;
        const selectedLabel = metricLabels[metricSelect.value] || metricSelect.value;
        const selectedCount = rows.filter((row) => selectedStates.has(row.state)).length;
        filterStatus.textContent = `${selectedLabel} · ${yearSelect.value}${selectedMonth} · ${selectedCount} selected states with data`;
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
        const row = selectedMetricRows().find((item) => item.state === name);

        tooltip
          .html("")
          .append("strong")
          .text(name);

        if (row) {
          tooltip.append("span").text(formatMetricValue(row));
          tooltip
            .append("small")
            .text(`${metricLabels[row.metric] || row.metric} · ${formatObservationDate(row)}`);
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

        svg.selectAll(".state-shape")
          .classed("is-filtered-out", (state) => !selectedStates.has(state.properties.name))
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
        const years = [...new Set(
          dataRows
            .filter((row) => row.metric === metricSelect.value)
            .map((row) => row.date.slice(0, 4)),
        )].sort().reverse();
        yearSelect.replaceChildren(...years.map((year) => new Option(year, year)));
        yearSelect.disabled = years.length === 0;
        populateMonthOptions();
      }

      function populateMonthOptions() {
        const monthly = dataRows.some((row) => row.metric === metricSelect.value && row.frequency === "monthly");
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

      const metrics = [...new Set(dataRows.map((row) => row.metric))];
      metricSelect.replaceChildren(...metrics.map((metric) => new Option(
        metricLabels[metric] || metric.replaceAll("_", " "),
        metric,
      )));
      metricSelect.disabled = metrics.length === 0;
      renderStateOptions();
      populateYearOptions();

      metricSelect.addEventListener("change", populateYearOptions);
      yearSelect.addEventListener("change", populateMonthOptions);
      monthSelect.addEventListener("change", refreshMap);
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
