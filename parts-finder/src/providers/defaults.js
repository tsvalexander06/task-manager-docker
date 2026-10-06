// Default supplier definitions.
//
// searchTemplate: the site's search URL with the search term replaced by {q}.
// priceSelector : CSS selector for the price (used by optional auto-fetch).
// linkSelector  : CSS selector for the FIRST result's link on a search-results
//                 page. If set, auto-fetch clicks through to that product page
//                 before reading priceSelector — so a product-page price
//                 selector still works even when search lands on a list.
//
// These are seeded from real URLs/selectors supplied by the team. Where a value
// is a guess it is marked in `notes`; correct it once in the app's Settings tab.
//
// NOTE: if you already ran the app once, data/store.json holds your own copy of
// these and won't pick up changes here automatically — delete data/store.json
// to reseed, or just edit the values in the Settings tab.

module.exports = [
  {
    id: "gastroparts",
    name: "Gastroparts",
    enabled: true,
    searchTemplate: "https://gastroparts.com/en/items?query={q}",
    // Product-page price. Set linkSelector if search lands on a results list.
    priceSelector: ".price-amount.price-yours .price-exc-tax span",
    linkSelector: "",
    notes: "Search URL confirmed. Price selector is the product-page price (ex-tax)."
  },
  {
    id: "repa_gev",
    name: "REPA (GEV)",
    enabled: true,
    searchTemplate: "https://www.gev-online.com/en/webshop/search/extra?q={q}",
    priceSelector: ".product-item.detail-info span.p-value span",
    linkSelector: "",
    notes: "⚠ Трябва ВХОД (Настройки → Вход) — цените се виждат само след вход в търговския акаунт."
  },
  {
    id: "repa_lf",
    name: "REPA (LF)",
    enabled: true,
    // LF has no URL-addressable search (quick-search jumps straight to a product
    // via a per-item token), so it uses FORM mode: type into the search box and
    // submit. Leave searchTemplate empty to trigger that.
    searchTemplate: "",
    siteUrl: "https://b2bnet.lfspareparts724.com/en",
    // Several candidates tried in order (the search box only appears after login).
    searchInputSelector: "input[type='search'], input[name='q'], input[name='search'], input[name='ricerca'], input[placeholder*='erc'], input[placeholder*='earch'], #search, .search-input input, input.search",
    priceSelector: ".product-data-panel li strong",
    linkSelector: "",
    notes: "⚠ Трябва ВХОД (Настройки → Вход) — търсачката се показва само след вход. Ако пак не намира търсачката, задайте точния ѝ CSS селектор."
  },
  {
    id: "professional_spares",
    name: "Professional Spares",
    enabled: true,
    // GUESS: you supplied a product page, not a search page. Confirm the search URL.
    searchTemplate: "https://www.professionalspares.com/en/search?controller=search&s={q}",
    priceSelector: ".product__col .prices__wrapper",
    linkSelector: "",
    notes: "Search URL confirmed. Search lands on a results list — set a result-link selector if you want auto-fetch to open the product and read its price. Domain is .com, not .co.uk."
  },
  {
    id: "partstown",
    name: "Parts Town (UK)",
    enabled: true,
    searchTemplate: "https://www.partstown.co.uk/catalogsearch/result/?q={q}",
    // Generalised from an id that was product-specific (…-183774) to any product.
    priceSelector: "[id^='price-excluding-tax-product-price'] > span",
    linkSelector: "",
    notes: "Search URL confirmed. Price selector generalised to match any product on the results page."
  }
];
