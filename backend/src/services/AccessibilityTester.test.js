const AccessibilityTester = require("./AccessibilityTester");

describe("AccessibilityTester WCAG engine selection", () => {
  it("uses WCAG 2.0 axe tags without 2.1 or 2.2 tags", () => {
    expect(AccessibilityTester.getAxeTags("AA", "2.0", false)).toEqual([
      "wcag2a",
      "wcag2aa",
    ]);
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
});
