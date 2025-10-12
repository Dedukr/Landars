// Prevent duplicate order submissions
document.addEventListener("DOMContentLoaded", function () {
  // Find all save buttons in order forms
  const saveButtons = document.querySelectorAll(
    'input[type="submit"][name="_save"], input[type="submit"][name="_addanother"], input[type="submit"][name="_continue"]'
  );

  // Track form submissions to prevent double submissions
  const submittedForms = new Set();

  saveButtons.forEach(function (button) {
    // Store original button values
    button.setAttribute("data-original-value", button.value);

    button.addEventListener("click", function (e) {
      const form = button.closest("form");
      const formId = form ? form.action + form.innerHTML.length : "unknown";

      // Check if this form was already submitted
      if (submittedForms.has(formId)) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Preventing duplicate form submission");
        return false;
      }

      // Disable the button to prevent double-clicking
      if (this.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // Mark form as submitted
      submittedForms.add(formId);

      // Disable all save buttons in this form
      const formButtons = form.querySelectorAll('input[type="submit"]');
      formButtons.forEach(function (btn) {
        btn.disabled = true;
        btn.value = "Saving...";
      });

      // Re-enable after 10 seconds as a safety measure (increased from 5)
      setTimeout(function () {
        formButtons.forEach(function (btn) {
          btn.disabled = false;
          btn.value = btn.getAttribute("data-original-value") || "Save";
        });
        submittedForms.delete(formId);
      }, 10000);
    });
  });

  // Add form-level submission prevention
  const forms = document.querySelectorAll("form");
  forms.forEach(function (form) {
    let isSubmitting = false;

    form.addEventListener("submit", function (e) {
      if (isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Preventing duplicate form submission at form level");
        return false;
      }

      isSubmitting = true;

      // Reset flag after 15 seconds as safety measure
      setTimeout(function () {
        isSubmitting = false;
      }, 15000);
    });
  });

  // Add duplicate prevention warning
  const customerField = document.querySelector('select[name="customer"]');
  const deliveryDateField = document.querySelector(
    'input[name="delivery_date"]'
  );
  const notesField = document.querySelector('textarea[name="notes"]');

  if (customerField && deliveryDateField) {
    function checkForDuplicates() {
      const customer = customerField.value;
      const deliveryDate = deliveryDateField.value;
      const notes = notesField ? notesField.value : "";

      if (customer && deliveryDate) {
        // Show a warning if we detect potential duplicate
        const existingWarning = document.getElementById("duplicate-warning");
        if (existingWarning) {
          existingWarning.remove();
        }

        // Create warning element
        const warning = document.createElement("div");
        warning.id = "duplicate-warning";
        warning.style.cssText =
          "background-color: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 10px; margin: 10px 0; border-radius: 4px;";
        warning.innerHTML =
          "⚠️ <strong>Duplicate Check:</strong> Make sure this order is not a duplicate of an existing order. The system will prevent exact duplicates.";

        // Insert warning after the form
        const form = document.querySelector("form");
        if (form) {
          form.insertBefore(warning, form.firstChild);
        }
      }
    }

    // Check on field changes
    customerField.addEventListener("change", checkForDuplicates);
    deliveryDateField.addEventListener("change", checkForDuplicates);
    if (notesField) {
      notesField.addEventListener("input", checkForDuplicates);
    }
  }
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
