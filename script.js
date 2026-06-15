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
const glassCanvas = document.getElementById("glass-canvas");
const glassSourceImage = document.getElementById("glass-source-image");

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
const GLASS_BACKGROUND_URL = "https://www.bubbbly.com/assets/02386bb9-ef66-4f7b-a67.webp";
const THEME_ORDER = ["glass", "classic", "semi"];
const THEME_LABELS = {
  glass: "Glass",
  classic: "Classic",
  semi: "Semi",
};

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
let glassRenderer = null;

function setTheme(theme) {
  const nextTheme = THEME_ORDER.includes(theme) ? theme : "glass";
  document.body.dataset.theme = nextTheme;
  themeToggle.textContent = THEME_LABELS[nextTheme];
  themeToggle.dataset.theme = nextTheme;
  themeToggle.setAttribute("aria-pressed", String(nextTheme !== "classic"));
  themeToggle.setAttribute(
    "aria-label",
    `Одоогийн загвар: ${THEME_LABELS[nextTheme]}. Солих`,
  );
  localStorage.setItem("taxLookupTheme", nextTheme);
}

function getNextTheme(theme) {
  const currentIndex = THEME_ORDER.indexOf(theme);
  return THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length] || "glass";
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
  glassRenderer?.loadBackgroundUrl(currentBackgroundUrl);
  setLookupStatus("Дэвсгэр зураг шинэчлэгдлээ.", "success");
}

function createGlassRenderer() {
  if (!glassCanvas || !lookupCard) {
    document.body.classList.add("no-glass-renderer");
    return null;
  }

  const gl = glassCanvas.getContext("webgl", {
    alpha: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    document.body.classList.add("no-glass-renderer");
    return null;
  }

  document.body.classList.remove("no-glass-renderer");

  const vertexSource = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision mediump float;

    uniform vec3 iResolution;
    uniform vec2 uImgRes;
    uniform vec2 uCardPos;
    uniform vec2 uCardHalf;
    uniform float uWhite;
    uniform sampler2D iChannel0;

    vec2 coverUv(vec2 uv) {
      float ca = iResolution.x / iResolution.y;
      float ia = uImgRes.x / uImgRes.y;
      vec2 s = ca > ia ? vec2(1.0, ia / ca) : vec2(ca / ia, 1.0);
      return (uv - 0.5) * s + 0.5;
    }

    void main() {
      const float POWER_EXPONENT = 6.0;
      vec2 fragCoord = gl_FragCoord.xy;
      vec2 uv = fragCoord / iResolution.xy;

      vec2 d = (fragCoord - uCardPos) / uCardHalf;
      float roundedBox = pow(abs(d.x), POWER_EXPONENT) + pow(abs(d.y), POWER_EXPONENT);

      float rb1 = clamp((1.0 - roundedBox) * 8.0, 0.0, 1.0);
      float rb2 = clamp((0.955 - roundedBox * 0.95) * 16.0, 0.0, 1.0) -
                  clamp((0.91 - roundedBox * 0.95) * 16.0, 0.0, 1.0);
      float rb3 = clamp((1.5 - roundedBox * 1.1) * 2.0, 0.0, 1.0) -
                  clamp((1.0 - roundedBox * 1.1) * 2.0, 0.0, 1.0);

      vec4 bg = texture2D(iChannel0, coverUv(uv));
      float transition = smoothstep(0.0, 1.0, rb1 + rb2);
      vec4 color = bg;

      if (transition > 0.0) {
        vec2 cuv = uCardPos / iResolution.xy;
        vec2 lens = cuv + (uv - cuv) * (1.0 - roundedBox * 0.22);

        vec4 acc = vec4(0.0);
        float total = 0.0;
        for (float x = -4.0; x <= 4.0; x++) {
          for (float y = -4.0; y <= 4.0; y++) {
            vec2 off = vec2(x, y) * 1.2 / iResolution.xy;
            acc += texture2D(iChannel0, coverUv(lens + off));
            total += 1.0;
          }
        }
        acc /= total;

        float dy = uv.y - cuv.y;
        float gradient = clamp((clamp(dy, 0.0, 0.2) + 0.1) / 2.0, 0.0, 1.0) +
                         clamp((clamp(-dy, -1000.0, 0.2) * rb3 + 0.1) / 2.0, 0.0, 1.0);
        vec4 lighting = clamp(acc + vec4(rb1) * gradient + vec4(rb2) * 0.3, 0.0, 1.0);

        lighting = mix(lighting, vec4(1.0), uWhite * 0.97);
        color = mix(bg, lighting, transition);
      }

      gl_FragColor = vec4(color.rgb, 1.0);
    }
  `;

  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "Shader compile failed");
    }

    return shader;
  }

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    }
  } catch (error) {
    document.body.classList.add("no-glass-renderer");
    return null;
  }

  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "iResolution"),
    imageResolution: gl.getUniformLocation(program, "uImgRes"),
    cardPosition: gl.getUniformLocation(program, "uCardPos"),
    cardHalf: gl.getUniformLocation(program, "uCardHalf"),
    white: gl.getUniformLocation(program, "uWhite"),
    texture: gl.getUniformLocation(program, "iChannel0"),
  };

  const texture = gl.createTexture();
  let imageWidth = 1600;
  let imageHeight = 1000;
  let isRunning = false;

  function setCanvasSize() {
    glassCanvas.width = window.innerWidth;
    glassCanvas.height = window.innerHeight;
  }

  function uploadTexture(source, width, height) {
    imageWidth = width;
    imageHeight = height;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function useProceduralBackground() {
    const fallbackCanvas = document.createElement("canvas");
    fallbackCanvas.width = 1600;
    fallbackCanvas.height = 1000;
    const context = fallbackCanvas.getContext("2d");
    if (!context) {
      return;
    }

    const sky = context.createLinearGradient(0, 0, 0, 1000);
    sky.addColorStop(0, "#5aa7e8");
    sky.addColorStop(1, "#8cc7f5");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1600, 1000);

    const petals = ["#ffffff", "#ff5a3c", "#ff8b4a", "#ffb14d", "#ff7d9d", "#ffe26b"];

    function flower(centerX, centerY, radius, color) {
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        context.save();
        context.translate(
          centerX + Math.cos(angle) * radius * 0.8,
          centerY + Math.sin(angle) * radius * 0.8,
        );
        context.rotate(angle);
        context.fillStyle = color;
        context.beginPath();
        context.ellipse(0, 0, radius * 0.75, radius * 0.4, 0, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      context.fillStyle = "#f5c542";
      context.beginPath();
      context.arc(centerX, centerY, radius * 0.35, 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = "#3f7d3a";
    context.lineWidth = 10;

    for (let index = 0; index < 26; index += 1) {
      const startX = Math.random() * 1600;
      const startY = Math.random() * 1000;
      context.beginPath();
      context.moveTo(startX, startY + 220);
      context.quadraticCurveTo(startX + 60, startY + 110, startX, startY);
      context.stroke();
    }

    for (let index = 0; index < 34; index += 1) {
      flower(
        Math.random() * 1600,
        Math.random() * 1000,
        36 + Math.random() * 60,
        petals[Math.floor(Math.random() * petals.length)],
      );
    }

    uploadTexture(fallbackCanvas, 1600, 1000);
  }

  function loadBackgroundUrl(url) {
    const image = glassSourceImage || new Image();
    image.onload = () => {
      try {
        uploadTexture(image, image.naturalWidth, image.naturalHeight);
      } catch (error) {
        useProceduralBackground();
      }
    };
    image.onerror = useProceduralBackground;
    image.crossOrigin = url.startsWith("http") ? "anonymous" : "";
    image.src = url;
  }

  function render() {
    if (document.body.dataset.theme === "glass") {
      const rect = lookupCard.getBoundingClientRect();

      if (rect.width && rect.height) {
        const centerX = rect.left + rect.width / 2;
        const centerY = glassCanvas.height - (rect.top + rect.height / 2);

        gl.viewport(0, 0, glassCanvas.width, glassCanvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform3f(uniforms.resolution, glassCanvas.width, glassCanvas.height, 1);
        gl.uniform2f(uniforms.imageResolution, imageWidth, imageHeight);
        gl.uniform2f(uniforms.cardPosition, centerX, centerY);
        gl.uniform2f(uniforms.cardHalf, rect.width / 2 + 4, rect.height / 2 + 4);
        gl.uniform1f(uniforms.white, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(uniforms.texture, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    window.requestAnimationFrame(render);
  }

  window.addEventListener("resize", setCanvasSize);
  setCanvasSize();
  useProceduralBackground();

  return {
    loadBackgroundUrl,
    start() {
      if (isRunning) {
        return;
      }

      isRunning = true;
      window.requestAnimationFrame(render);
    },
  };
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
  setTheme(getNextTheme(document.body.dataset.theme));
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

glassRenderer = createGlassRenderer();
glassRenderer?.loadBackgroundUrl(GLASS_BACKGROUND_URL);
glassRenderer?.start();

setTheme(localStorage.getItem("taxLookupTheme") || "glass");
setApiMode(isDirectApiMode() ? "direct" : "proxy");
makeCardDraggable();
clearResult();
