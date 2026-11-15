// Thin wrapper around fetch for the Python API.
// Errors always carry a message that is safe to show on the page.

const UNREACHABLE = "The keydex server is not reachable. Is the backend running?";
const CUT_OFF = "The answer was cut off. Please try again.";

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
    throw new Error(UNREACHABLE);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(UNREACHABLE);
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

// POST that reports progress while the server works. With "stream": true the chatbot
// answers one JSON object per line: {type: "status", text} any number of times, then
// {type: "reply", ...} or {type: "error", error}. Resolves to the reply.
export async function postWithStatus(path, body, onStatus) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, stream: true }),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }

  // Refused before any work started, or a backend that does not stream: plain JSON.
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !response.body || !type.includes("ndjson")) {
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(UNREACHABLE);
    }
    if (!response.ok) throw new Error(data.error || "That request could not be completed.");
    return data;
  }

  let answer = null;
  let failure = "";
  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "status") onStatus?.(event.text);
    else if (event.type === "error") failure = event.error || "That request could not be completed.";
    else if (event.type === "reply") answer = event;
  };

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = done ? "" : lines.pop();
      lines.forEach(handle);
      if (done) break;
    }
  } catch {
    throw new Error(CUT_OFF);
  }

  if (failure) throw new Error(failure);
  if (!answer) throw new Error(CUT_OFF);
  return answer;
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
