(function () {
  if (window.hanfwolfCollectionFiltersInitialized) return;
  window.hanfwolfCollectionFiltersInitialized = true;

  var selector =
    ".facets-container details.facets__disclosure[open], " +
    "facet-filters-form details.facets__disclosure[open]";

  // HW20261021: Presentation labels only; Shopify filter keys and values stay unchanged.
  function updateLabels() {
    if (!/^de(?:-|$)/i.test(document.documentElement.lang)) return;
    var labels = {
      Surface: "Oberfläche",
      "Art des Schlags": "Schlagart",
      "Mindestbruchkraft in kN": "Mindestbruchkraft (kN)",
      "HaWo - Seile": "HaWo – Seile",
    };
    document
      .querySelectorAll(
        ".facets-container .facets__summary, facet-filters-form .facets__summary, " +
          ".mobile-facets__summary, .collection-hero__title",
      )
      .forEach(function (element) {
        var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        var node;
        while ((node = walker.nextNode())) {
          var text = node.nodeValue.trim();
          if (Object.prototype.hasOwnProperty.call(labels, text)) {
            node.nodeValue = node.nodeValue.replace(text, labels[text]);
          }
        }
      });
  }

  updateLabels();
  var labelUpdatePending = false;
  new MutationObserver(function () {
    if (labelUpdatePending) return;
    labelUpdatePending = true;
    window.requestAnimationFrame(function () {
      labelUpdatePending = false;
      updateLabels();
    });
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  function closeFilter(details) {
    details.open = false;
    var summary = details.querySelector("summary");
    if (summary) summary.setAttribute("aria-expanded", "false");
    return summary;
  }

  // Delegation survives Dawn replacing the filter markup after a selection.
  document.addEventListener(
    "click",
    function (event) {
      if (!(event.target instanceof Node)) return;
      document.querySelectorAll(selector).forEach(function (details) {
        if (!details.contains(event.target)) closeFilter(details);
      });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Escape" || !(event.target instanceof Node)) return;
      document.querySelectorAll(selector).forEach(function (details) {
        if (!details.contains(event.target)) return;
        var summary = closeFilter(details);
        if (summary) summary.focus();
      });
    },
    true,
  );
})();
