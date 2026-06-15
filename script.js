const taxpayerInput = document.getElementById("taxpayer-input");
const lookupForm = document.getElementById("taxpayer-lookup-form");
const lookupButton = document.getElementById("lookup-button");
const lookupStatus = document.getElementById("lookup-status");
const themeToggle = document.getElementById("theme-toggle");

const taxpayerName = document.getElementById("taxpayer-name");
const taxpayerTin = document.getElementById("taxpayer-tin");
const foundBadge = document.getElementById("found-badge");
const vatPayer = document.getElementById("vat-payer");
const cityTaxPayer = document.getElementById("city-tax-payer");
const taxpayerFound = document.getElementById("taxpayer-found");
const vatRegisteredDate = document.getElementById("vat-registered-date");

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
  vat: EMPTY,
  city: EMPTY,
  found: EMPTY,
  date: EMPTY,
};

function setTheme(theme) {
  const nextTheme = theme === "classic" ? "classic" : "glass";
  document.body.dataset.theme = nextTheme;
  themeToggle.textContent = nextTheme === "glass" ? "Classic" : "Glass";
  themeToggle.setAttribute("aria-pressed", String(nextTheme === "glass"));
  localStorage.setItem("taxLookupTheme", nextTheme);
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

  foundBadge.textContent = result.badge;
  foundBadge.className = `result-badge ${result.badgeClass}`;
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
  const tinPayload = await fetchApiJson(
    buildApiUrl(TIN_INFO_URL, { regNo: registrationNumber }),
  );
  const tin = extractTin(tinPayload);

  const taxpayerPayload = await fetchApiJson(
    buildApiUrl(TAXPAYER_INFO_URL, { tin }),
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
      badge: found ? "Олдсон" : "Олдсонгүй",
      badgeClass: found ? "success" : "error",
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
    setLookupStatus(getErrorMessage(error), "error");
  } finally {
    setLoading(false);
  }
}

themeToggle.addEventListener("click", () => {
  setTheme(document.body.dataset.theme === "glass" ? "classic" : "glass");
});

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  lookupTaxpayer();
});

setTheme(localStorage.getItem("taxLookupTheme") || "glass");
clearResult();
