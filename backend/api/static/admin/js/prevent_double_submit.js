// Prevent double submission of Django admin forms
// Simple approach: prevent duplicate clicks, disable buttons only after form submits

(function () {
  "use strict";

  console.log("Prevent double submit script loaded");

  var isSubmitting = false;

  // Disable all save buttons
  function disableSaveButtons() {
    var buttons = document.querySelectorAll(
      'input[type="submit"], button[type="submit"]'
    );

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var name = (btn.name || "").toLowerCase();
      var val = (btn.value || btn.textContent || "").toLowerCase();

      if (
        name.indexOf("_save") !== -1 ||
        name.indexOf("_addanother") !== -1 ||
        name.indexOf("_continue") !== -1 ||
        val.indexOf("save") !== -1 ||
        btn.closest(".submit-row") !== null
      ) {
        if (btn.value && !btn.getAttribute("data-orig-val")) {
          btn.setAttribute("data-orig-val", btn.value);
        }

        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";

        if (btn.value && btn.value.indexOf("(Saving...)") === -1) {
          btn.value =
            (btn.getAttribute("data-orig-val") || btn.value) + " (Saving...)";
        }
      }
    }
  }

  // Handle button click - only prevent if already submitting
  document.addEventListener(
    "click",
    function (e) {
      var target = e.target;

      // Check if it's a submit button
      if (
        (target.type === "submit" || target.tagName === "BUTTON") &&
        (target.type === "submit" || target.closest("form"))
      ) {
        var name = (target.name || "").toLowerCase();
        var val = (target.value || "").toLowerCase();

        // Check if it's a save button
        if (
          name.indexOf("_save") !== -1 ||
          name.indexOf("_addanother") !== -1 ||
          name.indexOf("_continue") !== -1 ||
          val.indexOf("save") !== -1 ||
          target.closest(".submit-row") !== null
        ) {
          if (isSubmitting) {
            console.log("Blocking duplicate click");
            e.preventDefault();
            e.stopPropagation();
            return false;
          }

          // First click - mark as submitting
          console.log("First click - allowing submission");
          isSubmitting = true;
        }
      }
    },
    true
  ); // Use capture phase to catch early

  // Handle form submit - disable buttons when form actually submits
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;

      // Skip changelist form
      if (form.id === "changelist-form") {
        return;
      }

      console.log("Form submitting, isSubmitting:", isSubmitting);

      // If already submitting and buttons disabled, this is a duplicate
      var disabledButtons = form.querySelectorAll(
        'input[type="submit"]:disabled, button[type="submit"]:disabled'
      );
      if (isSubmitting && disabledButtons.length > 0) {
        console.log("Blocking duplicate form submission");
        e.preventDefault();
        e.stopPropagation();
        return false;
      }

      // First submission - disable buttons now
      console.log("First form submit - disabling buttons");
      isSubmitting = true;
      disableSaveButtons();

      // Allow submission to proceed
    },
    false
  ); // Use bubble phase so Django's handlers run first

  // Reset flag on page unload
  window.addEventListener("beforeunload", function () {
    isSubmitting = false;
  });
})();
