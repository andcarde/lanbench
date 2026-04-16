
const DEBUG = true;

(function () {
  "use strict";

  const $container = $("#datasetsContainer");
  const $tooltip = $("#datasetTooltip");
  const $tooltipTriples = $("#tooltipTriples");
  const $tooltipLanguages = $("#tooltipLanguages");

  const mockDatasets = [
    {
      idDataset: 1,
      name: "DATASET 1",
      sentenceLabel: "Oración 1:",
      triplesRDF: 3000,
      languages: ["Spanish", "English"],
      completedPercent: 100,
      withoutReviewPercent: 0,
      remainPercent: 0,
      colorClass: "dataset-purple"
    },
    {
      idDataset: 2,
      name: "DATASET 2",
      sentenceLabel: "Oración 2:",
      triplesRDF: 3000,
      languages: ["Spanish", "English"],
      completedPercent: 100,
      withoutReviewPercent: 0,
      remainPercent: 0,
      colorClass: "dataset-violet"
    },
    {
      idDataset: 3,
      name: "DATASET 3",
      sentenceLabel: "Oración 3:",
      triplesRDF: 3000,
      languages: ["Spanish", "English"],
      completedPercent: 33,
      withoutReviewPercent: 42,
      remainPercent: 25,
      colorClass: "dataset-green-progress"
    }
  ];

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderLoading() {
    $container.html('<div class="loading-state">Cargando datasets...</div>');
  }

  function renderError() {
    $container.html(
      '<div class="error-state">No se pudieron cargar los datasets.</div>'
    );
  }

  function renderEmpty() {
    $container.html(
      '<div class="empty-state">No hay datasets disponibles.</div>'
    );
  }

  function buildDatasetRow(dataset) {
    const hasProgress =
      dataset.completedPercent > 0 ||
      dataset.withoutReviewPercent > 0 ||
      dataset.remainPercent > 0;

    if (hasProgress) {
      return `
        <div class="dataset-row">
          <div class="dataset-label">${escapeHtml(dataset.sentenceLabel)}</div>

          <div class="progress-wrapper">
            <div class="custom-progress">
              <div class="segment completed" style="width: ${dataset.completedPercent}%;"></div>
              <div class="segment without-review" style="width: ${dataset.withoutReviewPercent}%;"></div>
              <div class="segment remain" style="width: ${dataset.remainPercent}%;"></div>
            </div>

            <div class="progress-legend">
              <span class="legend-completed">${dataset.completedPercent}% completed</span>
              <span class="legend-review">${dataset.withoutReviewPercent}% without revision</span>
              <span class="legend-remain">${dataset.remainPercent}% remain</span>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="dataset-row">
        <div class="dataset-label">${escapeHtml(dataset.sentenceLabel)}</div>

        <div class="dataset-main">
          <button
            class="dataset-button ${escapeHtml(dataset.colorClass)}"
            data-id="${dataset.idDataset}"
            data-name="${escapeHtml(dataset.name)}"
          >
            ${escapeHtml(dataset.name)}
          </button>

          <div class="action-buttons">
            <button class="btn btn-action btn-view" data-action="view" data-id="${dataset.idDataset}">
              Ver
            </button>
            <button class="btn btn-action btn-continue" data-action="continue" data-id="${dataset.idDataset}">
              Continuar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDatasets(datasets) {
    if (!datasets || datasets.length === 0) {
      renderEmpty();
      return;
    }

    const html = datasets.map(buildDatasetRow).join("");
    $container.html(html);
  }

  function showTooltip(dataset, buttonElement) {
    $tooltipTriples.text(`${dataset.triplesRDF} triples RDF`);
    $tooltipLanguages.html(`<strong>Languages:</strong> ${dataset.languages.join(", ")}`);

    const rect = buttonElement.getBoundingClientRect();
    const top = rect.top + window.scrollY + rect.height / 2 - 25;
    const left = rect.right + 18;

    $tooltip.css({
      top: `${top}px`,
      left: `${left}px`
    });

    $tooltip.removeClass("d-none");
  }

  function hideTooltip() {
    $tooltip.addClass("d-none");
  }

  function ajaxGetDatasets() {
    if (DEBUG) {
      return $.Deferred(function (defer) {
        setTimeout(function () {
          defer.resolve(mockDatasets);
        }, 250);
      }).promise();
    }

    return $.ajax({
      url: "/api/datasets",
      method: "GET",
      dataType: "json"
    });
  }

  function ajaxGetDatasetById(id) {
    if (DEBUG) {
      return $.Deferred(function (defer) {
        const dataset = mockDatasets.find(d => d.idDataset === Number(id));
        setTimeout(function () {
          if (dataset) {
            defer.resolve(dataset);
          } else {
            defer.reject(new Error("Dataset no encontrado"));
          }
        }, 180);
      }).promise();
    }

    return $.ajax({
      url: `/api/datasets/${id}`,
      method: "GET",
      dataType: "json"
    });
  }

  function ajaxCreateDataset() {
    if (DEBUG) {
      return $.Deferred(function (defer) {
        setTimeout(function () {
          defer.resolve({
            ok: true,
            idDataset: 999
          });
        }, 250);
      }).promise();
    }

    return $.ajax({
      url: "/api/datasets",
      method: "POST",
      contentType: "application/json",
      data: JSON.stringify({
        name: "NUEVO DATASET",
        entries: 0
      }),
      dataType: "json"
    });
  }

  function loadDatasets() {
    renderLoading();

    ajaxGetDatasets()
      .done(function (datasets) {
        renderDatasets(datasets);
      })
      .fail(function () {
        renderError();
      });
  }

  function bindEvents() {
    $container.on("mouseenter", ".dataset-button", function () {
      const datasetId = $(this).data("id");
      const button = this;

      ajaxGetDatasetById(datasetId)
        .done(function (dataset) {
          showTooltip(dataset, button);
        })
        .fail(function () {
          hideTooltip();
        });
    });

    $container.on("mouseleave", ".dataset-button", function () {
      hideTooltip();
    });

    $container.on("click", '[data-action="view"]', function () {
      const datasetId = $(this).data("id");

      ajaxGetDatasetById(datasetId)
        .done(function (dataset) {
          alert(`Ver dataset: ${dataset.name} (ID ${dataset.idDataset})`);
        })
        .fail(function () {
          alert("No se pudo recuperar el dataset.");
        });
    });

    $container.on("click", '[data-action="continue"]', function () {
      const datasetId = $(this).data("id");

      ajaxGetDatasetById(datasetId)
        .done(function (dataset) {
          alert(`Continuar con: ${dataset.name} (ID ${dataset.idDataset})`);
        })
        .fail(function () {
          alert("No se pudo recuperar el dataset.");
        });
    });

    $("#btnNuevoDataset").on("click", function () {
      ajaxCreateDataset()
        .done(function (response) {
          alert(`Dataset creado correctamente. ID: ${response.idDataset}`);
        })
        .fail(function () {
          alert("No se pudo crear el dataset.");
        });
    });

    $(window).on("scroll resize", function () {
        hideTooltip();
    });
  }

  $(document).ready(function () {
    bindEvents();
    loadDatasets();
  });
})();