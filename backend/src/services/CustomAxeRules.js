const CustomMediaRules = require("./CustomMediaRules");
const CustomWcagRules = require("./CustomWcagRules");

const CUSTOM_AXE_DOM_RULE_ID = "custom-accessibility-dom-rules";
const CUSTOM_AXE_DOM_CHECK_ID = "custom-accessibility-dom-rules-check";
const MAX_FINDINGS_PER_RULE = 20;

const CUSTOM_AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag21aaa",
  "wcag22aa",
  "wcag121",
  "wcag122",
  "wcag123",
  "wcag125",
  "wcag135",
  "wcag211",
  "wcag212",
  "wcag243",
  "wcag247",
  "wcag2412",
  "wcag413",
  "custom-media",
  "custom-wcag",
];
const CUSTOM_DOM_CHECKPOINTS = new Set([
  "ARIA",
  "Forms",
  "Focus Order",
  "Tab Order",
  "Video/Audio",
]);
const CUSTOM_DOM_GUIDELINES = new Set(["1.2", "1.3", "2.1", "2.4", "4.1"]);

class CustomAxeRules {
  static get DOM_RULE_ID() {
    return CUSTOM_AXE_DOM_RULE_ID;
  }

  static async configure(page) {
    const mediaScannerSource = this.extractPageEvaluateCallback(
      CustomMediaRules.scan,
    );
    const wcagScannerSource = this.extractPageEvaluateCallback(
      CustomWcagRules.scanDomRules,
    );

    await page.evaluate(
      ({
        checkId,
        maxFindingsPerRule,
        mediaScannerSource,
        ruleId,
        tags,
        wcagScannerSource,
      }) => {
        if (!window.axe || typeof window.axe.configure !== "function") {
          throw new Error("axe-core did not initialize before custom rules");
        }

        const mediaScanner = new Function(
          `return (${mediaScannerSource});`,
        )();
        const wcagScanner = new Function(`return (${wcagScannerSource});`)();

        window.__accessibilityPocCustomAxeScanners = {
          maxFindingsPerRule,
          mediaScanner,
          wcagScanner,
        };

        window.axe.configure({
          checks: [
            {
              id: checkId,
              evaluate: function evaluateCustomAccessibilityDomRules() {
                const scanners = window.__accessibilityPocCustomAxeScanners;
                const findings = [
                  ...scanners.mediaScanner(),
                  ...scanners.wcagScanner(scanners.maxFindingsPerRule),
                ];

                this.data({ findings });
                return findings.length === 0;
              },
              metadata: {
                impact: "serious",
                messages: {
                  pass: "No custom accessibility findings detected.",
                  fail: "Custom accessibility findings were detected.",
                },
              },
            },
          ],
          rules: [
            {
              id: ruleId,
              selector: "html",
              excludeHidden: false,
              any: [checkId],
              tags,
              metadata: {
                description:
                  "Runs project-specific accessibility checks through axe-core.",
                help: "Project custom WCAG and media accessibility checks",
              },
            },
          ],
        });
      },
      {
        checkId: CUSTOM_AXE_DOM_CHECK_ID,
        maxFindingsPerRule: MAX_FINDINGS_PER_RULE,
        mediaScannerSource,
        ruleId: CUSTOM_AXE_DOM_RULE_ID,
        tags: CUSTOM_AXE_TAGS,
        wcagScannerSource,
      },
    );
  }

  static shouldRunFor({ checkPoints = ["All"], selectedGuidelines = ["All"] } = {}) {
    return (
      this.hasSelectedOverlap(checkPoints, CUSTOM_DOM_CHECKPOINTS) &&
      this.hasSelectedOverlap(selectedGuidelines, CUSTOM_DOM_GUIDELINES)
    );
  }

  static hasSelectedOverlap(selectedValues = ["All"], supportedValues) {
    if (!selectedValues || selectedValues.includes("All")) {
      return true;
    }

    return selectedValues.some((value) => supportedValues.has(value));
  }

  static extractPageEvaluateCallback(method) {
    const source = method.toString();
    const prefix = "return page.evaluate(";
    const start = source.indexOf(prefix);
    const end = source.lastIndexOf(");");

    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Unable to extract custom scanner callback");
    }

    let callbackSource = source.slice(start + prefix.length, end).trim();
    const maxFindingsArgument = ", MAX_FINDINGS_PER_RULE";

    if (callbackSource.endsWith(maxFindingsArgument)) {
      callbackSource = callbackSource
        .slice(0, -maxFindingsArgument.length)
        .trim();
    }

    return callbackSource;
  }

  static splitResults(axeResults = {}) {
    const nativeResults = {
      ...axeResults,
      violations: [],
      incomplete: [],
      passes: [],
    };
    const customResults = [];

    ["violations", "incomplete", "passes"].forEach((resultType) => {
      (axeResults[resultType] || []).forEach((result) => {
        if (result.id === CUSTOM_AXE_DOM_RULE_ID) {
          customResults.push(...this.extractCustomFindings(result));
          return;
        }

        nativeResults[resultType].push(result);
      });
    });

    return { nativeResults, customResults };
  }

  static extractCustomFindings(result = {}) {
    return (result.nodes || []).flatMap((node) =>
      ["any", "all", "none"].flatMap((checkType) =>
        (node[checkType] || []).flatMap((check) => {
          const findings = check?.data?.findings;
          return Array.isArray(findings) ? findings : [];
        }),
      ),
    );
  }
}

module.exports = CustomAxeRules;
