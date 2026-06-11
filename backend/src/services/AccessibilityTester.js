const fs = require("fs");
const { chromium } = require("playwright");
const axe = require("axe-core");
const HTMLCS_SCRIPT_PATH = require.resolve(
  "@pa11y/html_codesniffer/build/HTMLCS.js",
);
const IBM_ACE_SCRIPT_PATH = require.resolve("accessibility-checker-engine/ace.js");
const IBM_RULES_CSV_PATH = require.resolve(
  "accessibility-checker-engine/help/rules.csv",
);
const {
  getCriterionByAxeRule,
  getSuccessCriteriaForVersion,
  wcagStandards,
} = require("../config/wcagStandards");
const EnginePriority = require("./EnginePriority");

const DEFAULT_SCAN_OPTIONS = {
  scanScope: "Page",
  maxPages: 10,
  maxDepth: 2,
  autoScroll: true,
  includeSitemap: true,
};

const SKIPPED_EXTENSIONS = new Set([
  "7z",
  "avi",
  "bmp",
  "csv",
  "doc",
  "docx",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "json",
  "mov",
  "mp3",
  "mp4",
  "mpeg",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rar",
  "rss",
  "svg",
  "tar",
  "txt",
  "webm",
  "webp",
  "xls",
  "xlsx",
  "xml",
  "zip",
]);

const TRACKING_PARAMS = ["fbclid", "gclid", "mc_cid", "mc_eid", "msclkid"];

const MAX_ELEMENT_SCREENSHOTS_PER_PAGE = 25;
const HIGHLIGHT_ATTRIBUTE = "data-accessibility-poc-highlight";
const HIGHLIGHT_STYLE_ID = "accessibility-poc-highlight-style";
const DEFAULT_BROWSER_NAVIGATION_TIMEOUT = 180000;
const DEFAULT_BROWSER_NETWORK_IDLE_TIMEOUT = 10000;
const HTMLCS_SUPPORTED_WCAG_VERSIONS = new Set(["2.0", "2.1"]);
const IBM_SUPPORTED_WCAG_VERSIONS = new Set(["2.0", "2.1", "2.2"]);
const IBM_POLICY_BY_WCAG_VERSION = {
  "2.0": "WCAG_2_0",
  "2.1": "WCAG_2_1",
  "2.2": "WCAG_2_2",
};
const CONFORMANCE_LEVEL_RANK = {
  A: 1,
  AA: 2,
  AAA: 3,
};
let ibmRuleCriteriaCache = null;

class AccessibilityTester {
  static async runAxeTests(
    url,
    conformanceLevel = "AA",
    wcagVersion = "2.2",
    checkPoints = ["All"],
    selectedGuidelines = ["All"],
    scanOptions = {},
  ) {
    const scanResult = await this.runAccessibilityScan(
      url,
      conformanceLevel,
      wcagVersion,
      checkPoints,
      selectedGuidelines,
      scanOptions,
    );

    return scanResult.issues;
  }

  static async runAccessibilityScan(
    url,
    conformanceLevel = "AA",
    wcagVersion = "2.2",
    checkPoints = ["All"],
    selectedGuidelines = ["All"],
    scanOptions = {},
  ) {
    let browser;
    const options = this.normalizeScanOptions(scanOptions);
    const runOnlyTags = this.getAxeTags(
      conformanceLevel,
      wcagVersion,
      this.shouldScanBestPractices(checkPoints),
    );
    const startUrl = this.normalizeUrlForCrawl(url, url, options);

    if (!startUrl) {
      throw new Error("Unable to normalize the requested URL");
    }

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const queue = [{ url: startUrl, depth: 0, source: "start" }];
      const queuedUrls = new Set([startUrl]);
      const visitedUrls = new Set();
      const scannedPages = [];
      const issues = [];

      if (options.scanScope === "Site" && options.includeSitemap) {
        const sitemapUrls = await this.discoverSitemapUrls(startUrl, options);
        sitemapUrls.forEach((candidateUrl) => {
          if (
            queuedUrls.size >= options.maxPages ||
            queuedUrls.has(candidateUrl)
          ) {
            return;
          }

          queue.push({ url: candidateUrl, depth: 1, source: "sitemap" });
          queuedUrls.add(candidateUrl);
        });
      }

      while (queue.length > 0 && scannedPages.length < options.maxPages) {
        const candidate = queue.shift();

        if (!candidate || visitedUrls.has(candidate.url)) {
          continue;
        }

        visitedUrls.add(candidate.url);

        try {
          const pageResult = await this.scanPage({
            browser,
            url: candidate.url,
            depth: candidate.depth,
            runOnlyTags,
            conformanceLevel,
            wcagVersion,
            checkPoints,
            selectedGuidelines,
            options,
            pageIndex: scannedPages.length + 1,
          });

          scannedPages.push(pageResult.page);
          issues.push(...pageResult.issues);

          if (
            options.scanScope === "Site" &&
            candidate.depth < options.maxDepth
          ) {
            pageResult.links.forEach((link) => {
              if (
                queue.length + scannedPages.length >= options.maxPages ||
                visitedUrls.has(link) ||
                queuedUrls.has(link)
              ) {
                return;
              }

              queue.push({
                url: link,
                depth: candidate.depth + 1,
                source: candidate.url,
              });
              queuedUrls.add(link);
            });
          }
        } catch (pageError) {
          if (options.scanScope === "Page") {
            throw pageError;
          }

          scannedPages.push({
            url: candidate.url,
            depth: candidate.depth,
            title: "",
            status: "Failed",
            statusCode: null,
            issueCount: 0,
            error: pageError.message,
          });
        }
      }

      await browser.close();

      return {
        issues,
        scannedPages,
        crawlSummary: {
          scanScope: options.scanScope,
          startUrl,
          maxPages: options.maxPages,
          maxDepth: options.maxDepth,
          autoScroll: options.autoScroll,
          includeSitemap: options.includeSitemap,
          pagesQueued: queuedUrls.size,
          pagesScanned: scannedPages.filter((page) => page.status === "Scanned")
            .length,
          pagesFailed: scannedPages.filter((page) => page.status === "Failed")
            .length,
          pagesSkipped: Math.max(queuedUrls.size - scannedPages.length, 0),
        },
      };
    } catch (error) {
      if (browser) {
        await browser.close();
      }

      throw new Error(`Accessibility testing failed: ${error.message}`);
    }
  }

  static normalizeScanOptions(scanOptions = {}) {
    const scanScope = scanOptions.scanScope === "Site" ? "Site" : "Page";
    const maxPages = this.clampNumber(
      scanOptions.maxPages,
      1,
      50,
      DEFAULT_SCAN_OPTIONS.maxPages,
    );
    const maxDepth = this.clampNumber(
      scanOptions.maxDepth,
      0,
      5,
      DEFAULT_SCAN_OPTIONS.maxDepth,
    );

    return {
      scanScope,
      maxPages: scanScope === "Page" ? 1 : maxPages,
      maxDepth: scanScope === "Page" ? 0 : maxDepth,
      autoScroll: scanOptions.autoScroll !== false,
      includeSitemap: scanOptions.includeSitemap !== false,
    };
  }

  static clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(number), minimum), maximum);
  }

  static getBrowserNavigationTimeout() {
    return this.clampNumber(
      process.env.BROWSER_NAVIGATION_TIMEOUT,
      10000,
      300000,
      DEFAULT_BROWSER_NAVIGATION_TIMEOUT,
    );
  }

  static getBrowserNetworkIdleTimeout() {
    return this.clampNumber(
      process.env.BROWSER_NETWORK_IDLE_TIMEOUT,
      1000,
      60000,
      DEFAULT_BROWSER_NETWORK_IDLE_TIMEOUT,
    );
  }

  static async scanPage({
    browser,
    url,
    depth,
    runOnlyTags,
    conformanceLevel,
    wcagVersion,
    checkPoints,
    selectedGuidelines,
    options,
    pageIndex,
  }) {
    const context = await browser.newContext({
      viewport: {
        width: 1440,
        height: 1000,
      },
      deviceScaleFactor: 1,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const navigationTimeout = this.getBrowserNavigationTimeout();

    try {
      page.setDefaultTimeout(navigationTimeout);
      page.setDefaultNavigationTimeout(navigationTimeout);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });

      if (!response || !response.ok()) {
        throw new Error(
          `HTTP Error: ${response ? response.status() : "No response"}`,
        );
      }

      await this.waitForNetworkToSettle(page);
      await this.preparePageForScan(page, options);
      await page.addScriptTag({ content: axe.source });

      const axeResults = await page.evaluate((tags) => {
        return window.axe.run(document, {
          resultTypes: ["violations", "incomplete", "passes"],
          runOnly: { type: "tag", values: tags },
        });
      }, runOnlyTags);
      const ibmResults = this.shouldRunIbm(wcagVersion, conformanceLevel)
        ? await this.runIbmTests(page, wcagVersion)
        : [];
      const htmlcsResults = this.shouldRunHtmlcs(wcagVersion)
        ? await this.runHtmlcsTests(page, conformanceLevel)
        : [];

      const title = await page.title();
      const links = await this.discoverPageLinks(page, url, options);
      const pageContext = {
        pageUrl: url,
        pageTitle: title,
        pageDepth: depth,
        pageIndex,
      };
      const rawIssues = [
        ...this.processAxeResults(
          axeResults,
          wcagVersion,
          conformanceLevel,
          checkPoints,
          selectedGuidelines,
          pageContext,
        ),
        ...this.processIbmResults(
          ibmResults,
          wcagVersion,
          conformanceLevel,
          checkPoints,
          selectedGuidelines,
          pageContext,
        ),
        ...this.processHtmlcsResults(
          htmlcsResults,
          wcagVersion,
          conformanceLevel,
          checkPoints,
          selectedGuidelines,
          pageContext,
        ),
      ];
      const issues = EnginePriority.applyToIssues(rawIssues);
      await this.captureHighlightedElementScreenshots(page, issues);

      await context.close();

      return {
        issues,
        links,
        page: {
          url,
          depth,
          title,
          status: "Scanned",
          statusCode: response.status(),
          issueCount: issues.filter((issue) =>
            [
              "Fail",
              "Error",
              "Warning",
              "Manual Review",
              "Best Practice",
            ].includes(issue.status),
          ).length,
          error: null,
        },
      };
    } catch (error) {
      await context.close();
      throw error;
    }
  }

  static async preparePageForScan(page, options) {
    await page.evaluate(() => {
      document.querySelectorAll("details").forEach((element) => {
        element.open = true;
      });
    });

    if (options.autoScroll) {
      await this.autoScrollPage(page);
    }
  }

  static async waitForNetworkToSettle(page) {
    await page
      .waitForLoadState("networkidle", {
        timeout: this.getBrowserNetworkIdleTimeout(),
      })
      .catch(() => {});
  }

  static async autoScrollPage(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        const distance = 700;
        const maxSteps = 80;
        let steps = 0;
        let lastHeight = 0;
        let stableHeightCount = 0;

        const getHeight = () =>
          document.scrollingElement?.scrollHeight ||
          document.body.scrollHeight ||
          0;

        const timer = setInterval(() => {
          const currentHeight = getHeight();
          window.scrollBy(0, distance);
          steps += 1;

          const reachedBottom =
            window.innerHeight + window.scrollY >= currentHeight - 5;

          if (reachedBottom) {
            if (currentHeight === lastHeight) {
              stableHeightCount += 1;
            } else {
              stableHeightCount = 0;
              lastHeight = currentHeight;
            }
          }

          if (steps >= maxSteps || stableHeightCount >= 2) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 120);
      });
    });

    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  }

  static async discoverPageLinks(page, baseUrl, options) {
    const links = await page.$$eval("a[href]", (anchors) =>
      anchors.map((anchor) => anchor.href).filter(Boolean),
    );

    return this.uniqueNormalizedUrls(links, baseUrl, options);
  }

  static async discoverSitemapUrls(startUrl, options) {
    const parsedStart = new URL(startUrl);
    const sitemapCandidates = [
      `${parsedStart.origin}/sitemap.xml`,
      `${parsedStart.origin}/sitemap_index.xml`,
    ];
    const found = [];
    const visitedSitemaps = new Set();

    for (const sitemapUrl of sitemapCandidates) {
      await this.collectSitemapUrls({
        sitemapUrl,
        baseUrl: startUrl,
        options,
        found,
        visitedSitemaps,
        remainingDepth: 2,
      });

      if (found.length >= options.maxPages) {
        break;
      }
    }

    return found.slice(0, options.maxPages);
  }

  static async collectSitemapUrls({
    sitemapUrl,
    baseUrl,
    options,
    found,
    visitedSitemaps,
    remainingDepth,
  }) {
    if (visitedSitemaps.has(sitemapUrl) || remainingDepth < 0) {
      return;
    }

    visitedSitemaps.add(sitemapUrl);

    const xml = await this.fetchText(sitemapUrl);
    if (!xml) {
      return;
    }

    const locs = Array.from(xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi))
      .map((match) => match[1].trim())
      .filter(Boolean);

    for (const loc of locs) {
      const sitemapLocation = this.normalizeSitemapLocation(loc, baseUrl);
      if (!sitemapLocation) {
        continue;
      }

      if (sitemapLocation.toLowerCase().endsWith(".xml")) {
        await this.collectSitemapUrls({
          sitemapUrl: sitemapLocation,
          baseUrl,
          options,
          found,
          visitedSitemaps,
          remainingDepth: remainingDepth - 1,
        });
      } else {
        const normalized = this.normalizeUrlForCrawl(
          sitemapLocation,
          baseUrl,
          options,
        );

        if (normalized && !found.includes(normalized)) {
          found.push(normalized);
        }
      }

      if (found.length >= options.maxPages) {
        return;
      }
    }
  }

  static async fetchText(url) {
    if (typeof fetch !== "function") {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(url, {
        headers: { accept: "application/xml,text/xml,text/plain,*/*" },
        signal: controller.signal,
      });

      if (!response.ok) {
        return null;
      }

      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  static uniqueNormalizedUrls(urls, baseUrl, options) {
    const result = [];
    const seen = new Set();

    urls.forEach((url) => {
      const normalized = this.normalizeUrlForCrawl(url, baseUrl, options);

      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      result.push(normalized);
    });

    return result;
  }

  static normalizeUrlForCrawl(rawUrl, baseUrl, options = DEFAULT_SCAN_OPTIONS) {
    try {
      const parsed = new URL(rawUrl, baseUrl);
      const base = new URL(baseUrl);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }

      if (!this.isAllowedCrawlHost(parsed, base)) {
        return null;
      }

      if (this.hasSkippedExtension(parsed.pathname)) {
        return null;
      }

      parsed.hash = "";
      TRACKING_PARAMS.forEach((param) => parsed.searchParams.delete(param));
      Array.from(parsed.searchParams.keys())
        .filter((param) => param.toLowerCase().startsWith("utm_"))
        .forEach((param) => parsed.searchParams.delete(param));
      parsed.searchParams.sort();

      if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }

  static normalizeSitemapLocation(rawUrl, baseUrl) {
    try {
      const parsed = new URL(rawUrl, baseUrl);
      const base = new URL(baseUrl);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }

      if (!this.isAllowedCrawlHost(parsed, base)) {
        return null;
      }

      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  static hasSkippedExtension(pathname = "") {
    const cleanPath = pathname.toLowerCase().split("?")[0];
    const extension = cleanPath.includes(".") ? cleanPath.split(".").pop() : "";

    return SKIPPED_EXTENSIONS.has(extension);
  }

  static isAllowedCrawlHost(candidate, base) {
    const normalizeHost = (hostname) =>
      hostname.toLowerCase().replace(/^www\./, "");

    if (normalizeHost(candidate.hostname) !== normalizeHost(base.hostname)) {
      return false;
    }

    return candidate.port === base.port;
  }

  static getAxeTags(
    conformanceLevel,
    wcagVersion,
    includeBestPractices = false,
  ) {
    const level = String(conformanceLevel || "AA").toLowerCase();
    const tags = ["wcag2a"];

    if (["aa", "aaa"].includes(level)) {
      tags.push("wcag2aa");
    }

    if (level === "aaa") {
      tags.push("wcag2aaa");
    }

    if (["2.1", "2.2"].includes(wcagVersion)) {
      tags.push("wcag21a");
      if (["aa", "aaa"].includes(level)) tags.push("wcag21aa");
      if (level === "aaa") tags.push("wcag21aaa");
    }

    if (wcagVersion === "2.2") {
      if (["aa", "aaa"].includes(level)) tags.push("wcag22aa");
    }

    if (includeBestPractices) {
      tags.push("best-practice");
    }

    return tags;
  }

  static shouldRunHtmlcs(wcagVersion) {
    return HTMLCS_SUPPORTED_WCAG_VERSIONS.has(String(wcagVersion || ""));
  }

  static shouldRunIbm(wcagVersion, conformanceLevel = "AA") {
    const level = String(conformanceLevel || "AA").toUpperCase();

    return (
      IBM_SUPPORTED_WCAG_VERSIONS.has(String(wcagVersion || "")) &&
      ["A", "AA"].includes(level)
    );
  }

  static getIbmPolicy(wcagVersion) {
    return IBM_POLICY_BY_WCAG_VERSION[String(wcagVersion || "")] || null;
  }

  static getHtmlcsStandard(conformanceLevel) {
    const level = String(conformanceLevel || "AA").toUpperCase();
    return ["A", "AA", "AAA"].includes(level) ? `WCAG2${level}` : "WCAG2AA";
  }

  static async runIbmTests(page, wcagVersion) {
    const policy = this.getIbmPolicy(wcagVersion);

    if (!policy) {
      return [];
    }

    await page.addScriptTag({ path: IBM_ACE_SCRIPT_PATH });

    return page.evaluate(async (policyId) => {
      const aceNamespace =
        window.ace || (typeof ace !== "undefined" ? ace : null);

      if (!aceNamespace || typeof aceNamespace.Checker !== "function") {
        throw new Error("IBM Equal Access engine did not initialize");
      }

      const checker = new aceNamespace.Checker();
      const report = await checker.check(document, [policyId]);
      const normalizedReport = report?.report || report || {};

      return {
        summary: normalizedReport.summary || {},
        results: normalizedReport.results || [],
      };
    }, policy);
  }

  static async runHtmlcsTests(page, conformanceLevel) {
    await page.addScriptTag({ path: HTMLCS_SCRIPT_PATH });

    return page.evaluate((standard) => {
      const escapeCssIdentifier = (value) =>
        String(value).replace(/([^\w-])/g, "\\$1");

      const getCssPath = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const segments = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.nodeName.toLowerCase();

          if (current.id) {
            selector += `#${escapeCssIdentifier(current.id)}`;
            segments.unshift(selector);
            break;
          }

          if (current.classList.length > 0) {
            selector += `.${Array.from(current.classList)
              .slice(0, 2)
              .map(escapeCssIdentifier)
              .join(".")}`;
          }

          const parent = current.parentElement;

          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (sibling) => sibling.nodeName === current.nodeName,
            );

            if (siblings.length > 1) {
              selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }

          segments.unshift(selector);
          current = parent;

          if (segments.length >= 8) {
            break;
          }
        }

        return segments.join(" > ");
      };

      const serializeElement = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return null;
        }

        return {
          selector: getCssPath(element),
          html: element.outerHTML ? element.outerHTML.slice(0, 1000) : "",
          text: element.textContent ? element.textContent.trim().slice(0, 300) : "",
        };
      };

      return new Promise((resolve, reject) => {
        const htmlcs = window.HTMLCS;

        try {
          if (!htmlcs || typeof htmlcs.process !== "function") {
            reject(new Error("HTML_CodeSniffer did not initialize"));
            return;
          }

          htmlcs.process(
            standard,
            document,
            () => {
              const typeNames = {
                [htmlcs.ERROR]: "error",
                [htmlcs.WARNING]: "warning",
                [htmlcs.NOTICE]: "notice",
              };

              resolve(
                htmlcs.getMessages().map((message, index) => ({
                  index,
                  type: message.type,
                  typeName: typeNames[message.type] || String(message.type),
                  code: message.code,
                  message: message.msg,
                  element: serializeElement(message.element),
                })),
              );
            },
            () => undefined,
          );
        } catch (error) {
          reject(error);
        }
      });
    }, this.getHtmlcsStandard(conformanceLevel));
  }

  static shouldScanBestPractices(checkPoints = ["All"]) {
    return (
      !checkPoints ||
      checkPoints.includes("All") ||
      checkPoints.includes("Best Practices")
    );
  }

  static processAxeResults(
    axeResults,
    wcagVersion,
    conformanceLevel,
    checkPoints,
    selectedGuidelines,
    pageContext = {},
  ) {
    const issues = [];
    const selectedGuidelineSet = new Set(selectedGuidelines || ["All"]);
    const severityMap = {
      critical: "Critical",
      serious: "Serious",
      moderate: "Moderate",
      minor: "Minor",
    };

    const pushResult = (result, resultType, index) => {
      if (!this.shouldIncludeResult(result, checkPoints)) {
        return;
      }

      const mappedCriterion =
        getCriterionByAxeRule(result.id, wcagVersion) ||
        this.getCriterionFromTags(result.tags, wcagVersion);
      const criterion = mappedCriterion?.[0] || result.id;
      const criterionConfig = mappedCriterion?.[1];
      const guideline = this.getGuidelineFromCriterion(criterion);

      if (!this.isCriterionInConformance(criterionConfig, conformanceLevel)) {
        return;
      }

      if (
        !selectedGuidelineSet.has("All") &&
        !selectedGuidelineSet.has(guideline)
      ) {
        return;
      }

      const config = wcagStandards[wcagVersion]?.guidelines?.[guideline];
      const isBestPractice = result.tags?.includes("best-practice");
      const issueType = isBestPractice
        ? "Best Practices"
        : criterionConfig?.type || config?.type || "Automated";
      const status =
        resultType === "passes"
          ? "Pass"
          : isBestPractice
            ? "Best Practice"
            : resultType === "incomplete"
              ? "Manual Review"
              : "Fail";

      const issueIdParts = [
        resultType.toUpperCase(),
        pageContext.pageIndex || 1,
        result.id,
        index,
      ];

      issues.push({
        issueId: issueIdParts.join("-"),
        criterion,
        principle: config?.principle,
        guideline,
        description: result.description || result.help,
        severity:
          status === "Pass"
            ? "None"
            : severityMap[result.impact] ||
              (status === "Best Practice" ? "Minor" : "Moderate"),
        status,
        type: issueType,
        pageUrl: pageContext.pageUrl,
        pageTitle: pageContext.pageTitle,
        pageDepth: pageContext.pageDepth,
        elements: (result.nodes || []).map((node, nodeIndex) =>
          this.mapNodeToElement(node, nodeIndex, pageContext, status),
        ),
        suggestedFix: result.help,
        howToTest: criterionConfig?.howToTest,
        automationJustification: criterionConfig?.automationJustification,
        helpUrl: result.helpUrl,
        engine: "axe-core",
        enginePriority: EnginePriority.getEnginePriority("axe-core"),
        rawStatus: status,
        finalStatus: status,
        decisionEngine: "axe-core",
        suppressedByPriority: false,
      });
    };

    axeResults.violations.forEach((result, index) =>
      pushResult(result, "violations", index),
    );
    axeResults.incomplete.forEach((result, index) =>
      pushResult(result, "incomplete", index),
    );
    axeResults.passes.forEach((result, index) =>
      pushResult(result, "passes", index),
    );

    return issues;
  }

  static processIbmResults(
    ibmResults,
    wcagVersion,
    conformanceLevel,
    checkPoints,
    selectedGuidelines,
    pageContext = {},
  ) {
    const selectedGuidelineSet = new Set(selectedGuidelines || ["All"]);
    const results = Array.isArray(ibmResults)
      ? ibmResults
      : ibmResults?.results || [];
    const issues = [];

    results.forEach((result, index) => {
      const mappedCriteria = this.getCriteriaFromIbmRule(
        result.ruleId,
        result.reasonId,
        wcagVersion,
      ).filter(([, criterionConfig]) =>
        this.isCriterionInConformance(criterionConfig, conformanceLevel),
      );

      mappedCriteria.forEach(([criterion, criterionConfig]) => {
        const guideline = this.getGuidelineFromCriterion(criterion);

        if (
          !selectedGuidelineSet.has("All") &&
          !selectedGuidelineSet.has(guideline)
        ) {
          return;
        }

        const pseudoResult = {
          id: result.ruleId,
          help: result.message,
          description: result.message,
          tags: [`wcag${criterion.replace(/\./g, "")}`],
        };

        if (!this.shouldIncludeResult(pseudoResult, checkPoints)) {
          return;
        }

        const config = wcagStandards[wcagVersion]?.guidelines?.[guideline];
        const status = this.mapIbmStatus(result);
        const severity = this.mapIbmSeverity(result, status);
        const issueId = [
          "IBM",
          pageContext.pageIndex || 1,
          result.ruleId || "rule",
          result.reasonId || "reason",
          criterion,
          index,
        ]
          .join("-")
          .replace(/\s+/g, "-")
          .replace(/[^a-zA-Z0-9_.-]/g, "-");

        issues.push({
          issueId,
          criterion,
          principle: config?.principle,
          guideline,
          description: result.message || result.ruleId || "IBM Equal Access result",
          severity,
          status,
          type: criterionConfig?.type || config?.type || "Automated",
          pageUrl: pageContext.pageUrl,
          pageTitle: pageContext.pageTitle,
          pageDepth: pageContext.pageDepth,
          elements: [this.mapIbmElement(result, index, pageContext, status)],
          suggestedFix: result.message || "Review the affected element.",
          howToTest: criterionConfig?.howToTest,
          automationJustification: criterionConfig?.automationJustification,
          helpUrl: this.getIbmHelpUrl(result.ruleId),
          engine: "ibm-equal-access",
          enginePriority: EnginePriority.getEnginePriority("ibm-equal-access"),
          rawStatus: status,
          finalStatus: status,
          decisionEngine: "ibm-equal-access",
          suppressedByPriority: false,
        });
      });
    });

    return issues;
  }

  static processHtmlcsResults(
    htmlcsResults,
    wcagVersion,
    conformanceLevel,
    checkPoints,
    selectedGuidelines,
    pageContext = {},
  ) {
    const selectedGuidelineSet = new Set(selectedGuidelines || ["All"]);
    const severityMap = {
      error: "Serious",
      warning: "Moderate",
      notice: "Minor",
    };
    const statusMap = {
      error: "Fail",
      warning: "Warning",
      notice: "Manual Review",
    };

    return (htmlcsResults || [])
      .map((result, index) => {
        const mappedCriterion = this.getCriterionFromHtmlcsCode(
          result.code,
          wcagVersion,
        );

        if (!mappedCriterion) {
          return null;
        }

        const criterion = mappedCriterion[0];
        const criterionConfig = mappedCriterion?.[1];
        const guideline = this.getGuidelineFromCriterion(criterion);
        const config = wcagStandards[wcagVersion]?.guidelines?.[guideline];

        if (!this.isCriterionInConformance(criterionConfig, conformanceLevel)) {
          return null;
        }

        const pseudoResult = {
          id: result.code,
          help: result.message,
          description: result.message,
          tags: criterion ? [`wcag${criterion.replace(/\./g, "")}`] : [],
        };

        if (!this.shouldIncludeResult(pseudoResult, checkPoints)) {
          return null;
        }

        if (
          !selectedGuidelineSet.has("All") &&
          !selectedGuidelineSet.has(guideline)
        ) {
          return null;
        }

        const status = statusMap[result.typeName] || "Warning";

        return {
          issueId: ["HTMLCS", pageContext.pageIndex || 1, result.code || index, index]
            .join("-")
            .replace(/\s+/g, "-"),
          criterion,
          principle: config?.principle,
          guideline,
          description: result.message || result.code,
          severity: severityMap[result.typeName] || "Moderate",
          status,
          type: criterionConfig?.type || config?.type || "Automated",
          pageUrl: pageContext.pageUrl,
          pageTitle: pageContext.pageTitle,
          pageDepth: pageContext.pageDepth,
          elements: result.element
            ? [this.mapHtmlcsElement(result, pageContext, status)]
            : [],
          suggestedFix: result.message,
          howToTest: criterionConfig?.howToTest,
          automationJustification: criterionConfig?.automationJustification,
          helpUrl: undefined,
          engine: "htmlcs",
          enginePriority: EnginePriority.getEnginePriority("htmlcs"),
          rawStatus: status,
          finalStatus: status,
          decisionEngine: "htmlcs",
          suppressedByPriority: false,
        };
      })
      .filter(Boolean);
  }

  static mapNodeToElement(
    node,
    index,
    pageContext = {},
    status = "Manual Review",
  ) {
    const selector = node.target ? node.target.join(" > ") : "";
    const html = node.html || "";

    return {
      elementId: `ELEMENT-${pageContext.pageIndex || 1}-${index}`,
      elementName: selector || html.substring(0, 100) || "Document",
      html,
      selector,
      xpath: this.generateXPath(node),
      screenshot: null,
      status,
      pageUrl: pageContext.pageUrl,
      pageTitle: pageContext.pageTitle,
      locators: [
        {
          type: "CSS Selector",
          value: selector || "N/A",
        },
        {
          type: "XPath",
          value: this.generateXPath(node) || "N/A",
        },
        {
          type: "Page URL",
          value: pageContext.pageUrl || "N/A",
        },
      ],
    };
  }

  static mapHtmlcsElement(result, pageContext = {}, status = "Manual Review") {
    const selector = result.element?.selector || "";
    const html = result.element?.html || "";

    return {
      elementId: `HTMLCS-ELEMENT-${pageContext.pageIndex || 1}-${result.index || 0}`,
      elementName:
        selector ||
        result.element?.text ||
        html.substring(0, 100) ||
        "Document",
      html,
      selector,
      xpath: "",
      screenshot: null,
      status,
      pageUrl: pageContext.pageUrl,
      pageTitle: pageContext.pageTitle,
      locators: [
        {
          type: "CSS Selector",
          value: selector || "N/A",
        },
        {
          type: "Page URL",
          value: pageContext.pageUrl || "N/A",
        },
      ],
    };
  }

  static mapIbmElement(
    result,
    index,
    pageContext = {},
    status = "Manual Review",
  ) {
    const selector = result.path?.css || "";
    const xpath = result.path?.dom || "";
    const html = result.snippet || "";

    return {
      elementId: `IBM-ELEMENT-${pageContext.pageIndex || 1}-${index}`,
      elementName:
        selector ||
        xpath ||
        html.substring(0, 100) ||
        result.ruleId ||
        "Document",
      html,
      selector,
      xpath,
      screenshot: null,
      status,
      pageUrl: pageContext.pageUrl,
      pageTitle: pageContext.pageTitle,
      locators: [
        {
          type: "CSS Selector",
          value: selector || "N/A",
        },
        {
          type: "XPath",
          value: xpath || "N/A",
        },
        {
          type: "Page URL",
          value: pageContext.pageUrl || "N/A",
        },
      ],
    };
  }

  static mapIbmStatus(result = {}) {
    const outcome = Array.isArray(result.value)
      ? String(result.value[1] || "").toUpperCase()
      : "";

    if (outcome === "PASS") {
      return "Pass";
    }

    if (outcome === "FAIL") {
      return "Fail";
    }

    if (["POTENTIAL", "MANUAL"].includes(outcome)) {
      return "Manual Review";
    }

    const level = String(result.level || "").toLowerCase();

    if (level === "pass") {
      return "Pass";
    }

    if (level === "violation") {
      return "Fail";
    }

    if (level.includes("potential") || level.includes("manual")) {
      return "Manual Review";
    }

    if (level.includes("recommendation")) {
      return "Warning";
    }

    return "Manual Review";
  }

  static mapIbmSeverity(result = {}, status = "Manual Review") {
    if (status === "Pass") {
      return "None";
    }

    if (status === "Fail") {
      const toolkitLevel = Number(
        String(result.value?.[0] || result.toolkitLevel || "").match(/\d+/)?.[0],
      );

      if (toolkitLevel === 1) return "Serious";
      if (toolkitLevel === 3) return "Minor";
      return "Moderate";
    }

    return status === "Warning" ? "Minor" : "Moderate";
  }

  static getIbmHelpUrl(ruleId) {
    return ruleId
      ? `https://www.ibm.com/able/requirements/checker-rule-sets/#${ruleId}`
      : undefined;
  }

  static getCriteriaFromIbmRule(ruleId, reasonId, wcagVersion = "2.2") {
    if (!ruleId) {
      return [];
    }

    const criteria = getSuccessCriteriaForVersion(wcagVersion);
    const criterionIds = this.getIbmRuleCriterionIds(ruleId, reasonId).filter(
      (criterionId) => criteria[criterionId],
    );

    return criterionIds.map((criterionId) => [criterionId, criteria[criterionId]]);
  }

  static getIbmRuleCriterionIds(ruleId, reasonId) {
    const map = this.getIbmRuleCriteriaMap();
    const byReason =
      reasonId && map.byReason.get(this.getIbmRuleReasonKey(ruleId, reasonId));

    if (byReason?.length) {
      return byReason;
    }

    return map.byRule.get(ruleId) || [];
  }

  static getIbmRuleCriteriaMap() {
    if (ibmRuleCriteriaCache) {
      return ibmRuleCriteriaCache;
    }

    const rows = this.parseCsvRows(fs.readFileSync(IBM_RULES_CSV_PATH, "utf8"));
    const header = (rows.shift() || []).map((cell) => cell.trim());
    const ruleIdIndex = header.indexOf("Rule ID");
    const reasonCodeIndex = header.indexOf("Reason Code");
    const requirementsIndex = header.indexOf("WCAG Requirements");
    const byRule = new Map();
    const byReason = new Map();

    rows.forEach((row) => {
      const ruleId = row[ruleIdIndex];
      const reasonCode = row[reasonCodeIndex];
      const criteria = this.extractWcagCriteria(row[requirementsIndex]);

      if (!ruleId || criteria.length === 0) {
        return;
      }

      this.addIbmCriterionMapping(byRule, ruleId, criteria);

      if (reasonCode) {
        this.addIbmCriterionMapping(
          byReason,
          this.getIbmRuleReasonKey(ruleId, reasonCode),
          criteria,
        );
      }
    });

    ibmRuleCriteriaCache = { byRule, byReason };
    return ibmRuleCriteriaCache;
  }

  static addIbmCriterionMapping(map, key, criteria) {
    const current = map.get(key) || [];
    map.set(key, Array.from(new Set([...current, ...criteria])));
  }

  static getIbmRuleReasonKey(ruleId, reasonId) {
    return `${ruleId}::${reasonId}`;
  }

  static extractWcagCriteria(value = "") {
    return Array.from(
      new Set(String(value).match(/\b[1-4]\.[0-9]\.\d+\b/g) || []),
    );
  }

  static parseCsvRows(content = "") {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];

      if (quoted) {
        if (char === '"' && content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }

    if (field || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((candidate) =>
      candidate.some((cell) => String(cell).length > 0),
    );
  }

  static isCriterionInConformance(criterionConfig, conformanceLevel = "AA") {
    if (!criterionConfig?.level) {
      return true;
    }

    const requestedLevel =
      CONFORMANCE_LEVEL_RANK[String(conformanceLevel || "AA").toUpperCase()] ||
      CONFORMANCE_LEVEL_RANK.AA;
    const criterionLevel =
      CONFORMANCE_LEVEL_RANK[String(criterionConfig.level).toUpperCase()] ||
      requestedLevel;

    return criterionLevel <= requestedLevel;
  }

  static getCriterionFromTags(tags = [], wcagVersion = "2.2") {
    const tag = tags.find((value) => /^wcag\d{3,4}$/.test(value));
    if (!tag) {
      return null;
    }

    const digits = tag.replace("wcag", "");
    const criterionId = `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
    const criteria = getSuccessCriteriaForVersion(wcagVersion);

    return criteria[criterionId] ? [criterionId, criteria[criterionId]] : null;
  }

  static getCriterionFromHtmlcsCode(code = "", wcagVersion = "2.1") {
    const match = /(?:^|\.)(\d)_(\d)_(\d+)(?:\.|_|$)/.exec(String(code));

    if (!match) {
      return null;
    }

    const criterionId = `${match[1]}.${match[2]}.${match[3]}`;
    const criteria = getSuccessCriteriaForVersion(wcagVersion);

    return criteria[criterionId] ? [criterionId, criteria[criterionId]] : null;
  }

  static getGuidelineFromCriterion(criterion = "") {
    const parts = String(criterion).split(".");
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : criterion;
  }

  static shouldIncludeResult(result, selectedCheckPoints = ["All"]) {
    if (!selectedCheckPoints || selectedCheckPoints.includes("All")) {
      return true;
    }

    if (
      selectedCheckPoints.includes("Best Practices") &&
      result.tags?.includes("best-practice")
    ) {
      return true;
    }

    const checkpoint = this.classifyCheckpoint(result);
    return selectedCheckPoints.includes(checkpoint);
  }

  static classifyCheckpoint(result) {
    const text = [
      result.id,
      result.help,
      result.description,
      ...(result.tags || []),
    ]
      .join(" ")
      .toLowerCase();

    if (text.includes("heading")) return "Headings";
    if (text.includes("landmark") || text.includes("region"))
      return "Landmarks";
    if (text.includes("title")) return "Page Title";
    if (text.includes("tab")) return "Tab Order";
    if (text.includes("focus")) return "Focus Order";
    if (text.includes("bypass") || text.includes("skip")) return "Skip Links";
    if (
      text.includes("form") ||
      text.includes("input") ||
      text.includes("label")
    )
      return "Forms";
    if (
      text.includes("image") ||
      text.includes("img") ||
      text.includes("non-text")
    )
      return "Images";
    if (
      text.includes("video") ||
      text.includes("audio") ||
      text.includes("caption")
    )
      return "Video/Audio";
    if (text.includes("link") || text.includes("button")) return "Link/Buttons";
    if (text.includes("aria") || text.includes("role")) return "ARIA";
    if (text.includes("contrast") || text.includes("color"))
      return "Color Contrast";
    if (text.includes("hidden")) return "Hidden Content";
    if (text.includes("language") || text.includes("lang")) return "Language";
    return "Best Practices";
  }

  static generateXPath(node) {
    if (!node.target || node.target.length === 0) {
      return "";
    }

    return "/" + node.target.join("/");
  }

  static async captureHighlightedElementScreenshots(page, issues) {
    let captured = 0;

    for (const issue of issues) {
      if (["Pass", "NA", "Suppressed"].includes(issue.status)) {
        continue;
      }

      for (const element of issue.elements || []) {
        if (captured >= MAX_ELEMENT_SCREENSHOTS_PER_PAGE) {
          return;
        }

        if (!element.selector) {
          continue;
        }

        const screenshot = await this.captureHighlightedScreenshot(
          page,
          element.selector,
        );

        if (screenshot) {
          element.screenshot = screenshot;
          captured += 1;
        }
      }
    }
  }

  static async captureHighlightedScreenshot(page, selector) {
    try {
      const element = await page.$(selector);

      if (!element) {
        return null;
      }

      await page.evaluate(
        ({ highlightAttribute, highlightStyleId, targetSelector }) => {
          if (!document.getElementById(highlightStyleId)) {
            const style = document.createElement("style");
            style.id = highlightStyleId;
            style.textContent = `
              [${highlightAttribute}="true"] {
                outline: 4px solid #ff2d55 !important;
                outline-offset: 3px !important;
                box-shadow: 0 0 0 6px rgba(255, 45, 85, 0.25) !important;
              }
            `;
            document.head.appendChild(style);
          }

          document
            .querySelectorAll(`[${highlightAttribute}="true"]`)
            .forEach((node) => node.removeAttribute(highlightAttribute));

          const target = document.querySelector(targetSelector);

          if (target) {
            target.setAttribute(highlightAttribute, "true");
            target.scrollIntoView({ block: "center", inline: "center" });
          }
        },
        {
          highlightAttribute: HIGHLIGHT_ATTRIBUTE,
          highlightStyleId: HIGHLIGHT_STYLE_ID,
          targetSelector: selector,
        },
      );

      await page.waitForTimeout(150).catch(() => {});
      const screenshot = await page.screenshot({ fullPage: false });

      return `data:image/png;base64,${screenshot.toString("base64")}`;
    } catch {
      return null;
    }
  }

  static async captureElementScreenshot(url, selector) {
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({
        viewport: {
          width: 1440,
          height: 1000,
        },
        deviceScaleFactor: 1,
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: this.getBrowserNavigationTimeout(),
      });
      await this.waitForNetworkToSettle(page);

      const element = await page.$(selector);
      if (!element) {
        throw new Error("Element not found");
      }

      const screenshot = await element.screenshot();
      await context.close();
      await browser.close();

      return `data:image/png;base64,${screenshot.toString("base64")}`;
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      return null;
    }
  }
}

module.exports = AccessibilityTester;
