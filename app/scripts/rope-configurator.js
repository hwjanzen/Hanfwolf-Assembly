(function () {
  var script = document.currentScript;
  if (!script) return;

  var form = document.getElementById(script.dataset.formId || "");
  if (!form || form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  var section = form.closest("[data-rope-configurator-section]");
  var cutsContainer = form.querySelector("[data-rope-cuts]");
  var template = section && section.querySelector("[data-rope-cut-template]");
  var errorElement = form.querySelector("[data-rope-error]");
  var submitButton = form.querySelector("[data-rope-submit]");
  var selectedVariantId = script.dataset.variantId;
  var hasVariantChangeEvent = false;
  var cartUrl = script.dataset.cartUrl || "/cart";
  var configUrl = script.dataset.configUrl || "/apps/hanfwolf-pricing/config";
  var nextIndex = 0;

  if (!section || !cutsContainer || !template || !errorElement || !submitButton || !selectedVariantId) {
    return;
  }

  document.querySelectorAll("[data-hanfwolf-custom-price-badge]").forEach(function (badge) {
    badge.remove();
  });

  submitButton.disabled = true;

  function getItems() {
    return Array.from(cutsContainer.querySelectorAll(".rope-cut")).map(function (cut) {
      var lengthMeters = Number(cut.querySelector("[data-rope-length]").value);
      var lengthDecimeters = Math.round(lengthMeters * 10);
      return {
        variantId: getSelectedVariantId(),
        quantity: lengthDecimeters,
        lengthMeters: lengthDecimeters / 10,
        presentation: cut.querySelector("[data-rope-presentation]:checked").value,
      };
    });
  }

  function markConfigurationChanged() {
    submitButton.disabled = false;
  }

  function getSelectedVariantId() {
    if (hasVariantChangeEvent) return selectedVariantId;
    var queryVariant = new URLSearchParams(window.location.search).get("variant");
    if (queryVariant && /^\d+$/.test(queryVariant)) {
      return "gid://shopify/ProductVariant/" + queryVariant;
    }
    return selectedVariantId;
  }

  document.addEventListener("variant:change", function (event) {
    var variant = event.detail && event.detail.variant;
    if (
      variant &&
      variant.product_id &&
      String(variant.product_id).split("/").pop() !== String(script.dataset.productId)
    ) return;
    if (variant && variant.id) {
      var variantId = String(variant.id);
      selectedVariantId = variantId.indexOf("gid://") === 0
        ? variantId
        : "gid://shopify/ProductVariant/" + variantId;
      hasVariantChangeEvent = true;
    }
  });

  function updateRemoveButtons() {
    var cuts = cutsContainer.querySelectorAll(".rope-cut");
    cuts.forEach(function (cut) {
      cut.querySelector("[data-remove-rope-cut]").hidden = cuts.length === 1;
    });
  }

  function addCut() {
    var fragment = template.content.cloneNode(true);
    var cut = fragment.querySelector(".rope-cut");
    var index = nextIndex++;
    var length = cut.querySelector("[data-rope-length]");
    var radios = cut.querySelectorAll("[data-rope-presentation]");

    length.id = "RopeLength-" + script.dataset.sectionId + "-" + index;
    cut.querySelector("[data-length-label]").htmlFor = length.id;
    radios.forEach(function (radio) {
      radio.name = "rope-presentation-" + script.dataset.sectionId + "-" + index;
    });

    cut.querySelector("[data-remove-rope-cut]").addEventListener("click", function () {
      cut.remove();
      updateRemoveButtons();
      markConfigurationChanged();
    });
    length.addEventListener("input", markConfigurationChanged);
    radios.forEach(function (radio) {
      radio.addEventListener("change", markConfigurationChanged);
    });

    cutsContainer.appendChild(fragment);
    updateRemoveButtons();
    markConfigurationChanged();
  }

  function showError(message) {
    errorElement.textContent = message;
    errorElement.hidden = !message;
  }

  async function applySetup() {
    try {
      var response = await fetch(configUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      var payload = await response.json();
      if (!payload.ok || !payload.config) return;

      var length = template.content.querySelector("[data-rope-length]");
      length.min = payload.config.minLengthMeters;
      length.max = payload.config.maxLengthMeters;
      length.value = payload.config.defaultLengthMeters;
    } catch (error) {
      console.warn("RopeConfigurator Setup konnte nicht geladen werden", error);
    }
  }

  form.querySelector("[data-add-rope-cut]").addEventListener("click", addCut);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    showError("");
    if (!form.reportValidity()) return;

    var items = getItems();
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");

    try {
      if (!window.HanfwolfPricing || !window.HanfwolfPricing.addRopeCutToCart) {
        throw new Error("Der Hanfwolf-Warenkorbservice wurde nicht geladen.");
      }

      if (items.some(function (item) {
        return !Number.isSafeInteger(item.quantity) || item.quantity < 1;
      })) {
        throw new Error("Die Länge muss mindestens 0,1 m betragen.");
      }

      for (var index = 0; index < items.length; index += 1) {
        await window.HanfwolfPricing.addRopeCutToCart(items[index]);
      }
      window.location.assign(cartUrl);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Der Zuschnitt konnte nicht in den Warenkorb gelegt werden.");
      submitButton.disabled = false;
      submitButton.removeAttribute("aria-busy");
    }
  });

  applySetup().finally(addCut);
})();
