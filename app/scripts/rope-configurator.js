(function () {
  var script = document.currentScript;
  if (!script) return;
  var form = document.getElementById(script.dataset.formId || "");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  var section = form.closest("[data-rope-configurator-section]");
  var cutsContainer = form.querySelector("[data-rope-cuts]");
  var template = section.querySelector("[data-rope-cut-template]");
  var errorElement = form.querySelector("[data-rope-error]");
  var addButton = form.querySelector("[data-add-rope-cut]");
  var reviewButton = form.querySelector("[data-rope-review]");
  var review = form.querySelector("[data-rope-summary]");
  var reviewRows = form.querySelector("[data-rope-summary-rows]");
  var totalElement = form.querySelector("[data-rope-total]");
  var confirmButton = form.querySelector("[data-rope-confirm]");
  var submitButton = form.querySelector("[data-rope-submit]");
  var overallStatus = form.querySelector("[data-rope-overall-status]");
  var reloadButton = form.querySelector("[data-rope-reload]");
  var proxyPath = script.dataset.proxyPath || "/apps/hanfwolf-pricing";
  var cuts = [];
  var setup;
  var confirmed = false;
  var submitting = false;
  var nextIndex = 0;

  function requestId() {
    return window.crypto.randomUUID();
  }

  function showError(message) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  async function jsonRequest(url, options) {
    var response = await fetch(
      url,
      Object.assign(
        {
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        },
        options,
        {
          signal:
            options && options.signal
              ? AbortSignal.any([AbortSignal.timeout(45000), options.signal])
              : AbortSignal.timeout(45000),
        },
      ),
    );
    var payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        "Der Konfigurator-Service lieferte keine gueltige Antwort (HTTP " +
          response.status +
          ").",
      );
    }
    if (!response.ok || payload.ok === false) {
      throw new Error(
        payload.error || "Der Konfigurator-Service ist nicht erreichbar.",
      );
    }
    return payload;
  }

  function money(cents, currency) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: currency,
    }).format(cents / 100);
  }

  function invalidateReview() {
    confirmed = false;
    review.hidden = true;
  }

  function defaultSelectionLabel(position) {
    return position.code === "end_1" || position.code === "end_2"
      ? "Ende spitz"
      : "Ohne";
  }

  function render() {
    var allFinished =
      cuts.length > 0 &&
      cuts.every(function (cut) {
        return cut.finished;
      });
    var readyCount = cuts.filter(function (cut) {
      return cut.status === "ready";
    }).length;
    var allReady = allFinished && readyCount === cuts.length;
    addButton.disabled = !setup || !allFinished || submitting;
    reviewButton.disabled = !allFinished || submitting;
    confirmButton.disabled = !allFinished || confirmed || submitting;
    confirmButton.textContent = confirmed
      ? "Zusammenstellung bestaetigt"
      : "Konfiguration bestaetigen";
    submitButton.disabled = !confirmed || !allReady || submitting;
    submitButton.setAttribute("aria-busy", submitting ? "true" : "false");
    overallStatus.textContent = cuts.length
      ? readyCount + " von " + cuts.length + " Zuschnitten sind bereit."
      : "";
    cuts.forEach(function (cut, index) {
      cut.element.querySelector("legend").textContent =
        "Zuschnitt " + (index + 1);
      cut.removeButton.hidden = cuts.length === 1;
      cut.removeButton.disabled = submitting;
      cut.editButton.disabled = !cut.finished || submitting;
      cut.finishButton.hidden = cut.finished && cut.status !== "error";
      cut.finishButton.disabled = submitting;
      cut.finishButton.textContent =
        cut.status === "error" ? "Erneut versuchen" : "Zuschnitt fertigstellen";
      cut.editButton.hidden = !cut.finished;
      cut.inputs.disabled = cut.finished || submitting;
      cut.statusElement.textContent = {
        draft: "Bitte konfigurieren und fertigstellen.",
        preparing: "Variante wird vorbereitet ...",
        ready: "Bereit",
        error: cut.error,
      }[cut.status];
    });
    if (!review.hidden) renderSummary();
  }

  function renderSummary() {
    reviewRows.replaceChildren();
    var total = 0;
    var currency;
    var priced = true;
    cuts.forEach(function (cut, index) {
      var row = document.createElement("tr");
      var cells = [
        String(index + 1),
        String(cut.input.quantity),
        Number(cut.input.lengthMeters).toFixed(1).replace(".", ",") + " m",
        setup.positions
          .map(function (position) {
            var selection = cut.input.selections.find(function (entry) {
              return entry.positionId === position.id;
            });
            var option = position.options.find(function (entry) {
              return entry.id === selection.mappingId;
            });
            return position.label + ": " + (option ? option.label : defaultSelectionLabel(position));
          })
          .join("; "),
      ];
      if (cut.prepared) {
        currency = cut.prepared.currency;
        var lineTotal = cut.prepared.unitPriceCents * cut.input.quantity;
        total += lineTotal;
        cells.push(
          money(cut.prepared.unitPriceCents, currency),
          money(lineTotal, currency),
        );
      } else {
        priced = false;
        cells.push("Wird ermittelt", "Wird ermittelt");
      }
      cells.forEach(function (value) {
        var cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      var actions = document.createElement("td");
      var edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Bearbeiten";
      edit.disabled = submitting;
      edit.addEventListener("click", function () {
        editCut(cut);
        cut.element.scrollIntoView({ block: "center" });
      });
      actions.appendChild(edit);
      if (cuts.length > 1) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Entfernen";
        remove.disabled = submitting;
        remove.addEventListener("click", function () {
          removeCut(cut);
        });
        actions.appendChild(remove);
      }
      row.appendChild(actions);
      reviewRows.appendChild(row);
    });
    totalElement.textContent =
      priced && currency
        ? "Gesamtsumme: " + money(total, currency)
        : "Gesamtsumme wird ermittelt.";
  }

  function editCut(cut) {
    cut.generation += 1;
    cut.finished = false;
    cut.status = "draft";
    cut.prepared = null;
    cut.requestId = requestId();
    cut.inputs.disabled = false;
    invalidateReview();
    render();
  }

  function removeCut(cut) {
    cut.generation += 1;
    cut.element.remove();
    cuts = cuts.filter(function (entry) {
      return entry !== cut;
    });
    invalidateReview();
    render();
  }

  async function storefrontReady(prepared, signal) {
    var root =
      window.Shopify && window.Shopify.routes
        ? window.Shopify.routes.root
        : "/";
    var numericId = prepared.variantId.split("/").pop();
    var url =
      root +
      "products/" +
      encodeURIComponent(prepared.productHandle) +
      "?variant=" +
      encodeURIComponent(numericId) +
      "&section_id=rope-variant-status";
    var response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.any([AbortSignal.timeout(15000), signal]),
    });
    if (!response.ok)
      throw new Error(
        "Storefront-Pruefung fehlgeschlagen (HTTP " + response.status + ").",
      );
    var html = new DOMParser().parseFromString(
      await response.text(),
      "text/html",
    );
    var statusElement = html.querySelector("[data-rope-variant-status]");
    if (!statusElement)
      throw new Error(
        "Die Theme-Section rope-variant-status fehlt. Bitte das Theme aktualisieren.",
      );
    var status = JSON.parse(statusElement.textContent);
    if (status.currency !== prepared.currency) {
      throw new Error(
        "Der Konfigurator unterstuetzt aktuell nur die Shop-Waehrung " +
          prepared.currency +
          ".",
      );
    }
    if (String(status.id) !== numericId || !status.available) return false;
    if (status.price !== prepared.unitPriceCents) {
      throw new Error(
        "Der Storefront-Preis weicht vom bestaetigten Konfigurationspreis ab. Bitte den Shop kontaktieren.",
      );
    }
    return true;
  }

  async function finishCut(cut) {
    showError("");
    if (!cut.finished) {
      var fields = Array.from(cut.inputs.querySelectorAll("input, select"));
      if (
        !fields.every(function (field) {
          return field.reportValidity();
        })
      )
        return;
      cut.input = {
        productId: script.dataset.productId,
        quantity: Number(
          cut.inputs.querySelector("[data-rope-quantity]").value,
        ),
        lengthMeters: cut.inputs.querySelector("[data-rope-length]").value,
        selections: setup.positions.map(function (position) {
          return {
            positionId: position.id,
            mappingId: cut.selects.get(position.id).value || null,
          };
        }),
        requestId: cut.requestId,
      };
      cut.finished = true;
      cut.inputs.disabled = true;
    }
    invalidateReview();
    cut.status = "preparing";
    cut.error = "";
    var generation = ++cut.generation;
    var deadline = Date.now() + 90000;
    var signal = AbortSignal.timeout(90000);
    function current() {
      return cut.generation === generation && cuts.includes(cut);
    }
    render();
    try {
      var prepared = await jsonRequest(proxyPath + "/prepare", {
        method: "POST",
        body: JSON.stringify(cut.input),
        signal: signal,
      });
      if (!current()) return;
      cut.prepared = prepared;
      render();
      var delay = 1000;
      while (current() && Date.now() < deadline) {
        if (prepared.status === "failed")
          throw new Error(
            prepared.error || "Die Vorbereitung ist fehlgeschlagen.",
          );
        if (prepared.variantId) {
          prepared = await jsonRequest(
            proxyPath +
              "/prepare?id=" +
              encodeURIComponent(prepared.configurationId),
            { signal: signal },
          );
          if (!current()) return;
          cut.prepared = prepared;
          if (
            prepared.status === "available" &&
            (await storefrontReady(prepared, signal))
          ) {
            if (!current()) return;
            cut.status = "ready";
            render();
            return;
          }
        } else {
          prepared = await jsonRequest(
            proxyPath +
              "/prepare?id=" +
              encodeURIComponent(prepared.configurationId),
            { signal: signal },
          );
          if (!current()) return;
          cut.prepared = prepared;
        }
        await new Promise(function (resolve) {
          window.setTimeout(resolve, delay);
        });
        delay = Math.min(delay + 1000, 5000);
      }
      if (current())
        throw new Error(
          "Shopify benoetigt noch Zeit. Bitte erneut versuchen; eine bereits erstellte Variante wird wiederverwendet.",
        );
    } catch (error) {
      if (!current()) return;
      cut.status = "error";
      cut.error =
        error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "Die Vorbereitung dauert zu lange. Bitte erneut versuchen; vorhandene Varianten werden wiederverwendet."
          : error instanceof Error
            ? error.message
            : "Die Vorbereitung ist fehlgeschlagen.";
      confirmed = false;
      render();
    }
  }

  // HW20261025: Images are illustrative only; selection and pricing remain unchanged.
  function handlePreviewImageError(image) {
    image.addEventListener(
      "error",
      function () {
        var missing = document.createElement("p");
        missing.className = "rope-cut__preview-placeholder";
        missing.textContent = "Bild konnte nicht geladen werden";
        image.replaceWith(missing);
      },
      { once: true },
    );
  }

  function updatePreview(element, selects) {
    var preview = element.querySelector("[data-rope-preview]");
    if (!preview) return;
    preview.hidden = false;
    preview.querySelectorAll("[data-rope-preview-end]").forEach(function (part) {
      var position = setup.positions.find(function (entry) {
        return entry.code === part.dataset.ropePreviewEnd;
      });
      var select = position && selects.get(position.id);
      var option = select && position.options.find(function (entry) {
        return entry.id === select.value;
      });
      part.replaceChildren();
      part.hidden = !option;
      if (!option) return;
      var heading = document.createElement("span");
      heading.className = "rope-cut__preview-label";
      heading.textContent = position.label;
      part.appendChild(heading);
      if (option.image) {
        var image = document.createElement("img");
        image.alt = option.image.altText || option.label;
        image.loading = "lazy";
        handlePreviewImageError(image);
        image.src = option.image.url;
        part.appendChild(image);
      } else {
        var placeholder = document.createElement("p");
        placeholder.className = "rope-cut__preview-placeholder";
        placeholder.textContent = "Kein Bild hinterlegt";
        part.appendChild(placeholder);
      }
      var label = document.createElement("span");
      label.textContent = option.label;
      part.appendChild(label);
    });
  }

  function addCut() {
    invalidateReview();
    var fragment = template.content.cloneNode(true);
    var element = fragment.querySelector(".rope-cut");
    element
      .querySelectorAll("[data-rope-preview] img")
      .forEach(handlePreviewImageError);
    var inputs = element.querySelector("[data-rope-inputs]");
    var index = nextIndex++;
    var quantity = inputs.querySelector("[data-rope-quantity]");
    var length = inputs.querySelector("[data-rope-length]");
    quantity.min = String(setup.config.minQuantity);
    quantity.max = String(setup.config.maxQuantity);
    quantity.value = quantity.min;
    length.min = setup.config.minLengthMeters;
    length.max = setup.config.maxLengthMeters;
    length.value = setup.config.defaultLengthMeters;
    var selects = new Map();
    setup.positions.forEach(function (position) {
      var wrapper = document.createElement("div");
      wrapper.className = "rope-cut__field";
      var label = document.createElement("label");
      var select = document.createElement("select");
      select.id =
        "RopeOption-" +
        script.dataset.sectionId +
        "-" +
        index +
        "-" +
        position.code;
      select.required = position.required;
      label.htmlFor = select.id;
      label.textContent = position.label;
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = position.required ? "Bitte waehlen" : defaultSelectionLabel(position);
      select.appendChild(empty);
      position.options.forEach(function (entry) {
        var option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        select.appendChild(option);
      });
      wrapper.append(label, select);
      inputs.appendChild(wrapper);
      selects.set(position.id, select);
      select.addEventListener("change", function () {
        updatePreview(element, selects);
      });
    });
    updatePreview(element, selects);
    var cut = {
      element,
      inputs,
      selects,
      requestId: requestId(),
      generation: 0,
      finished: false,
      prepared: null,
      status: "draft",
      input: null,
      error: "",
      finishButton: element.querySelector("[data-rope-finish]"),
      editButton: element.querySelector("[data-rope-edit]"),
      removeButton: element.querySelector("[data-remove-rope-cut]"),
      statusElement: element.querySelector("[data-rope-cut-status]"),
    };
    cut.finishButton.addEventListener("click", function () {
      finishCut(cut);
    });
    cut.editButton.addEventListener("click", function () {
      editCut(cut);
    });
    cut.removeButton.addEventListener("click", function () {
      removeCut(cut);
    });
    cuts.push(cut);
    cutsContainer.appendChild(fragment);
    render();
  }

  addButton.addEventListener("click", addCut);
  reviewButton.addEventListener("click", function () {
    review.hidden = false;
    render();
    review.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  confirmButton.addEventListener("click", function () {
    confirmed = true;
    render();
  });
  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (
      submitting ||
      !confirmed ||
      !cuts.every(function (cut) {
        return cut.status === "ready";
      })
    )
      return;
    submitting = true;
    showError("");
    render();
    try {
      if (
        !window.HanfwolfPricing ||
        !window.HanfwolfPricing.addConfiguredCutsToCart
      ) {
        throw new Error("Der Warenkorbservice wurde nicht geladen.");
      }
      await window.HanfwolfPricing.addConfiguredCutsToCart(
        cuts.map(function (cut) {
          return {
            variantId: cut.prepared.variantId,
            quantity: cut.input.quantity,
            properties: Object.assign({}, cut.prepared.properties, {
              _hanfwolf_rope_cut_id: cut.requestId,
            }),
          };
        }),
      );
      window.location.assign(script.dataset.cartUrl || "/cart");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Die Zuschnitte konnten nicht hinzugefuegt werden.",
      );
      submitting = false;
      render();
    }
  });
  async function loadSetup() {
    showError("");
    reloadButton.hidden = true;
    overallStatus.textContent = "Konfigurationsoptionen werden geladen ...";
    try {
      setup = await jsonRequest(
        proxyPath +
          "/config?productId=" +
          encodeURIComponent(script.dataset.productId),
      );
      addCut();
    } catch (error) {
      overallStatus.textContent = "";
      showError(
        "Der Konfigurator konnte nicht geladen werden: " + error.message,
      );
      reloadButton.hidden = false;
    }
  }
  reloadButton.addEventListener("click", loadSetup);
  render();
  loadSetup();
})();
