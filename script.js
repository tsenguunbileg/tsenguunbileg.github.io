const taxpayerInput = document.getElementById("taxpayer-input");
const lookupForm = document.getElementById("taxpayer-lookup-form");
const lookupButton = document.getElementById("lookup-button");
const lookupStatus = document.getElementById("lookup-status");
const themeToggle = document.getElementById("theme-toggle");
const apiModeToggle = document.getElementById("api-mode-toggle");
const backgroundButton = document.getElementById("background-button");
const backgroundInput = document.getElementById("background-input");
const appShell = document.querySelector(".app-shell");
const lookupCard = document.querySelector(".lookup-card");

const taxpayerName = document.getElementById("taxpayer-name");
const taxpayerTin = document.getElementById("taxpayer-tin");
const foundBadge = document.getElementById("found-badge");
const vatPayer = document.getElementById("vat-payer");
const cityTaxPayer = document.getElementById("city-tax-payer");
const taxpayerFound = document.getElementById("taxpayer-found");
const vatRegisteredDate = document.getElementById("vat-registered-date");

const DIRECT_TIN_INFO_URL = "https://api.ebarimt.mn/api/info/check/getTinInfo";
const DIRECT_TAXPAYER_INFO_URL = "https://api.ebarimt.mn/api/info/check/getInfo";
const TIN_INFO_URL = "/api/ebarimt/getTinInfo";
const TAXPAYER_INFO_URL = "/api/ebarimt/getInfo";
const TAXPAYER_PROXY_URL = "/api/taxpayer";

const YES = "Тийм";
const NO = "Үгүй";
const EMPTY = "-";

class ProxyUnavailableError extends Error {}
class ProxyUpstreamError extends Error {}

const initialResult = {
  name: "Регистрийн дугаар оруулна уу",
  tin: "ТИН дугаар энд харагдана",
  badge: "Хүлээгдэж байна",
  badgeClass: "neutral",
  badgeDisabled: true,
  tinValue: "",
  vat: EMPTY,
  city: EMPTY,
  found: EMPTY,
  date: EMPTY,
};

let currentTin = "";
let currentBackgroundUrl = "";
let hasDraggedCard = false;

function setTheme(theme) {
  const nextTheme = theme === "classic" ? "classic" : "glass";
  document.body.dataset.theme = nextTheme;
  themeToggle.textContent = nextTheme === "glass" ? "Classic" : "Glass";
  themeToggle.setAttribute("aria-pressed", String(nextTheme === "glass"));
  localStorage.setItem("taxLookupTheme", nextTheme);
}

function setApiMode(mode, options = {}) {
  const nextMode = mode === "direct" ? "direct" : "proxy";
  localStorage.setItem("taxLookupApiMode", nextMode);

  apiModeToggle.textContent = nextMode === "direct" ? "API: Direct" : "API: Proxy";
  apiModeToggle.setAttribute("aria-pressed", String(nextMode === "direct"));
  apiModeToggle.classList.toggle("is-active", nextMode === "direct");

  if (options.updateUrl) {
    const url = new URL(window.location.href);
    if (nextMode === "direct") {
      url.searchParams.set("api", "direct");
    } else {
      url.searchParams.delete("api");
    }
    window.history.replaceState({}, "", url.toString());
  }
}

function normalizeRegistrationNumber(value) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function buildApiUrl(baseUrl, params) {
  const url = new URL(baseUrl, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

function isTruthyApiValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    return ["1", "true", "yes", "y", "тийм"].includes(value.trim().toLowerCase());
  }

  return false;
}

function displayBoolean(value) {
  if (value === null || value === undefined || value === "") {
    return EMPTY;
  }

  return isTruthyApiValue(value) ? YES : NO;
}

function setLookupStatus(message, type = "idle") {
  lookupStatus.textContent = message;
  lookupStatus.dataset.type = type;
}

function setLoading(isLoading) {
  lookupButton.disabled = isLoading;
  lookupButton.classList.toggle("is-loading", isLoading);
  lookupButton.textContent = isLoading ? "..." : "Хайх";
}

function renderResult(result) {
  taxpayerName.textContent = result.name;
  taxpayerTin.textContent = result.tin;
  vatPayer.textContent = result.vat;
  cityTaxPayer.textContent = result.city;
  taxpayerFound.textContent = result.found;
  vatRegisteredDate.textContent = result.date;

  currentTin = result.tinValue || "";
  foundBadge.textContent = result.badge;
  foundBadge.className = `result-badge ${result.badgeClass}`;
  foundBadge.disabled = result.badgeDisabled ?? !currentTin;
  foundBadge.setAttribute(
    "aria-label",
    currentTin ? `ТИН ${currentTin} дугаар хуулах` : result.badge,
  );
}

function clearResult() {
  renderResult(initialResult);
}

async function fetchApiJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (options.allowProxyFallback && response.status === 404) {
    throw new ProxyUnavailableError();
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error("API-с ирсэн хариуг уншиж чадсангүй.");
  }

  if (response.status >= 500 && payload?.msg?.includes("Upstream network error")) {
    throw Object.assign(new ProxyUpstreamError(payload.msg), {
      status: response.status,
    });
  }

  if (!response.ok) {
    throw new Error(payload?.msg || `API алдаа (${response.status}).`);
  }

  if (Number(payload?.status) >= 400) {
    const error = new Error(payload?.msg || "API хүсэлт амжилтгүй боллоо.");

    if (response.status >= 500 || payload?.msg?.includes("Upstream network error")) {
      throw Object.assign(new ProxyUpstreamError(error.message), {
        status: response.status,
      });
    }

    throw error;
  }

  return payload;
}

function canTrySameOriginProxy() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function getApiMode() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("api") || localStorage.getItem("taxLookupApiMode") || "")
    .trim()
    .toLowerCase();
}

function isDirectApiMode() {
  return getApiMode() === "direct";
}

function fallbackCopyText(value) {
  const copyInput = document.createElement("textarea");
  copyInput.value = value;
  copyInput.setAttribute("readonly", "");
  copyInput.style.position = "fixed";
  copyInput.style.left = "-9999px";
  document.body.append(copyInput);
  copyInput.select();

  try {
    return document.execCommand("copy");
  } finally {
    copyInput.remove();
  }
}

async function copyTinToClipboard() {
  if (!currentTin) {
    return;
  }

  const originalText = foundBadge.textContent;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(currentTin);
    } else if (!fallbackCopyText(currentTin)) {
      throw new Error("Clipboard API unavailable");
    }

    foundBadge.textContent = "Хуулсан";
    setLookupStatus("ТИН дугаар clipboard-д хууллаа.", "success");
    window.setTimeout(() => {
      if (currentTin) {
        foundBadge.textContent = "ТИН хуулах";
      }
    }, 1300);
  } catch (error) {
    foundBadge.textContent = originalText;
    setLookupStatus("Clipboard-д хуулах боломжгүй байна.", "error");
  }
}

function setCustomBackground(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    setLookupStatus("Зөвхөн зураг файл сонгоно уу.", "error");
    return;
  }

  if (currentBackgroundUrl) {
    URL.revokeObjectURL(currentBackgroundUrl);
  }

  currentBackgroundUrl = URL.createObjectURL(file);
  document.documentElement.style.setProperty(
    "--page-bg-image",
    `url("${currentBackgroundUrl}")`,
  );
  setLookupStatus("Дэвсгэр зураг шинэчлэгдлээ.", "success");
}

function clampCardPosition(left, top) {
  const rect = appShell.getBoundingClientRect();
  const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(8, window.innerHeight - rect.height - 8);

  return {
    left: Math.min(Math.max(left, 8), maxLeft),
    top: Math.min(Math.max(top, 8), maxTop),
  };
}

function makeCardDraggable() {
  if (!appShell || !lookupCard) {
    return;
  }

  let drag = null;

  const endDrag = () => {
    if (!drag) {
      return;
    }

    lookupCard.releasePointerCapture?.(drag.pointerId);
    lookupCard.classList.remove("is-dragging");
    drag = null;
  };

  lookupCard.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 640) {
      return;
    }

    if (event.target.closest("a, button, input, label, select, textarea, svg")) {
      return;
    }

    const rect = appShell.getBoundingClientRect();
    const cardWidth = rect.width;
    appShell.classList.add("is-dragged");
    appShell.style.width = `${cardWidth}px`;
    appShell.style.left = `${rect.left}px`;
    appShell.style.top = `${rect.top}px`;

    drag = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
    hasDraggedCard = true;
    lookupCard.setPointerCapture(event.pointerId);
    lookupCard.classList.add("is-dragging");
  });

  lookupCard.addEventListener("pointermove", (event) => {
    if (!drag) {
      return;
    }

    const next = clampCardPosition(event.clientX - drag.dx, event.clientY - drag.dy);
    appShell.style.left = `${next.left}px`;
    appShell.style.top = `${next.top}px`;
  });

  lookupCard.addEventListener("pointerup", endDrag);
  lookupCard.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", () => {
    if (!hasDraggedCard || window.innerWidth <= 640) {
      return;
    }

    const rect = appShell.getBoundingClientRect();
    const next = clampCardPosition(rect.left, rect.top);
    appShell.style.left = `${next.left}px`;
    appShell.style.top = `${next.top}px`;
  });
}

function extractTin(payload) {
  if (!payload || payload.data === null || payload.data === undefined) {
    throw new Error(payload?.msg || "ТИН дугаар олдсонгүй.");
  }

  if (typeof payload.data === "string" || typeof payload.data === "number") {
    return String(payload.data).trim();
  }

  const tin =
    payload.data.tin ||
    payload.data.tinNumber ||
    payload.data.taxpayerTin ||
    payload.data.value;

  if (!tin) {
    throw new Error(payload.msg || "ТИН дугаар олдсонгүй.");
  }

  return String(tin).trim();
}

function extractTaxpayerInfo(payload) {
  if (!payload || payload.data === null || payload.data === undefined) {
    throw new Error(payload?.msg || "Татвар төлөгчийн мэдээлэл олдсонгүй.");
  }

  if (typeof payload.data !== "object") {
    throw new Error("API-с мэдээлэл буруу бүтэцтэй ирлээ.");
  }

  return payload.data;
}

async function fetchTaxpayerDirectly(registrationNumber) {
  const tinInfoUrl = isDirectApiMode() ? DIRECT_TIN_INFO_URL : TIN_INFO_URL;
  const taxpayerInfoUrl = isDirectApiMode()
    ? DIRECT_TAXPAYER_INFO_URL
    : TAXPAYER_INFO_URL;

  const tinPayload = await fetchApiJson(
    buildApiUrl(tinInfoUrl, { regNo: registrationNumber }),
  );
  const tin = extractTin(tinPayload);

  const taxpayerPayload = await fetchApiJson(
    buildApiUrl(taxpayerInfoUrl, { tin }),
  );
  const info = extractTaxpayerInfo(taxpayerPayload);

  return { tin, info };
}

async function fetchTaxpayerThroughProxy(registrationNumber) {
  const payload = await fetchApiJson(
    buildApiUrl(window.TAXPAYER_API_PROXY_URL || TAXPAYER_PROXY_URL, {
      regNo: registrationNumber,
    }),
    { allowProxyFallback: true },
  );
  const info = extractTaxpayerInfo(payload);
  const tin = info.tin || info.tinNumber || info.taxpayerTin;

  if (!tin) {
    throw new Error("Proxy-с ТИН дугаар ирсэнгүй.");
  }

  return { tin: String(tin).trim(), info };
}

async function fetchTaxpayer(registrationNumber) {
  if (isDirectApiMode()) {
    return fetchTaxpayerDirectly(registrationNumber);
  }

  if (canTrySameOriginProxy()) {
    try {
      return await fetchTaxpayerThroughProxy(registrationNumber);
    } catch (error) {
      if (
        !(error instanceof ProxyUnavailableError) &&
        !(error instanceof ProxyUpstreamError)
      ) {
        throw error;
      }
    }
  }

  return fetchTaxpayerDirectly(registrationNumber);
}

function getErrorMessage(error) {
  if (error instanceof TypeError) {
    return "API хариуг хөтөч уншиж чадсангүй. Энэ хуудсыг /api/taxpayer proxy-той байршуулна уу.";
  }

  return error.message || "Тухайн хуулийн этгээд олдсонгүй.";
}

async function lookupTaxpayer() {
  const registrationNumber = normalizeRegistrationNumber(taxpayerInput.value);

  if (!registrationNumber) {
    clearResult();
    setLookupStatus("Регистрийн дугаараа оруулна уу.", "error");
    taxpayerInput.focus();
    return;
  }

  setLoading(true);
  setLookupStatus("Мэдээлэл хайж байна...", "loading");
  clearResult();

  try {
    const { tin, info } = await fetchTaxpayer(registrationNumber);
    const found = isTruthyApiValue(info.found);

    renderResult({
      name: info.name || "Нэр бүртгэгдээгүй",
      tin: `ТИН дугаар: ${tin}`,
      badge: found ? "ТИН хуулах" : "Олдсонгүй",
      badgeClass: found ? "copyable" : "error",
      badgeDisabled: !found,
      tinValue: found ? tin : "",
      vat: displayBoolean(info.vatPayer),
      city: displayBoolean(info.cityPayer),
      found: displayBoolean(info.found),
      date: info.vatpayerRegisteredDate || "Байхгүй",
    });
    setLookupStatus("Мэдээлэл амжилттай татагдлаа.", "success");
  } catch (error) {
    clearResult();
    foundBadge.textContent = "Олдсонгүй";
    foundBadge.className = "result-badge error";
    foundBadge.disabled = true;
    setLookupStatus(getErrorMessage(error), "error");
  } finally {
    setLoading(false);
  }
}

themeToggle.addEventListener("click", () => {
  setTheme(document.body.dataset.theme === "glass" ? "classic" : "glass");
});

apiModeToggle.addEventListener("click", () => {
  setApiMode(isDirectApiMode() ? "proxy" : "direct", { updateUrl: true });
});

backgroundButton.addEventListener("click", () => {
  backgroundInput.click();
});

backgroundInput.addEventListener("change", (event) => {
  setCustomBackground(event.target.files?.[0]);
  event.target.value = "";
});

foundBadge.addEventListener("click", copyTinToClipboard);

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  lookupTaxpayer();
});

setTheme(localStorage.getItem("taxLookupTheme") || "glass");
setApiMode(isDirectApiMode() ? "direct" : "proxy");
makeCardDraggable();
clearResult();
