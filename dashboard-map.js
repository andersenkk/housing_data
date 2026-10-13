const mapContainer = document.querySelector("#us-map");

if (mapContainer) {
  const mapUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

  Promise.all([
    d3.json(mapUrl),
  ])
    .then(([topology]) => {
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

      svg.append("title")
        .attr("id", "us-map-title")
        .text("Map of the United States divided by state");

      svg.selectAll("path")
        .data(states.features)
        .join("path")
        .attr("class", "state-shape")
        .attr("d", path)
        .attr("tabindex", 0)
        .attr("aria-label", (state) => state.properties.name)
        .append("title")
        .text((state) => state.properties.name);
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
