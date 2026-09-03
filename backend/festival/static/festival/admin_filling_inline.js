(function () {
  "use strict";

  function findPreviewCell(fileInput) {
    var row = fileInput.closest("tr");
    if (!row) {
      return null;
    }
    return row.querySelector("td.field-image_preview");
  }

  function setPreview(cell, src) {
    if (!cell) {
      return;
    }
    if (src) {
      cell.innerHTML =
        '<img class="festival-filling-preview-img" src="' +
        src +
        '" alt="" />';
      return;
    }
    cell.innerHTML =
      '<div class="festival-filling-preview-placeholder">No image</div>';
  }

  function onFileChange(event) {
    var input = event.target;
    if (!input || input.type !== "file") {
      return;
    }
    if (!input.name || input.name.indexOf("-image_upload") === -1) {
      return;
    }

    var cell = findPreviewCell(input);
    var file = input.files && input.files[0];
    if (!file) {
      return;
    }
    if (!file.type || file.type.indexOf("image/") !== 0) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function (loadEvent) {
      setPreview(cell, loadEvent.target.result);
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener("change", onFileChange);
})();
