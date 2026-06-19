const EnginePriority = require("./EnginePriority");

describe("EnginePriority", () => {
  it("marks the final criterion status as fail if any engine fails", () => {
    expect(
      EnginePriority.deriveCriterionState([
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
          engine: "axe-core",
        },
        {
          criterion: "1.1.1",
          status: "Fail",
          type: "Automated",
          engine: "ibm-equal-access",
        },
        {
          criterion: "1.1.1",
          status: "Pass",
          type: "Automated",
          engine: "htmlcs",
        },
      ]),
    ).toBe("Fail");
  });

  it("removes redundant entries and keeps one representative with engine results", () => {
    const issues = EnginePriority.applyToIssues([
      {
        issueId: "AXE-1",
        criterion: "1.1.1",
        status: "Pass",
        type: "Automated",
        engine: "axe-core",
        pageUrl: "https://example.com",
        elements: [],
      },
      {
        issueId: "IBM-1",
        criterion: "1.1.1",
        status: "Fail",
        type: "Automated",
        engine: "ibm-equal-access",
        pageUrl: "https://example.com",
        referenceLinks: [
          {
            label: "IBM reference",
            url: "https://www.ibm.com/able/requirements/checker-rule-sets/",
          },
        ],
        elements: [{ selector: "#logo", status: "Fail" }],
      },
      {
        issueId: "HTMLCS-1",
        criterion: "1.1.1",
        status: "Fail",
        type: "Automated",
        engine: "htmlcs",
        pageUrl: "https://example.com",
        referenceLinks: [
          {
            label: "WCAG reference",
            url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
          },
        ],
        elements: [{ selector: "#logo", status: "Fail" }],
      },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      criterion: "1.1.1",
      status: "Fail",
      finalStatus: "Fail",
      rawStatus: "Fail",
      redundantEntryCount: 2,
      mergedIssueIds: ["AXE-1", "IBM-1", "HTMLCS-1"],
    });
    expect(issues[0].engineResults).toEqual([
      { engine: "axe-core", status: "Pass", count: 1 },
      { engine: "ibm-equal-access", status: "Fail", count: 1 },
      { engine: "htmlcs", status: "Fail", count: 1 },
    ]);
    expect(issues[0].referenceLinks).toEqual([
      {
        label: "IBM reference",
        url: "https://www.ibm.com/able/requirements/checker-rule-sets/",
      },
      {
        label: "WCAG reference",
        url: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      },
    ]);
  });

  it("keeps distinct failing elements for the same criterion", () => {
    const issues = EnginePriority.applyToIssues([
      {
        issueId: "IBM-1",
        criterion: "1.1.1",
        status: "Fail",
        type: "Automated",
        engine: "ibm-equal-access",
        pageUrl: "https://example.com",
        elements: [{ selector: "#logo", status: "Fail" }],
      },
      {
        issueId: "HTMLCS-1",
        criterion: "1.1.1",
        status: "Fail",
        type: "Automated",
        engine: "htmlcs",
        pageUrl: "https://example.com",
        elements: [{ selector: "#hero", status: "Fail" }],
      },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.elements[0].selector).sort()).toEqual([
      "#hero",
      "#logo",
    ]);
  });

  it("keeps custom media failures when another engine passes the criterion", () => {
    const issues = EnginePriority.applyToIssues([
      {
        issueId: "AXE-PASS",
        criterion: "1.2.2",
        status: "Pass",
        type: "Automated",
        engine: "axe-core",
        pageUrl: "https://example.com",
        elements: [],
      },
      {
        issueId: "CUSTOM-FAIL",
        criterion: "1.2.2",
        status: "Fail",
        type: "Automated",
        engine: "custom-media-rules",
        pageUrl: "https://example.com",
        elements: [{ selector: "iframe", status: "Fail" }],
      },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      issueId: "CUSTOM-FAIL",
      status: "Fail",
      finalStatus: "Fail",
      decisionEngine: "custom-media-rules",
    });
    expect(issues[0].engineResults).toEqual([
      { engine: "axe-core", status: "Pass", count: 1 },
      { engine: "custom-media-rules", status: "Fail", count: 1 },
    ]);
  });
});
