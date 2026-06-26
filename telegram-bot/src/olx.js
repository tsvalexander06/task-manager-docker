const { chromium } = require("playwright");

// NOTE: OLX's DOM/login flow changes over time and may include CAPTCHA or
// 2FA that this script cannot solve. Run `npx playwright codegen https://www.olx.bg`
// once, log in by hand, and update these selectors to match what you record.
const SELECTORS = {
  cookieAccept: "button#onetrust-accept-btn-handler",
  loginLink: "a[data-testid='login-link']",
  emailInput: "input[name='username']",
  passwordInput: "input[name='password']",
  loginSubmit: "button[type='submit']",
  addListingLink: "a[data-testid='postad-link']",
  titleInput: "input[name='title']",
  descriptionInput: "textarea[name='description']",
  priceInput: "input[name='price']",
  photoUploadInput: "input[type='file']",
  publishButton: "button[data-testid='submit-ad-button']",
};

async function postListing({ title, description, price, photoPaths }) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("https://www.olx.bg/", { waitUntil: "domcontentloaded" });
    await page.locator(SELECTORS.cookieAccept).click({ timeout: 5000 }).catch(() => {});

    await page.locator(SELECTORS.loginLink).click();
    await page.locator(SELECTORS.emailInput).fill(process.env.OLX_EMAIL);
    await page.locator(SELECTORS.passwordInput).fill(process.env.OLX_PASSWORD);
    await page.locator(SELECTORS.loginSubmit).click();
    await page.waitForLoadState("networkidle");

    await page.locator(SELECTORS.addListingLink).click();
    await page.waitForLoadState("networkidle");

    await page.locator(SELECTORS.titleInput).fill(title);
    await page.locator(SELECTORS.descriptionInput).fill(description);
    await page.locator(SELECTORS.priceInput).fill(String(price));

    if (photoPaths.length > 0) {
      await page.locator(SELECTORS.photoUploadInput).setInputFiles(photoPaths);
    }

    await page.locator(SELECTORS.publishButton).click();
    await page.waitForLoadState("networkidle");

    const url = page.url();
    return { success: true, url };
  } finally {
    await browser.close();
  }
}

module.exports = { postListing, SELECTORS };
