const mapContainer = document.querySelector("#us-map");

if (mapContainer) {
  const mapUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
  const priceUrl = "median_listing_prices.json";

  Promise.all([d3.json(mapUrl), d3.json(priceUrl)])
    .then(([topology, priceRows]) => {
      const latestPrices = new Map();
      for (const row of priceRows) {
        const current = latestPrices.get(row.state);
        if (!current || row.date > current.date) {
          latestPrices.set(row.state, row);
        }
      }

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

      function showStateDetails(event, state) {
        const name = state.properties.name;
        const price = latestPrices.get(name);
        const bounds = mapContainer.getBoundingClientRect();
        let pointerX = event.clientX - bounds.left;
        let pointerY = event.clientY - bounds.top;

        if (event.type === "focus") {
          const stateBounds = this.getBoundingClientRect();
          pointerX = stateBounds.left + stateBounds.width / 2 - bounds.left;
          pointerY = stateBounds.top + stateBounds.height / 2 - bounds.top;
        }

        tooltip
          .html("")
          .append("strong")
          .text(name);

        if (price) {
          tooltip
            .append("span")
            .text(new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }).format(price.med_house_price));
          tooltip
            .append("small")
            .text(new Intl.DateTimeFormat("en-US", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${price.date}T00:00:00Z`)));
        } else {
          tooltip.append("span").text("No listing price available");
        }

        const tooltipWidth = 220;
        const tooltipHeight = price ? 82 : 58;
        tooltip
          .attr("hidden", null)
          .style("left", `${Math.max(8, Math.min(pointerX + 14, bounds.width - tooltipWidth - 8))}px`)
          .style("top", `${Math.max(8, Math.min(pointerY + 14, bounds.height - tooltipHeight - 8))}px`);
      }

      function hideStateDetails() {
        tooltip.attr("hidden", true);
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
        .attr("aria-label", (state) => {
          const price = latestPrices.get(state.properties.name);
          if (!price) return `${state.properties.name}: no listing price available`;
          const formattedPrice = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(price.med_house_price);
          const formattedDate = new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${price.date}T00:00:00Z`));
          return `${state.properties.name}: ${formattedPrice}, ${formattedDate}`;
        })
        .on("pointerenter pointermove", showStateDetails)
        .on("pointerleave", hideStateDetails)
        .on("focus", showStateDetails)
        .on("blur", hideStateDetails)
        .append("title")
        .text((state) => {
          const price = latestPrices.get(state.properties.name);
          return price
            ? `${state.properties.name}: $${price.med_house_price.toLocaleString()} (${price.date})`
            : `${state.properties.name}: no listing price available`;
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
