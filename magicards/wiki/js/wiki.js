(function () {
  var input = document.querySelector("[data-search]");
  var empty = document.querySelector("[data-empty]");
  if (!input) return;

  var entries = Array.prototype.slice.call(document.querySelectorAll("[data-entry]"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("[data-section]"));

  function filter() {
    var q = input.value.trim().toLowerCase();
    var shown = 0;

    entries.forEach(function (el) {
      var hay = ((el.getAttribute("data-entry") || "") + " " + el.textContent).toLowerCase();
      var match = !q || hay.indexOf(q) !== -1;
      el.hidden = !match;
      if (match) shown += 1;
    });

    sections.forEach(function (section) {
      var visible = section.querySelector("[data-entry]:not([hidden])");
      section.hidden = !visible;
    });

    if (empty) empty.hidden = shown !== 0;
  }

  input.addEventListener("input", filter);
})();
