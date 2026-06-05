const puppeteer = require("puppeteer");
const validator = require("validator");

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
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();

      const response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

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
