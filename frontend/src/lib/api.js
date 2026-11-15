// Thin wrapper around fetch for the Python API.
// Errors always carry a message that is safe to show on the page.

export async function request(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error("The keydex server is not reachable. Is the backend running?");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The keydex server is not reachable. Is the backend running?");
  }

  if (!response.ok) {
    const error = new Error(data.error || "That request could not be completed.");
    error.code = data.code;
    throw error;
  }
  return data;
}

export function post(path, body, signal) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
}

export function money(value, currency = "USD") {
  if (value == null) return "price not listed";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

export function priceLabel(keyboard) {
  const from = money(keyboard.price, keyboard.currency);
  if (keyboard.price_max && keyboard.price_max > keyboard.price) {
    return `${from} – ${money(keyboard.price_max, keyboard.currency)}`;
  }
  return from;
}

// Listing links come from scraped data, so only plain web links are allowed through.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
