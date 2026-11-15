// The six filters, in the order they appear in the finder.
// Selections live in a plain object keyed by the API's query parameters,
// so the same object can go to /api/keyboards, into the URL, or come
// back from Gemini.

export const FILTER_PARAMS = [
  "size",
  "material",
  "switch",
  "brand",
  "shop",
  "min_price",
  "max_price",
  "min_rating",
];

const PRICE_RANGES = [
  { label: "under $100", value: { max_price: 100 } },
  { label: "$100 – $200", value: { min_price: 100, max_price: 200 } },
  { label: "$200 – $350", value: { min_price: 200, max_price: 350 } },
  { label: "$350 +", value: { min_price: 350 } },
];

const RATINGS = [
  { label: "3 +", value: { min_rating: 3 } },
  { label: "4 +", value: { min_rating: 4 } },
  { label: "5", value: { min_rating: 5 } },
];

// Switch names in the catalog are long and shop-specific
// ("Gateron Jupiter Banana"), so the finder groups them by family.
const SWITCH_FAMILIES = [
  { label: "red", hint: "linear", value: { switch: "Red" } },
  { label: "brown", hint: "tactile", value: { switch: "Brown" } },
  { label: "blue", hint: "clicky", value: { switch: "Blue" } },
  { label: "banana", hint: "tactile", value: { switch: "Banana" } },
  { label: "magnetic", hint: "hall effect", value: { switch: "Magnetic" } },
  { label: "low profile", hint: "slim", value: { switch: "Low Profile" } },
];

const SIZE_ORDER = ["60%", "65%", "75%", "TKL", "96%", "Full-size", "40%", "Alice"];
const MATERIAL_ORDER = ["Aluminum", "Plastic", "Polycarbonate", "Wood", "Metal", "Brass"];
const SIZE_HINTS = {
  "60%": "no arrows",
  "65%": "with arrows",
  "75%": "with f-row",
  TKL: "no numpad",
  "96%": "compact numpad",
  "Full-size": "everything",
};

function fromFacet(values, param, order = values) {
  return order
    .filter((name) => values.includes(name))
    .map((name) => ({
      label: name.toLowerCase(),
      hint: SIZE_HINTS[name],
      value: { [param]: name },
    }));
}

// Catalogs scraped before brands were recorded only know the shop, so the
// brand card falls back to listing shops.
function brandOptions(facets) {
  if (facets.brands.length > 0) return fromFacet(facets.brands, "brand");
  return fromFacet(facets.shops, "shop");
}

export function buildFilters(facets) {
  return [
    {
      id: "size",
      title: "size",
      blurb: "how much desk it takes up",
      params: ["size"],
      options: fromFacet(facets.sizes, "size", SIZE_ORDER),
    },
    {
      id: "material",
      title: "base material",
      blurb: "what the case is made of",
      params: ["material"],
      options: fromFacet(facets.materials, "material", MATERIAL_ORDER),
    },
    {
      id: "switch",
      title: "switches",
      blurb: "how each key feels",
      params: ["switch"],
      options: SWITCH_FAMILIES,
    },
    {
      id: "brand",
      title: "brand",
      blurb: "who makes or sells it",
      params: ["brand", "shop"],
      // The catalog has far too many brands to lay out as chips.
      dropdown: true,
      options: brandOptions(facets),
    },
    {
      id: "price",
      title: "price",
      blurb: "what you want to spend",
      params: ["min_price", "max_price"],
      options: PRICE_RANGES,
    },
    {
      id: "rating",
      title: "customer stars",
      blurb: "ratings from the shops",
      params: ["min_rating"],
      options: RATINGS,
    },
  ];
}

function sameValue(a, b) {
  return a == null ? b == null : String(a) === String(b);
}

export function isSelected(filter, option, selection) {
  return filter.params.every((param) => sameValue(option.value[param], selection[param]));
}

export function hasChoice(filter, selection) {
  return filter.params.some((param) => selection[param] != null);
}

// Gemini can pick a value that is not one of the preset chips, such as an
// exact switch name or a budget of $150. Describe it so it can still be shown.
export function describeChoice(filter, selection) {
  if (filter.id === "rating") {
    const minimum = Number(selection.min_rating);
    return `${minimum} stars${minimum < 5 ? " & up" : ""}`;
  }
  const preset = filter.options.find((option) => isSelected(filter, option, selection));
  if (preset) return preset.label;

  if (filter.id === "price") {
    const { min_price: min, max_price: max } = selection;
    if (min != null && max != null) return `$${min} – $${max}`;
    if (max != null) return `up to $${max}`;
    return `from $${min}`;
  }
  const param = filter.params.find((name) => selection[name] != null);
  return String(selection[param]).toLowerCase();
}

export function choose(filter, option, selection) {
  const next = { ...selection };
  const alreadyOn = isSelected(filter, option, selection);

  for (const param of filter.params) delete next[param];
  if (!alreadyOn) Object.assign(next, option.value);
  return next;
}

export function clearFilter(filter, selection) {
  const next = { ...selection };
  for (const param of filter.params) delete next[param];
  return next;
}

// ---------- URL helpers ----------

export function selectionFromParams(params) {
  const selection = {};
  for (const key of FILTER_PARAMS) {
    const value = params.get(key);
    if (value) selection[key] = value;
  }
  return selection;
}

export function toQuery(selection, extra = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...selection, ...extra })) {
    if (value != null && value !== "" && value !== false) {
      query.set(key, value === true ? "1" : value);
    }
  }
  return query.toString();
}
