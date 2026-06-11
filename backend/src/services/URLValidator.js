const { chromium } = require("playwright");
const validator = require("validator");

const DEFAULT_BROWSER_NAVIGATION_TIMEOUT = 120000;
const DEFAULT_BROWSER_NETWORK_IDLE_TIMEOUT = 10000;

const clampNumber = (value, minimum, maximum, fallback) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(number), minimum), maximum);
};

const getBrowserNavigationTimeout = () =>
  clampNumber(
    process.env.BROWSER_NAVIGATION_TIMEOUT,
    10000,
    300000,
    DEFAULT_BROWSER_NAVIGATION_TIMEOUT,
  );

const getBrowserNetworkIdleTimeout = () =>
  clampNumber(
    process.env.BROWSER_NETWORK_IDLE_TIMEOUT,
    1000,
    60000,
    DEFAULT_BROWSER_NETWORK_IDLE_TIMEOUT,
  );

class URLValidator {
  static isValidURL(url) {
    try {
      return validator.isURL(url, {
        protocols: ["http", "https"],
        require_protocol: true,
        require_tld: false,
        allow_underscores: true,
      });
    } catch (error) {
      return false;
    }
  }

  static async validateURLAccessibility(url) {
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();
      const navigationTimeout = getBrowserNavigationTimeout();

      page.setDefaultTimeout(navigationTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });

      await page
        .waitForLoadState("networkidle", {
          timeout: getBrowserNetworkIdleTimeout(),
        })
        .catch(() => {});

      if (!response.ok()) {
        throw new Error(`HTTP Error: ${response.status()}`);
      }

      const pageTitle = await page.title();
      const isAccessible = response.ok();

      await browser.close();

      return {
        isAccessible,
        statusCode: response.status(),
        title: pageTitle,
      };
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      throw new Error(`URL validation failed: ${error.message}`);
    }
  }
}

module.exports = URLValidator;
