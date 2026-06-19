const { chromium } = require("playwright");
const JawsDesktopTranscriber = require("./JawsDesktopTranscriber");

const ALL_CHECKPOINTS = [
  "Headings",
  "Landmarks",
  "Page Title",
  "Tab Order",
  "Focus Order",
  "Skip Links",
  "Forms",
  "Images",
  "Video/Audio",
  "Link/Buttons",
  "ARIA",
  "Color Contrast",
  "Hidden Content",
  "Language",
  "Best Practices",
];

const NAVIGATION_TIMEOUT = 180000;
const NETWORK_IDLE_TIMEOUT = 10000;

class ScreenReaderTranscriber {
  static async generate({ url, screenReader = "JAWS", checkPoints = ["All"] }) {
    if (screenReader !== "JAWS") {
      throw new Error("Only JAWS transcription is supported in this POC");
    }

    const normalizedUrl = this.normalizeUrl(url);
    const selectedCheckPoints = this.normalizeCheckPoints(checkPoints);
    const mode = String(process.env.JAWS_TRANSCRIPTION_MODE || "auto").toLowerCase();

    if (mode === "actual" || mode === "auto") {
      const availability = await JawsDesktopTranscriber.getAvailability();

      if (availability.available) {
        try {
          return await JawsDesktopTranscriber.generate({
            url: normalizedUrl,
            checkPoints: selectedCheckPoints,
          });
        } catch (error) {
          if (mode === "actual") {
            throw error;
          }

          return this.generateSemanticTranscript({
            url: normalizedUrl,
            selectedCheckPoints,
            fallbackNote: `Actual JAWS was detected but could not be captured in this session: ${error.message}`,
          });
        }
      }

      if (mode === "actual") {
        throw new Error(availability.reason);
      }
    }

    return this.generateSemanticTranscript({
      url: normalizedUrl,
      selectedCheckPoints,
      fallbackNote:
        mode === "auto"
          ? "Actual JAWS was not detected, so the report used browser accessibility semantics as a fallback."
          : undefined,
    });
  }

  static async generateSemanticTranscript({
    url,
    selectedCheckPoints,
    fallbackNote,
  }) {
    let browser;

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

      page.setDefaultTimeout(NAVIGATION_TIMEOUT);
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT,
      });

      if (!response || !response.ok()) {
        throw new Error(
          `HTTP Error: ${response ? response.status() : "No response"}`,
        );
      }

      await page
        .waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT })
        .catch(() => {});
      await page.evaluate(() => {
        document.querySelectorAll("details").forEach((element) => {
          element.open = true;
        });
      });

      const pageData = await page.evaluate((selected) => {
        const normalize = (value) =>
          String(value || "")
            .replace(/\s+/g, " ")
            .trim();

        const isElement = (node) => node && node.nodeType === Node.ELEMENT_NODE;

        const isHiddenFromScreenReader = (element) => {
          if (!isElement(element)) {
            return true;
          }

          if (
            element.closest("[hidden], [inert], [aria-hidden='true']") ||
            element.getAttribute("role") === "presentation"
          ) {
            return true;
          }

          const style = window.getComputedStyle(element);
          return style.display === "none" || style.visibility === "hidden";
        };

        const getText = (element) => normalize(element?.textContent);

        const getLabelledByText = (element) =>
          normalize(
            String(element?.getAttribute("aria-labelledby") || "")
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent || "")
              .join(" "),
          );

        const getAssociatedLabel = (element) => {
          const labels = Array.from(element?.labels || []);
          if (labels.length > 0) {
            return normalize(labels.map((label) => label.textContent).join(" "));
          }

          const id = element?.id;
          if (!id) {
            return "";
          }

          return normalize(
            document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent,
          );
        };

        const getAccessibleName = (element, options = {}) => {
          if (!element) {
            return "";
          }

          const includeTextFallback = options.includeTextFallback !== false;

          return (
            normalize(element.getAttribute("aria-label")) ||
            getLabelledByText(element) ||
            getAssociatedLabel(element) ||
            normalize(element.getAttribute("alt")) ||
            normalize(element.getAttribute("title")) ||
            normalize(element.getAttribute("placeholder")) ||
            normalize(element.value) ||
            (includeTextFallback ? getText(element) : "")
          );
        };

        const getRole = (element) => {
          const explicitRole = normalize(element.getAttribute("role"));
          if (explicitRole) {
            return explicitRole;
          }

          const tagName = element.tagName.toLowerCase();
          if (/^h[1-6]$/.test(tagName)) return "heading";
          if (tagName === "a") return "link";
          if (tagName === "button") return "button";
          if (tagName === "img" || tagName === "svg") return "graphic";
          if (tagName === "select") return "combo box";
          if (tagName === "textarea") return "edit";
          if (tagName === "input") {
            const type = String(element.getAttribute("type") || "text").toLowerCase();
            if (type === "checkbox") return "check box";
            if (type === "radio") return "radio button";
            if (["submit", "button", "reset"].includes(type)) return "button";
            if (type === "password") return "protected edit";
            return "edit";
          }
          if (tagName === "nav") return "navigation landmark";
          if (tagName === "main") return "main landmark";
          if (tagName === "header") return "banner landmark";
          if (tagName === "footer") return "contentinfo landmark";
          if (tagName === "aside") return "complementary landmark";
          if (tagName === "form") return "form";
          if (tagName === "audio") return "audio";
          if (tagName === "video") return "video";
          return tagName;
        };

        const describeState = (element) => {
          const states = [];

          if (element.disabled || element.getAttribute("aria-disabled") === "true") {
            states.push("unavailable");
          }

          if (element.required || element.getAttribute("aria-required") === "true") {
            states.push("required");
          }

          if (element.getAttribute("aria-invalid") === "true") {
            states.push("invalid");
          }

          if (element.checked || element.getAttribute("aria-checked") === "true") {
            states.push("checked");
          }

          if (element.getAttribute("aria-expanded")) {
            states.push(
              element.getAttribute("aria-expanded") === "true"
                ? "expanded"
                : "collapsed",
            );
          }

          return states.join(", ");
        };

        const structuralRoles = new Set([
          "banner landmark",
          "navigation landmark",
          "main landmark",
          "contentinfo landmark",
          "complementary landmark",
          "form",
          "region",
        ]);

        const lineForElement = (element, fallbackName = "Unnamed element") => {
          const role = getRole(element);
          const accessibleName = getAccessibleName(element, {
            includeTextFallback: !structuralRoles.has(role),
          });
          const name =
            accessibleName || (structuralRoles.has(role) ? "" : fallbackName);
          const state = describeState(element);
          return normalize([role, name, state].filter(Boolean).join(": "));
        };

        const getDirectText = (element) =>
          normalize(
            Array.from(element.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.textContent)
              .join(" "),
          );

        const getElements = (selector, includeHidden = false) =>
          Array.from(document.querySelectorAll(selector)).filter((element) =>
            includeHidden ? true : !isHiddenFromScreenReader(element),
          );

        const uniqueLines = (lines) => {
          const seen = new Set();
          return lines.filter((line) => {
            const normalized = normalize(line);
            if (!normalized || seen.has(normalized)) {
              return false;
            }

            seen.add(normalized);
            return true;
          });
        };

        const createSection = (checkpoint, lines) => ({
          checkpoint,
          lines: uniqueLines(lines).slice(0, 200),
        });

        const focusableSelector = [
          "a[href]",
          "button",
          "input",
          "select",
          "textarea",
          "summary",
          "audio[controls]",
          "video[controls]",
          "[contenteditable='true']",
          "[tabindex]:not([tabindex='-1'])",
          "[role='button']",
          "[role='link']",
        ].join(",");

        const checkpointBuilders = {
          "Page Title": () =>
            createSection("Page Title", [
              `Page title: ${normalize(document.title) || "Untitled page"}`,
            ]),
          Language: () =>
            createSection("Language", [
              `Page language: ${
                normalize(document.documentElement.getAttribute("lang")) ||
                "not specified"
              }`,
            ]),
          Headings: () =>
            createSection(
              "Headings",
              getElements("h1, h2, h3, h4, h5, h6").map((heading) => {
                const level = heading.tagName.substring(1);
                return `Heading level ${level}: ${getAccessibleName(heading)}`;
              }),
            ),
          Landmarks: () =>
            createSection(
              "Landmarks",
              getElements(
                "header, nav, main, footer, aside, form, [role='banner'], [role='navigation'], [role='main'], [role='contentinfo'], [role='complementary'], [role='search'], [role='region']",
              ).map((element) => lineForElement(element, "Landmark")),
            ),
          "Tab Order": () => {
            const ordered = getElements(focusableSelector)
              .filter(
                (element) =>
                  !element.disabled &&
                  Number(element.getAttribute("tabindex") || "0") >= 0,
              )
              .map((element, index) => ({
                element,
                index,
                tabIndex: Number(element.getAttribute("tabindex") || "0"),
              }))
              .sort((left, right) => {
                if (left.tabIndex > 0 && right.tabIndex > 0) {
                  return left.tabIndex - right.tabIndex || left.index - right.index;
                }

                if (left.tabIndex > 0) return -1;
                if (right.tabIndex > 0) return 1;
                return left.index - right.index;
              });

            return createSection(
              "Tab Order",
              ordered.map(
                ({ element }, index) =>
                  `${index + 1}. ${lineForElement(element, "Focusable element")}`,
              ),
            );
          },
          "Focus Order": () =>
            createSection(
              "Focus Order",
              getElements(focusableSelector)
                .filter((element) => !element.disabled)
                .map(
                  (element, index) =>
                    `${index + 1}. ${lineForElement(element, "Focusable element")}`,
                ),
            ),
          "Skip Links": () =>
            createSection(
              "Skip Links",
              getElements("a[href^='#']").map((link) => {
                const target = link.getAttribute("href");
                return `Skip link: ${getAccessibleName(link) || "Unnamed link"} to ${target}`;
              }),
            ),
          Forms: () =>
            createSection(
              "Forms",
              getElements("form, fieldset, legend, label, input, select, textarea").map(
                (element) => lineForElement(element, "Form element"),
              ),
            ),
          Images: () =>
            createSection(
              "Images",
              getElements("img, svg[role='img'], [role='img']").map((element) => {
                const name = getAccessibleName(element);
                return name
                  ? `Graphic: ${name}`
                  : "Graphic: missing accessible text";
              }),
            ),
          "Video/Audio": () =>
            createSection(
              "Video/Audio",
              getElements("audio, video, track").map((element) =>
                lineForElement(element, "Media"),
              ),
            ),
          "Link/Buttons": () =>
            createSection(
              "Link/Buttons",
              getElements("a[href], button, input[type='button'], input[type='submit'], input[type='reset'], [role='button'], [role='link']").map(
                (element) => lineForElement(element, "Interactive element"),
              ),
            ),
          ARIA: () =>
            createSection(
              "ARIA",
              getElements("[role], [aria-label], [aria-labelledby], [aria-describedby], [aria-live], [aria-expanded], [aria-controls], [aria-invalid]").map(
                (element) => {
                  const ariaDetails = Array.from(element.attributes)
                    .filter((attribute) => attribute.name.startsWith("aria-"))
                    .map((attribute) => `${attribute.name}=${attribute.value}`)
                    .join(", ");
                  return normalize(`${lineForElement(element, "ARIA element")} ${ariaDetails}`);
                },
              ),
            ),
          "Color Contrast": () =>
            createSection("Color Contrast", [
              "Color contrast is visual and is not announced by JAWS during page traversal.",
            ]),
          "Hidden Content": () =>
            createSection(
              "Hidden Content",
              getElements("[hidden], [aria-hidden='true'], [style*='display: none'], [style*='visibility: hidden']", true).map(
                (element) =>
                  `Not announced by JAWS: ${getText(element) || getRole(element)}`,
              ),
            ),
          "Best Practices": () => {
            const lines = [];
            if (!normalize(document.title)) {
              lines.push("Best practice: page title is missing.");
            }
            if (!document.querySelector("main, [role='main']")) {
              lines.push("Best practice: main landmark is missing.");
            }
            if (!normalize(document.documentElement.getAttribute("lang"))) {
              lines.push("Best practice: page language is not specified.");
            }
            if (lines.length === 0) {
              lines.push("Best practice: core screen reader structure is present.");
            }
            return createSection("Best Practices", lines);
          },
        };

        const hasCheckpoint = (checkpoint) => selected.includes(checkpoint);
        const hasAnyCheckpoint = (checkpoints) =>
          checkpoints.some((checkpoint) => hasCheckpoint(checkpoint));

        const getElementCheckpoints = (element) => {
          const checkpoints = [];
          const tagName = element.tagName.toLowerCase();
          const role = normalize(element.getAttribute("role")).toLowerCase();

          if (/^h[1-6]$/.test(tagName) || role === "heading") {
            checkpoints.push("Headings");
          }
          if (
            ["header", "nav", "main", "footer", "aside", "section"].includes(
              tagName,
            ) ||
            [
              "banner",
              "navigation",
              "main",
              "contentinfo",
              "complementary",
              "search",
              "region",
            ].includes(role)
          ) {
            checkpoints.push("Landmarks");
          }
          if (tagName === "a" && element.getAttribute("href")?.startsWith("#")) {
            checkpoints.push("Skip Links");
          }
          if (
            ["form", "fieldset", "legend", "label", "input", "select", "textarea"].includes(
              tagName,
            )
          ) {
            checkpoints.push("Forms");
          }
          if (tagName === "img" || tagName === "svg" || role === "img") {
            checkpoints.push("Images");
          }
          if (["audio", "video", "track"].includes(tagName)) {
            checkpoints.push("Video/Audio");
          }
          if (
            tagName === "a" ||
            tagName === "button" ||
            ["button", "link"].includes(role) ||
            (tagName === "input" &&
              ["button", "submit", "reset"].includes(
                String(element.getAttribute("type") || "").toLowerCase(),
              ))
          ) {
            checkpoints.push("Link/Buttons");
          }
          if (
            element.hasAttribute("role") ||
            Array.from(element.attributes).some((attribute) =>
              attribute.name.startsWith("aria-"),
            )
          ) {
            checkpoints.push("ARIA");
          }
          if (
            element.matches(
              "[hidden], [aria-hidden='true'], [style*='display: none'], [style*='visibility: hidden']",
            )
          ) {
            checkpoints.push("Hidden Content");
          }
          if (
            element.matches(focusableSelector) &&
            !element.disabled &&
            Number(element.getAttribute("tabindex") || "0") >= 0
          ) {
            checkpoints.push("Tab Order", "Focus Order");
          }

          const directText = getDirectText(element);
          if (
            directText &&
            ["p", "li", "dd", "dt", "figcaption", "caption", "blockquote", "td", "th"].includes(
              tagName,
            )
          ) {
            checkpoints.push("Best Practices");
          }

          return Array.from(new Set(checkpoints));
        };

        const getTraversalLine = (element, checkpoints) => {
          const tagName = element.tagName.toLowerCase();

          if (checkpoints.includes("Hidden Content")) {
            return `Not announced by JAWS: ${getText(element) || getRole(element)}`;
          }
          if (checkpoints.includes("Headings")) {
            const level =
              tagName.match(/^h([1-6])$/)?.[1] ||
              normalize(element.getAttribute("aria-level")) ||
              "";
            return `Heading${level ? ` level ${level}` : ""}: ${getAccessibleName(element)}`;
          }
          if (checkpoints.includes("Images")) {
            const name = getAccessibleName(element);
            return name ? `Graphic: ${name}` : "Graphic: missing accessible text";
          }
          if (checkpoints.includes("Skip Links")) {
            return `Skip link: ${getAccessibleName(element) || "Unnamed link"} to ${element.getAttribute("href")}`;
          }
          if (checkpoints.includes("Forms")) {
            return lineForElement(element, "Form element");
          }
          if (checkpoints.includes("Link/Buttons")) {
            return lineForElement(element, "Interactive element");
          }
          if (checkpoints.includes("Landmarks")) {
            return lineForElement(element, "Landmark");
          }
          if (checkpoints.includes("ARIA")) {
            const ariaDetails = Array.from(element.attributes)
              .filter((attribute) => attribute.name.startsWith("aria-"))
              .map((attribute) => `${attribute.name}=${attribute.value}`)
              .join(", ");
            return normalize(`${lineForElement(element, "ARIA element")} ${ariaDetails}`);
          }
          if (checkpoints.includes("Video/Audio")) {
            return lineForElement(element, "Media");
          }
          if (
            hasCheckpoint("Best Practices") &&
            ["p", "li", "dd", "dt", "figcaption", "caption", "blockquote", "td", "th"].includes(
              tagName,
            )
          ) {
            return getDirectText(element);
          }
          if (
            hasAnyCheckpoint(["Tab Order", "Focus Order"]) &&
            element.matches(focusableSelector)
          ) {
            return lineForElement(element, "Focusable element");
          }

          return "";
        };

        const buildTraversalLines = () => {
          const lines = [];
          const seenLines = new Set();
          const addLine = (line) => {
            const normalized = normalize(line);
            if (!normalized || seenLines.has(normalized)) {
              return;
            }

            seenLines.add(normalized);
            lines.push(normalized);
          };

          if (hasCheckpoint("Page Title")) {
            addLine(`Page title: ${normalize(document.title) || "Untitled page"}`);
          }
          if (hasCheckpoint("Language")) {
            addLine(
              `Page language: ${
                normalize(document.documentElement.getAttribute("lang")) ||
                "not specified"
              }`,
            );
          }
          if (hasCheckpoint("Color Contrast")) {
            addLine(
              "Color contrast is visual and is not announced by JAWS during page traversal.",
            );
          }

          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
              acceptNode(node) {
                return isElement(node)
                  ? NodeFilter.FILTER_ACCEPT
                  : NodeFilter.FILTER_REJECT;
              },
            },
          );

          while (walker.nextNode()) {
            const element = walker.currentNode;
            const checkpoints = getElementCheckpoints(element).filter((checkpoint) =>
              hasCheckpoint(checkpoint),
            );

            if (checkpoints.length === 0) {
              continue;
            }

            if (
              !checkpoints.includes("Hidden Content") &&
              isHiddenFromScreenReader(element)
            ) {
              continue;
            }

            addLine(getTraversalLine(element, checkpoints));
          }

          if (hasCheckpoint("Best Practices")) {
            if (!document.querySelector("main, [role='main']")) {
              addLine("Best practice: main landmark is missing.");
            }
            if (!normalize(document.documentElement.getAttribute("lang"))) {
              addLine("Best practice: page language is not specified.");
            }
          }

          return lines.slice(0, 800);
        };

        const sections = selected
          .map((checkpoint) => checkpointBuilders[checkpoint]?.())
          .filter(Boolean)
          .filter((section) => section.lines.length > 0);

        return {
          pageTitle: normalize(document.title) || "Untitled page",
          traversalLines: buildTraversalLines(),
          sections,
        };
      }, selectedCheckPoints);

      await context.close();
      await browser.close();

      const actualContent = pageData.traversalLines.join("\n").trim();
      const notes = [
        "Generated as a JAWS-style traversal transcript using browser accessibility semantics.",
        "This fallback does not capture licensed JAWS desktop speech output.",
      ];

      if (fallbackNote) {
        notes.unshift(fallbackNote);
      }

      return {
        screenReader: "JAWS",
        mode: "semantic-fallback",
        url,
        pageTitle: pageData.pageTitle,
        generatedAt: new Date().toISOString(),
        selectedCheckPoints,
        actualContent,
        sections: pageData.sections,
        stats: this.createStats(actualContent),
        notes,
      };
    } catch (error) {
      if (browser) {
        await browser.close().catch(() => {});
      }

      throw new Error(`Screen reader transcription failed: ${error.message}`);
    }
  }

  static normalizeUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("URL must use http or https");
      }

      return parsed.toString();
    } catch (error) {
      throw new Error(error.message || "Enter valid URL");
    }
  }

  static normalizeCheckPoints(checkPoints = ["All"]) {
    if (!Array.isArray(checkPoints) || checkPoints.includes("All")) {
      return ALL_CHECKPOINTS;
    }

    return checkPoints.filter((checkpoint) => ALL_CHECKPOINTS.includes(checkpoint));
  }

  static createStats(actualContent = "") {
    const trimmed = actualContent.trim();

    return {
      characters: trimmed.length,
      lines: trimmed ? trimmed.split(/\n/).length : 0,
      words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
    };
  }
}

module.exports = ScreenReaderTranscriber;
