const https = require("node:https");

const TIN_INFO_URL = "https://api.ebarimt.mn/api/info/check/getTinInfo";
const TAXPAYER_INFO_URL = "https://api.ebarimt.mn/api/info/check/getInfo";
const REQUEST_TIMEOUT_MS = 8000;

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

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(url);
    const request = https.request(
      requestUrl,
      {
        family: 4,
        headers: {
          Accept: "application/json",
          "User-Agent": "tatvar-vercel-proxy/1.0",
        },
        method: "GET",
        timeout: REQUEST_TIMEOUT_MS,
      },
      (upstreamResponse) => {
        let body = "";

        upstreamResponse.setEncoding("utf8");
        upstreamResponse.on("data", (chunk) => {
          body += chunk;
        });
        upstreamResponse.on("end", () => {
          try {
            resolve({
              ok:
                upstreamResponse.statusCode >= 200 &&
                upstreamResponse.statusCode < 300,
              payload: JSON.parse(body),
              status: upstreamResponse.statusCode,
            });
          } catch (error) {
            error.message = `Invalid JSON from upstream API: ${error.message}`;
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(
        Object.assign(new Error("Upstream API request timed out."), {
          code: "ETIMEDOUT",
        }),
      );
    });

    request.on("error", reject);
    request.end();
  });
}

async function fetchApiJson(url) {
  let upstream;

  try {
    upstream = await requestJson(url);
  } catch (error) {
    const networkError = new Error(
      `Upstream network error: ${
        error.code || error.cause?.code || error.message
      }`,
    );
    networkError.status = 502;
    throw networkError;
  }

  const payload = upstream.payload;

  if (!upstream.ok || Number(payload?.status) >= 400) {
    const error = new Error(payload?.msg || "Upstream API request failed.");
    error.status = upstream.ok ? 400 : upstream.status;
    throw error;
  }

  return payload;
}

function extractTin(payload) {
  if (payload?.data === null || payload?.data === undefined) {
    const error = new Error(payload?.msg || "TIN was not found.");
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
    const error = new Error(payload.msg || "TIN was not found.");
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
    response.status(405).json({
      status: 405,
      msg: "Use a GET request.",
      data: null,
    });
    return;
  }

  const registrationNumber = normalizeRegistrationNumber(request.query.regNo);

  if (!registrationNumber) {
    response.status(400).json({
      status: 400,
      msg: "Registration number is required.",
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
      msg: taxpayerPayload.msg || "OK",
      data: {
        tin,
        ...taxpayerPayload.data,
      },
    });
  } catch (error) {
    response.status(error.status || 500).json({
      status: error.status || 500,
      msg: error.message || "Taxpayer lookup failed.",
      data: null,
    });
  }
};
