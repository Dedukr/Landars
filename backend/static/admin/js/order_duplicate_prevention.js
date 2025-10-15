// Order duplicate prevention functionality
document.addEventListener("DOMContentLoaded", function () {
  // Find all save buttons in order forms
  const saveButtons = document.querySelectorAll(
    'input[type="submit"][name="_save"], input[type="submit"][name="_addanother"], input[type="submit"][name="_continue"]'
  );

  saveButtons.forEach(function (button) {
    button.addEventListener("click", function (e) {
      // Only prevent if already disabled (double-click protection)
      if (this.disabled) {
        e.preventDefault();
        return false;
      }

      // Disable button to prevent double-clicking
      this.disabled = true;
      this.value = "Saving...";
    });
  });
});
