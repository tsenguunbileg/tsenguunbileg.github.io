const TIN_INFO_URL = "https://api.ebarimt.mn/api/info/check/getTinInfo";
const TAXPAYER_INFO_URL = "https://api.ebarimt.mn/api/info/check/getInfo";

function normalizeRegistrationNumber(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function buildApiUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

async function fetchApiJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const payload = await response.json();

  if (!response.ok || Number(payload?.status) >= 400) {
    const error = new Error(payload?.msg || "API хүсэлт амжилтгүй боллоо.");
    error.status = response.ok ? 400 : response.status;
    throw error;
  }

  return payload;
}

function extractTin(payload) {
  if (payload?.data === null || payload?.data === undefined) {
    const error = new Error(payload?.msg || "ТИН дугаар олдсонгүй.");
    error.status = 404;
    throw error;
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
    const error = new Error(payload.msg || "ТИН дугаар олдсонгүй.");
    error.status = 404;
    throw error;
  }

  return String(tin).trim();
}

module.exports = async function taxpayerProxy(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.status(405).json({ status: 405, msg: "GET хүсэлт ашиглана уу." });
    return;
  }

  const registrationNumber = normalizeRegistrationNumber(request.query.regNo);

  if (!registrationNumber) {
    response.status(400).json({
      status: 400,
      msg: "Регистрийн дугаараа оруулна уу.",
      data: null,
    });
    return;
  }

  try {
    const tinPayload = await fetchApiJson(
      buildApiUrl(TIN_INFO_URL, { regNo: registrationNumber }),
    );
    const tin = extractTin(tinPayload);
    const taxpayerPayload = await fetchApiJson(
      buildApiUrl(TAXPAYER_INFO_URL, { tin }),
    );

    response.status(200).json({
      status: 200,
      msg: taxpayerPayload.msg || "Амжилттай",
      data: {
        tin,
        ...taxpayerPayload.data,
      },
    });
  } catch (error) {
    response.status(error.status || 500).json({
      status: error.status || 500,
      msg: error.message || "API хүсэлт амжилтгүй боллоо.",
      data: null,
    });
  }
};
