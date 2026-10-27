(function () {
  if (window.hanfwolfInquiryInitialized) return;
  window.hanfwolfInquiryInitialized = true;

  function contextFor(trigger, root) {
    var lines = [
      "Sortiment: " + (root.dataset.inquiryAssortment || "Nicht zugeordnet"),
    ];
    if (root.dataset.inquiryProduct) lines.push("Produkt: " + root.dataset.inquiryProduct);
    var cut = trigger.closest(".rope-cut");
    if (cut) {
      lines.push(cut.querySelector("legend").textContent.trim());
      lines.push("Anzahl: " + cut.querySelector("[data-rope-quantity]").value);
      lines.push("Länge je Stück (m): " + cut.querySelector("[data-rope-length]").value);
      cut.querySelectorAll("select").forEach(function (select) {
        var label = cut.querySelector('label[for="' + select.id + '"]');
        lines.push((label ? label.textContent.trim() : "Auswahl") + ": " +
          select.options[select.selectedIndex].textContent.trim());
      });
    } else {
      var filters = document.querySelector("#main-collection-filters");
      if (filters) {
        var seen = new Set();
        filters.querySelectorAll('input[name^="filter."]').forEach(function (input) {
          if ((input.type === "checkbox" && !input.checked) || !input.value) return;
          var key = input.name + "=" + input.value;
          if (seen.has(key)) return;
          seen.add(key);
          lines.push("Filter: " + key);
        });
      }
    }
    return lines.join("\n");
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-inquiry-open]");
    if (trigger) {
      var dialog = document.getElementById(trigger.dataset.inquiryOpen);
      var root = dialog.closest("[data-hw-inquiry-root]");
      var context = dialog.querySelector("[data-inquiry-context]");
      if (context) context.value = contextFor(trigger, root);
      dialog.showModal();
    }
    var close = event.target.closest("[data-inquiry-close]");
    if (close) close.closest("dialog").close();
  });

  document.querySelectorAll("[data-hw-inquiry-root]").forEach(function (root) {
    var dialog = root.querySelector("dialog");
    var form = dialog.querySelector("form");
    var storageKey = "hw-inquiry:" + window.location.pathname + ":" + dialog.id;
    var context = dialog.querySelector("[data-inquiry-context]");
    var result = dialog.querySelector("[data-inquiry-result]");
    if (result) {
      dialog.showModal();
      result.focus();
      if (context) {
        try {
          context.value = sessionStorage.getItem(storageKey) || "";
        } catch (error) {
          console.warn("Anfragekontext konnte nicht wiederhergestellt werden.", error);
        }
      }
    }
    form.addEventListener("submit", function () {
      try {
        sessionStorage.setItem(storageKey, context.value);
        var configurator = root.closest("[data-rope-configurator-section]");
        if (configurator) {
          var drafts = Array.from(configurator.querySelectorAll(".rope-cut")).map(function (cut) {
            return {
              quantity: cut.querySelector("[data-rope-quantity]").value,
              length: cut.querySelector("[data-rope-length]").value,
              selections: Array.from(cut.querySelectorAll("select")).map(function (select) {
                return { code: select.dataset.positionCode || select.id.split("-").pop(), value: select.value };
              }),
            };
          });
          sessionStorage.setItem("hw-inquiry-drafts:" + location.pathname, JSON.stringify(drafts));
        }
      } catch (error) {
        console.warn("Anfragekontext konnte nicht lokal gesichert werden.", error);
        if (root.closest("[data-rope-configurator-section]")) {
          window.alert("Ihre Anfrage wird versendet. Die Zuschnitte können nach dem Neuladen jedoch nicht automatisch wiederhergestellt werden, da der Browserspeicher nicht verfügbar ist.");
        }
      }
    });
  });
})();
