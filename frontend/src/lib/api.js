export async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The keyboard service is unavailable. Please try again in a moment.",
    );
  }
  if (!response.ok)
    throw new Error(
      data.error || "We couldn’t complete that request. Please try again.",
    );
  return data;
}

export const post = (path, body, signal) =>
  request(path, { method: "POST", body: JSON.stringify(body), signal });
export const filterKeys = [
  "q",
  "size",
  "material",
  "brand",
  "switch",
  "min_price",
  "max_price",
  "currency",
  "connectivity",
  "assembly",
  "switch_type",
  "in_stock",
  "hot_swap",
  "sort",
  "order",
];
export function catalogQuery(params) {
  const query = new URLSearchParams();
  for (const key of filterKeys)
    if (params.get(key)) query.set(key, params.get(key));
  return query.toString();
}
export function money(value, currency) {
  if (value == null) return "Price not listed";
  if (!currency) return `${Number(value).toFixed(2)} (currency not listed)`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
export function withQuery(path, params) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
