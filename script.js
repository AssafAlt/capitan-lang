const Storage = {
  save: function (results) {
    const vault = this.getVault();
    const key = results.key;

    if (!vault[key]) vault[key] = {};

    $.each(results, function (code, value) {
      if (code !== "key") {
        vault[key][code] = value;
      }
    });

    localStorage.setItem("capitan_vault", JSON.stringify(vault));
  },
  getVault: function () {
    const vault = JSON.parse(localStorage.getItem("capitan_vault")) || {};
    return vault;
  },
  saveDisplayPref: function (langsToDisplay) {
    localStorage.setItem("capitan_prefs", JSON.stringify(langsToDisplay));
  },
  getDisplayPref: function () {
    const prefs = JSON.parse(localStorage.getItem("capitan_prefs")) || [];
    return prefs;
  },
};

// Global Voice Reader
function speak(text, langCode) {
  if (!text) return;
  const msg = new SpeechSynthesisUtterance(text);
  const locales = {
    en: "en-US",
    es: "es-ES",
    ja: "ja-JP",
    ar: "ar-SA",
    he: "he-IL",
  };
  msg.lang = locales[langCode] || langCode;
  window.speechSynthesis.speak(msg);
}
async function translateSingle(from, to, word) {
  if (from === to) return;
  const baseUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&dt=t&q=${encodeURIComponent(word)}`;

  try {
    if (from === "en") {
      const res = await $.ajax({ url: `${baseUrl}&tl=${to}`, type: "GET" });
      const targetValue = res[0][0][0].trim();
      return {
        key: word.toLowerCase().trim(),
        en: word.trim(),
        [to]: targetValue,
      };
    }

    const [resEn, resTarget] = await Promise.all([
      $.ajax({ url: `${baseUrl}&tl=en`, type: "GET" }),
      $.ajax({ url: `${baseUrl}&tl=${to}`, type: "GET" }),
    ]);

    const enValue = resEn[0][0][0].trim();
    const targetValue = resTarget[0][0][0].trim();

    return {
      key: enValue.toLowerCase(),
      en: enValue,
      [to]: targetValue,
      [from]: word.trim(),
    };
  } catch (error) {
    console.error("Translation failed:", error);
  }
}

/**
 * 2. UI & EVENT LOGIC
 */
$(document).ready(function () {
  const $grid = $("#lang-grid");
  const $frame = $("#content-frame");
  const $frameOps = $("#iframe-operators");
  const $backBtn = $("#back-btn");
  const $selector = $("#selector-screen");
  const $prefsContainer = $("#display-prefs-container");
  const $srcSelect = $("#src-lang-select");
  const $targetSelect = $("#target-lang-select");
  const $header = $("#table-header-row");
  const $body = $("#vocab-body");
  const $preview = $("#translation-preview");
  let tempResult = null;
  let tempFromCode = "",
    tempToCode = "";

  const languages = {
    en: { name: "English", native: "English", hasPage: false },
    es: { name: "Spanish", native: "Español", hasPage: true },
    ja: { name: "Japanese", native: "日本語", hasPage: false },
    ar: { name: "Arabic", native: "العربية", hasPage: false },
    he: { name: "Hebrew", native: "עברית", hasPage: false },
  };

  let tempTargetCode = "";

  // --- UI Population ---

  $.each(languages, function (code, info) {
    if (code !== "he") {
      $grid.append(
        `<button class="lang-btn" data-lang="${code}" data-has-page="${info.hasPage}"><span class="lang-name">${info.name}</span><small class="lang-native">${info.native}</small></button>`,
      );
    }
    $prefsContainer.append(
      `<label class="pref-item"><input type="checkbox" class="lang-toggle" value="${code}"> ${info.name}</label>`,
    );
    $srcSelect.append(`<option value="${code}">${info.name}</option>`);
    $targetSelect.append(`<option value="${code}">${info.name}</option>`);
  });

  $srcSelect.val("en");
  $targetSelect.val("es");

  // --- Core Table Rendering ---

  function renderMasterTable() {
    const vault = Storage.getVault();
    const prefs = Storage.getDisplayPref();
    $header.empty();
    $body.empty();
    if (!prefs.length) return;

    $.each(prefs, function (i, code) {
      $header.append(
        `<th class="col-${code}">${languages[code].name.toUpperCase()}</th>`,
      );
    });
    $header.append('<th class="col-actions">ACTIONS</th>');

    $.each(vault, function (key, data) {
      let rowHtml = `<tr>`;
      $.each(prefs, function (i, code) {
        const text = data[code] || "---";
        const btn = data[code]
          ? `<button class="btn-mini-speak" data-text="${text}" data-lang="${code}">🔊</button>`
          : "";
        rowHtml += `<td><div class="cell-flex"><span>${text}</span> ${btn}</div></td>`;
      });
      rowHtml += `<td><button class="btn-delete" data-key="${key}">×</button></td></tr>`;
      $body.prepend(rowHtml);
    });
  }

  // --- Events ---

  $("#btn-translate").on("click", async function () {
    const from = $srcSelect.val();
    const to = $targetSelect.val();
    const word = $("#input-source").val().trim();
    if (!word) return;

    const results = await translateSingle(from, to, word);
    if (results) {
      tempResult = results;
      tempFromCode = from;
      tempToCode = to;

      // BLUNT UI: Only From and To
      $("#prev-source").text(results[from]);
      $("#prev-target").text(results[to]);

      $preview.show();
    }
  });

  $("#btn-confirm-save").on("click", function () {
    if (tempResult) {
      Storage.save(tempResult);
      renderMasterTable();
      $preview.hide();
      $("#input-source").val("");
    }
  });
  $("#speak-prev-source").on("click", function () {
    if (tempResult) speak(tempResult[tempFromCode], tempFromCode);
  });

  $("#speak-prev-target").on("click", function () {
    if (tempResult) speak(tempResult[tempToCode], tempToCode);
  });

  $("#btn-cancel").on("click", () => $preview.hide());

  $(document).on("click", ".btn-mini-speak", function () {
    speak(
      $(this).closest(".cell-flex").find("span").text().trim(),
      $(this).data("lang"),
    );
  });

  $(document).on("change", ".lang-toggle", function () {
    let selected = [];
    $(".lang-toggle:checked").each(function () {
      selected.push($(this).val());
    });
    Storage.saveDisplayPref(selected);
    renderMasterTable();
  });

  // Navigation & Init
  $(document).on("click", ".lang-btn", function () {
    const code = $(this).data("lang");
    if (!$(this).data("has-page")) return;
    $frame.attr("src", `./${code}.html`);
    $selector.fadeOut(250, () => {
      $frame.fadeIn(250);
      $frameOps.fadeIn(250);
    });
  });

  $(document).on("click", ".btn-delete", function () {
    const key = $(this).data("key");
    if (confirm(`Are you sure you want to remove "${key}" from your vault?`)) {
      const vault = Storage.getVault();
      delete vault[key];
      localStorage.setItem("capitan_vault", JSON.stringify(vault));
      renderMasterTable();
    }
  });

  // 2. Long Press to Edit Logic
  let holdTimer;

  $(document).on("mousedown touchstart", ".cell-flex span", function (e) {
    const $span = $(this);

    // Clear any previous timers to prevent double-firing
    clearTimeout(holdTimer);

    holdTimer = setTimeout(() => {
      // 1. Identify what we are editing
      const $td = $span.closest("td");
      const $tr = $span.closest("tr");
      const colIndex = $td.index();

      // Get the language code from the table header
      const fullClass = $("#table-header-row th").eq(colIndex).attr("class");
      const code = fullClass.replace("col-", "");
      const key = $tr.find(".btn-delete").data("key");

      if (!key || !code) return;

      // 2. Enable Editing
      $span.attr("contenteditable", "true").addClass("editing-cell").focus();

      // 3. Modern Selection (Replaces deprecated execCommand)
      const range = document.createRange();
      range.selectNodeContents($span[0]);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      // 4. Save Logic (Happens once when you finish)
      $span.one("blur", function () {
        const newValue = $span.text().trim();
        $span.removeAttr("contenteditable").removeClass("editing-cell");

        const vault = Storage.getVault();
        if (vault[key]) {
          const oldValue = vault[key][code];
          vault[key][code] = newValue;
          localStorage.setItem("capitan_vault", JSON.stringify(vault));

          // Logic: Refresh only if adding a word to an empty cell
          if ((!oldValue || oldValue === "---") && newValue !== "") {
            renderMasterTable();
          } else {
            // Update speaker data silently for immediate use
            $td.find(".btn-mini-speak").data("text", newValue);
          }
        }
        // Clean up keydown listener
        $span.off("keydown");
      });

      // 5. Allow 'Enter' to save
      $span.on("keydown", function (e) {
        if (e.which === 13) {
          e.preventDefault();
          $span.blur();
        }
      });
    }, 700); // 0.7 seconds hold
  });

  $(document).on("mouseup mouseleave touchend", function () {
    clearTimeout(holdTimer);
  });

  $backBtn.on("click", () => {
    $frame.fadeOut(200);
    $frameOps.fadeOut(200, () => {
      $selector.fadeIn(200);
      $frame.attr("src", "");
    });
  });

  $("#btn-swap").on("click", () => {
    const s = $srcSelect.val();
    const t = $targetSelect.val();
    $srcSelect.val(t);
    $targetSelect.val(s);
  });

  const savedPrefs = Storage.getDisplayPref();
  if (savedPrefs.length) {
    $(".lang-toggle").each(function () {
      $(this).prop("checked", savedPrefs.includes($(this).val()));
    });
  }
  renderMasterTable();
});
