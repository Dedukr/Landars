// Simple double-click prevention for order forms
document.addEventListener("DOMContentLoaded", function () {
  // Find all save buttons in order forms
  const saveButtons = document.querySelectorAll(
    'input[type="submit"][name="_save"], input[type="submit"][name="_addanother"], input[type="submit"][name="_continue"]'
  );

  saveButtons.forEach(function (button) {
    button.addEventListener("click", function (e) {
      // Simple double-click prevention
      if (this.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Disable button to prevent double-clicking
      this.disabled = true;
      this.value = "Saving...";
      this.style.opacity = "0.6";

      // Re-enable after 5 seconds as safety measure
      setTimeout(function () {
        button.disabled = false;
        button.value = button.getAttribute("data-original-value") || "Save";
        button.style.opacity = "1";
      }, 5000);
    });
  });
});

document.addEventListener("DOMContentLoaded", function () {
  var filterContainers = document.querySelectorAll(
    // "#changelist-filter, .toplinks"
    ".toplinks"
  );
  if (!filterContainers) {
    console.log("No filter containers found for delivery_date__*");
    return;
  }
  filterContainers.forEach(function (container) {
    container.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        let link = e.target;
        let href = link.getAttribute("href");
        if (!href) return;

        let url = new URL(href, window.location.href);

        // If clicking a delivery_date__* filter: Remove future_date
        console.log("Before checking delivery_date__*");
        if (href.includes("delivery_date__")) {
          console.log("There is a delivery_date__* filter");
          if (url.searchParams.has("future_date")) {
            console.log("Removing future_date");
            url.searchParams.delete("future_date");
            e.preventDefault();
            window.location = url.pathname + url.search;
          }
        }
      }
    });
  });
});
document.addEventListener("DOMContentLoaded", function () {
  var filterContainers = document.querySelectorAll(
    // "#changelist-filter, .toplinks"
    "#changelist-filter"
  );
  if (!filterContainers) {
    console.log("No filter containers found for future_date");
    return;
  }
  filterContainers.forEach(function (container) {
    container.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        let link = e.target;
        let href = link.getAttribute("href");
        if (!href) return;

        let url = new URL(href, window.location.href);

        // If clicking a custom filter (future_date): Remove ALL delivery_date__*
        console.log("Before checking future_date");
        if (href.includes("future_date")) {
          console.log("There is a future_date filter");
          let changed = false;
          let params = Array.from(url.searchParams.keys());
          params.forEach((key) => {
            if (key.startsWith("delivery_date__")) {
              console.log("Removing delivery_date__* filter");
              url.searchParams.delete(key);
              changed = true;
            }
          });
          // Always remove delivery_date__* params, even if future_date already exists
          if (changed) {
            e.preventDefault();
            window.location = url.pathname + url.search;
          }
        }
      }
    });
  });
});
