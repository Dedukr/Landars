// Order filter cleaning: delivery_date__* and future_date are mutually exclusive.
document.addEventListener("DOMContentLoaded", function () {
  var filterContainers = document.querySelectorAll(".toplinks");
  if (!filterContainers.length) {
    return;
  }
  filterContainers.forEach(function (container) {
    container.addEventListener("click", function (e) {
      var link = e.target.closest("a");
      if (!link || !container.contains(link)) return;

      var href = link.getAttribute("href");
      if (!href) return;

      var url = new URL(href, window.location.href);

      // Clicking a delivery_date__* filter removes future_date.
      if (href.includes("delivery_date__") && url.searchParams.has("future_date")) {
        url.searchParams.delete("future_date");
        e.preventDefault();
        window.location = url.pathname + url.search + url.hash;
      }
    });
  });
});

document.addEventListener("DOMContentLoaded", function () {
  var filterContainers = document.querySelectorAll("#changelist-filter");
  if (!filterContainers.length) {
    return;
  }
  filterContainers.forEach(function (container) {
    container.addEventListener("click", function (e) {
      var link = e.target.closest("a");
      if (!link || !container.contains(link)) return;

      var href = link.getAttribute("href");
      if (!href) return;

      var url = new URL(href, window.location.href);

      // Clicking a future_date filter removes all delivery_date__* params.
      if (href.includes("future_date")) {
        var changed = false;
        Array.from(url.searchParams.keys()).forEach(function (key) {
          if (key.startsWith("delivery_date__")) {
            url.searchParams.delete(key);
            changed = true;
          }
        });
        if (changed) {
          e.preventDefault();
          window.location = url.pathname + url.search + url.hash;
        }
      }
    });
  });
});
