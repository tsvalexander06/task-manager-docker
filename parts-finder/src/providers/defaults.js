// Default supplier definitions.
//
// These are STARTING POINTS. The search URL for each site is a guess and you
// should correct it once in the app's Settings tab: open a real search on the
// site, copy the address-bar URL, and replace the search term with {q}.
//
// Example: if searching "60135" on a site gives
//   https://example.com/catalogsearch/result/?q=60135
// then the template is
//   https://example.com/catalogsearch/result/?q={q}
//
// priceSelector / linkSelector are CSS selectors used only by the optional
// auto-fetch (Playwright) feature to read the first result's price and link.
// Leave them blank until you've inspected the site; deep-link search works
// without them.

module.exports = [
  {
    id: "partstown",
    name: "Parts Town",
    enabled: true,
    // Parts Town is the most openly-priced of the four.
    searchTemplate: "https://www.partstown.co.uk/search?q={q}",
    priceSelector: "",
    linkSelector: "",
    notes: "Supports search by OEM part number, model and serial-number lookup."
  },
  {
    id: "repa_gev",
    name: "REPA (GEV)",
    enabled: true,
    // GEV is part of REPA Group. Prices require a trade login.
    searchTemplate: "https://www.gev-online.com/en/search?q={q}",
    priceSelector: "",
    linkSelector: "",
    notes: "Trade login required for prices. Log in once via Settings, then auto-fetch can reuse the session."
  },
  {
    id: "repa_lf",
    name: "REPA (LF)",
    enabled: true,
    // LF is part of REPA Group. Correct this template from your own bookmarked search.
    searchTemplate: "https://www.repagroup.com/search?q={q}",
    priceSelector: "",
    linkSelector: "",
    notes: "Trade login required for prices. Correct the search URL from a real search on your account."
  },
  {
    id: "professional_spares",
    name: "Professional Spares",
    enabled: true,
    searchTemplate: "https://www.professionalspares.co.uk/search?q={q}",
    priceSelector: "",
    linkSelector: "",
    notes: "UK trade spares. Correct the search URL and selectors from a real search."
  }
];
