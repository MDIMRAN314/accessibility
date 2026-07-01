const AccessibilityTester = require("./AccessibilityTester");
const CustomAxeRules = require("./CustomAxeRules");

describe("AccessibilityTester WCAG engine selection", () => {
  it("uses WCAG 2.0 axe tags without 2.1 or 2.2 tags", () => {
    expect(AccessibilityTester.getAxeTags("AA", "2.0", false)).toEqual([
      "wcag2a",
      "wcag2aa",
    ]);
  });

  it("enables axe label-in-name rule when WCAG 2.5.3 is in scope", () => {
    expect(
      AccessibilityTester.shouldRunLabelInNameScan("2.1", "A", ["Forms"], [
        "2.5",
      ]),
    ).toBe(true);
    expect(
      AccessibilityTester.getAxeRunOptions({
        runOnlyTags: ["wcag2a", "wcag21a"],
        wcagVersion: "2.1",
        conformanceLevel: "A",
        checkPoints: ["Forms"],
        selectedGuidelines: ["2.5"],
      }).rules,
    ).toEqual({
      "label-content-name-mismatch": { enabled: true },
    });
    expect(
      AccessibilityTester.shouldRunLabelInNameScan(
        "2.1",
        "A",
        ["Link/Buttons"],
        ["2.5"],
      ),
    ).toBe(true);
    expect(
      AccessibilityTester.shouldRunLabelInNameScan("2.0", "A", ["Forms"], [
        "2.5",
      ]),
    ).toBe(false);
  });

  it("runs HTMLCS for WCAG 2.0 and 2.1, but not 2.2", () => {
    expect(AccessibilityTester.shouldRunHtmlcs("2.0")).toBe(true);
    expect(AccessibilityTester.shouldRunHtmlcs("2.1")).toBe(true);
    expect(AccessibilityTester.shouldRunHtmlcs("2.2")).toBe(false);
  });

  it("runs IBM only for WCAG A and AA policies", () => {
    expect(AccessibilityTester.shouldRunIbm("2.0", "A")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.1", "AA")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.2", "AA")).toBe(true);
    expect(AccessibilityTester.shouldRunIbm("2.2", "AAA")).toBe(false);
    expect(AccessibilityTester.shouldRunIbm("3.0", "AA")).toBe(false);
  });

  it("runs custom axe DOM rules only for matching checkpoints and guidelines", () => {
    expect(
      CustomAxeRules.shouldRunFor({
        checkPoints: ["Video/Audio"],
        selectedGuidelines: ["1.2"],
      }),
    ).toBe(true);
    expect(
      CustomAxeRules.shouldRunFor({
        checkPoints: ["Images"],
        selectedGuidelines: ["1.2"],
      }),
    ).toBe(false);
    expect(
      CustomAxeRules.shouldRunFor({
        checkPoints: ["Video/Audio"],
        selectedGuidelines: ["1.4"],
      }),
    ).toBe(false);
  });

  it("runs reflow scan only when WCAG 1.4.10 is in scope", () => {
    expect(
      AccessibilityTester.shouldRunReflowScan("2.2", "AA", ["Responsive"], [
        "1.4",
      ]),
    ).toBe(true);
    expect(
      AccessibilityTester.shouldRunReflowScan("2.0", "AA", ["Responsive"], [
        "1.4",
      ]),
    ).toBe(false);
    expect(
      AccessibilityTester.shouldRunReflowScan("2.2", "AA", ["Forms"], ["1.4"]),
    ).toBe(false);
  });

  it("maps WCAG versions to IBM Equal Access policies", () => {
    expect(AccessibilityTester.getIbmPolicy("2.0")).toBe("WCAG_2_0");
    expect(AccessibilityTester.getIbmPolicy("2.1")).toBe("WCAG_2_1");
    expect(AccessibilityTester.getIbmPolicy("2.2")).toBe("WCAG_2_2");
    expect(AccessibilityTester.getIbmPolicy("3.0")).toBeNull();
  });

  it("maps WCAG 2.0 HTMLCS criteria codes into the scoring criteria set", () => {
    expect(
      AccessibilityTester.getCriterionFromHtmlcsCode(
        "WCAG2AA.Principle4.Guideline4_1.4_1_1.F77",
        "2.0",
      )?.[0],
    ).toBe("4.1.1");
  });

  it("maps IBM rules to criteria only when they belong to the selected WCAG version", () => {
    expect(
      AccessibilityTester.getCriteriaFromIbmRule(
        "target_spacing_sufficient",
        "violation_spacing",
        "2.2",
      ).map(([criterion]) => criterion),
    ).toContain("2.5.8");

    expect(
      AccessibilityTester.getCriteriaFromIbmRule(
        "target_spacing_sufficient",
        "violation_spacing",
        "2.1",
      ),
    ).toEqual([]);
  });

  it("normalizes axe label-in-name findings as automated WCAG 2.5.3 form issues", () => {
    const issues = AccessibilityTester.processAxeResults(
      {
        violations: [
          {
            id: "label-content-name-mismatch",
            impact: "serious",
            description:
              "Ensure that elements labelled through their content must have their visible text as part of their accessible name",
            help: "Elements must have their visible text as part of their accessible name",
            helpUrl:
              "https://dequeuniversity.com/rules/axe/4.7/label-content-name-mismatch",
            tags: ["cat.semantics", "wcag21a", "wcag253", "experimental"],
            nodes: [
              {
                target: ["button"],
                html: '<button aria-label="Submit form">Send</button>',
                failureSummary:
                  "Fix any of the following: Text inside the element is not included in the accessible name",
              },
            ],
          },
        ],
        incomplete: [],
        passes: [],
      },
      "2.1",
      "A",
      ["Forms"],
      ["2.5"],
      {
        pageUrl: "https://example.com",
        pageTitle: "Example",
        pageDepth: 0,
        pageIndex: 1,
      },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      criterion: "2.5.3",
      principle: "Operable",
      guideline: "2.5",
      status: "Fail",
      type: "Automated",
      engine: "axe-core",
    });
  });

  it("keeps axe label-in-name findings in link and button checkpoint scans", () => {
    const issues = AccessibilityTester.processAxeResults(
      {
        violations: [
          {
            id: "label-content-name-mismatch",
            impact: "serious",
            description:
              "Ensure that elements labelled through their content must have their visible text as part of their accessible name",
            help: "Elements must have their visible text as part of their accessible name",
            helpUrl:
              "https://dequeuniversity.com/rules/axe/4.7/label-content-name-mismatch",
            tags: ["cat.semantics", "wcag21a", "wcag253", "experimental"],
            nodes: [
              {
                target: ["button"],
                html: '<button aria-label="Submit form">Send</button>',
                failureSummary:
                  "Fix any of the following: Text inside the element is not included in the accessible name",
              },
            ],
          },
        ],
        incomplete: [],
        passes: [],
      },
      "2.1",
      "A",
      ["Link/Buttons"],
      ["2.5"],
      {
        pageUrl: "https://example.com",
        pageTitle: "Example",
        pageDepth: 0,
        pageIndex: 1,
      },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      criterion: "2.5.3",
      guideline: "2.5",
      status: "Fail",
      type: "Automated",
      engine: "axe-core",
    });
  });

  it("keeps axe locators as CSS selectors without generating fake XPath", () => {
    const element = AccessibilityTester.mapNodeToElement(
      {
        target: ["main form button[type=\"submit\"]"],
        html: '<button type="submit">Send</button>',
      },
      0,
      {
        pageUrl: "https://example.com",
        pageTitle: "Example",
        pageIndex: 1,
      },
      "Fail",
    );

    expect(element.selector).toBe('main form button[type="submit"]');
    expect(element.xpath).toBe("");
    expect(element.locators).toEqual([
      {
        type: "CSS Selector",
        value: 'main form button[type="submit"]',
      },
      {
        type: "XPath",
        value: "N/A",
      },
      {
        type: "Page URL",
        value: "https://example.com",
      },
    ]);
  });

  it("creates suggested fix text that is not a repeat of the issue description", () => {
    const suggestion = AccessibilityTester.createSuggestedFix({
      description:
        "This element's role is presentation but contains child elements with semantic meaning.",
      rawSuggestion:
        "This element's role is presentation but contains child elements with semantic meaning.",
      criterion: "1.3.1",
      criterionConfig: {
        name: "Info and Relationships",
        howToTest:
          "Inspect semantic structure and ensure roles do not hide meaningful child content.",
      },
      helpUrl: "https://dequeuniversity.com/rules/axe/4.7/presentation-role-conflict",
    });

    expect(suggestion).toContain("WCAG 1.3.1 Info and Relationships");
    expect(suggestion).not.toBe(
      "This element's role is presentation but contains child elements with semantic meaning.",
    );
  });

  it("builds engine and WCAG reference links for issues", () => {
    const links = AccessibilityTester.getReferenceLinks({
      engine: "axe-core",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.7/presentation-role-conflict",
      ruleId: "presentation-role-conflict",
      criterion: "1.3.1",
      criterionConfig: {
        name: "Info and Relationships",
      },
      wcagVersion: "2.2",
    });

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Deque axe rule: presentation-role-conflict",
          source: "axe-core",
        }),
        expect.objectContaining({
          label: "WCAG Understanding: 1.3.1 Info and Relationships",
          source: "WCAG",
          url: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
        }),
      ]),
    );
  });

  it("normalizes custom media findings into report issues", () => {
    const issues = AccessibilityTester.processCustomMediaResults(
      [
        {
          id: "captions-in-embedded-video",
          criterion: "1.2.2",
          description:
            "YouTube embedded video does not request captions by default.",
          recommendation: "Add the cc_load_policy=1 parameter.",
          severity: "Critical",
          status: "Fail",
          type: "Automated",
          tags: ["wcag2a", "wcag122", "video", "caption", "custom-media"],
          element: {
            elementName: "YouTube player",
            selector: "iframe",
            xpath: "/html/body/iframe",
            html: '<iframe src="https://www.youtube.com/embed/video"></iframe>',
          },
        },
      ],
      "2.2",
      "AA",
      ["Video/Audio"],
      ["All"],
      {
        pageUrl: "https://example.com",
        pageTitle: "Example",
        pageDepth: 0,
        pageIndex: 1,
      },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      criterion: "1.2.2",
      guideline: "1.2",
      severity: "Critical",
      status: "Fail",
      type: "Automated",
      engine: "custom-media-rules",
      suggestedFix: expect.stringContaining("cc_load_policy=1"),
    });
    expect(issues[0].elements[0]).toMatchObject({
      elementName: "YouTube player",
      selector: "iframe",
      status: "Fail",
    });
  });

  it("filters custom media findings by selected checkpoints", () => {
    const issues = AccessibilityTester.processCustomMediaResults(
      [
        {
          id: "captions-in-html5-video",
          criterion: "1.2.2",
          description: "HTML5 video is missing a captions track.",
          tags: ["wcag2a", "wcag122", "video", "caption", "custom-media"],
          element: {
            selector: "video",
            html: "<video></video>",
          },
        },
      ],
      "2.2",
      "AA",
      ["Images"],
      ["All"],
      {},
    );

    expect(issues).toEqual([]);
  });

  it("normalizes custom WCAG findings with their own engine", () => {
    const issues = AccessibilityTester.processCustomMediaResults(
      [
        {
          engine: "custom-wcag-rules",
          id: "reflow-horizontal-overflow",
          criterion: "1.4.10",
          description: "Page requires horizontal scrolling at 320px viewport width.",
          recommendation: "Use responsive widths so content fits at 320px.",
          severity: "Serious",
          status: "Fail",
          type: "Semi-Automated",
          checkpoint: "Responsive",
          tags: ["wcag21aa", "wcag1410", "reflow", "responsive"],
          element: {
            elementName: "body",
            selector: "body",
            xpath: "/html/body",
            html: "<body></body>",
          },
        },
      ],
      "2.2",
      "AA",
      ["Responsive"],
      ["All"],
      {
        pageUrl: "https://example.com",
        pageTitle: "Example",
        pageDepth: 0,
        pageIndex: 1,
      },
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      criterion: "1.4.10",
      guideline: "1.4",
      status: "Fail",
      type: "Semi-Automated",
      engine: "custom-wcag-rules",
      decisionEngine: "custom-wcag-rules",
    });
  });

  it("extracts custom axe collector findings before native axe normalization", () => {
    const finding = {
      engine: "custom-wcag-rules",
      id: "input-purpose-missing-autocomplete",
      criterion: "1.3.5",
      description: 'Input appears to collect email but does not include autocomplete="email".',
      recommendation:
        'Add autocomplete="email" so browsers and assistive technologies can identify the input purpose.',
      severity: "Moderate",
      status: "Warning",
      type: "Automated",
      checkpoint: "Forms",
      tags: ["wcag21aa", "wcag135", "forms", "autocomplete"],
      element: {
        selector: "input#email",
        html: '<input id="email" type="email">',
      },
    };
    const { nativeResults, customResults } = CustomAxeRules.splitResults({
      violations: [
        {
          id: CustomAxeRules.DOM_RULE_ID,
          nodes: [
            {
              any: [{ data: { findings: [finding] } }],
              all: [],
              none: [],
            },
          ],
        },
        {
          id: "button-name",
          nodes: [],
          tags: ["wcag2a", "wcag412"],
        },
      ],
      incomplete: [],
      passes: [],
    });

    expect(customResults).toEqual([finding]);
    expect(nativeResults.violations).toHaveLength(1);
    expect(nativeResults.violations[0].id).toBe("button-name");
  });
});
