const ENGINE_PRIORITY_ORDER = ["axe-core", "ibm-equal-access", "htmlcs"];
const ENGINE_PRIORITY = Object.fromEntries(
  ENGINE_PRIORITY_ORDER.map((engine, index) => [engine, index + 1]),
);

const PASS_STATUSES = new Set(["Pass", "Approved Exception", "Not an issue"]);
const FAIL_STATUSES = new Set(["Fail", "Error"]);
const REVIEW_STATUSES = new Set(["Warning", "Manual Review"]);
const IGNORED_TYPES = new Set(["Best Practices"]);
const IGNORED_STATUSES = new Set(["NA", "Best Practice"]);

class EnginePriority {
  static getEnginePriority(engine) {
    return ENGINE_PRIORITY[engine] || Number.MAX_SAFE_INTEGER;
  }

  static getRawStatus(issue = {}) {
    if (issue.status === "Suppressed" && issue.rawStatus) {
      return issue.rawStatus;
    }

    return issue.rawStatus || issue.status;
  }

  static normalizeStatus(status) {
    if (FAIL_STATUSES.has(status)) {
      return "Fail";
    }

    if (PASS_STATUSES.has(status)) {
      return "Pass";
    }

    if (REVIEW_STATUSES.has(status)) {
      return "Manual Review";
    }

    return "NA";
  }

  static deriveLegacyCriterionState(criterionIssues = []) {
    const statuses = criterionIssues
      .filter((issue) => !IGNORED_TYPES.has(issue.type))
      .map((issue) => EnginePriority.getRawStatus(issue))
      .filter((status) => !IGNORED_STATUSES.has(status));

    return EnginePriority.deriveStatusFromStatuses(statuses);
  }

  static deriveEngineState(engineIssues = []) {
    const statuses = engineIssues
      .filter((issue) => !IGNORED_TYPES.has(issue.type))
      .map((issue) => EnginePriority.getRawStatus(issue))
      .filter((status) => !IGNORED_STATUSES.has(status));

    return EnginePriority.deriveStatusFromStatuses(statuses);
  }

  static deriveStatusFromStatuses(statuses = []) {
    if (statuses.some((status) => FAIL_STATUSES.has(status))) {
      return "Fail";
    }

    if (statuses.some((status) => PASS_STATUSES.has(status))) {
      return "Pass";
    }

    if (statuses.some((status) => REVIEW_STATUSES.has(status))) {
      return "Manual Review";
    }

    return "NA";
  }

  static getKnownEngines(issues = []) {
    const knownEngines = new Set();

    issues.forEach((issue) => {
      if (issue.engine && ENGINE_PRIORITY[issue.engine]) {
        knownEngines.add(issue.engine);
      }
    });

    return ENGINE_PRIORITY_ORDER.filter((engine) => knownEngines.has(engine));
  }

  static pickCriterionDecision(criterionIssues = []) {
    const relevant = criterionIssues.filter(
      (issue) => !IGNORED_TYPES.has(issue.type),
    );
    const engines = EnginePriority.getKnownEngines(relevant);

    if (engines.length === 0) {
      const status = EnginePriority.deriveLegacyCriterionState(relevant);

      return {
        status,
        engine: null,
        priority: Number.MAX_SAFE_INTEGER,
        definitive: ["Pass", "Fail"].includes(status),
      };
    }

    const failingEngine = engines.find((engine) => {
      const engineIssues = relevant.filter((issue) => issue.engine === engine);
      return EnginePriority.deriveEngineState(engineIssues) === "Fail";
    });

    if (failingEngine) {
      return {
        status: "Fail",
        engine: failingEngine,
        priority: EnginePriority.getEnginePriority(failingEngine),
        definitive: true,
      };
    }

    const passingEngine = engines.find((engine) => {
      const engineIssues = relevant.filter((issue) => issue.engine === engine);
      return EnginePriority.deriveEngineState(engineIssues) === "Pass";
    });

    if (passingEngine) {
      return {
        status: "Pass",
        engine: passingEngine,
        priority: EnginePriority.getEnginePriority(passingEngine),
        definitive: true,
      };
    }

    const reviewEngine = engines.find((engine) => {
      const engineIssues = relevant.filter((issue) => issue.engine === engine);
      return EnginePriority.deriveEngineState(engineIssues) === "Manual Review";
    });

    if (reviewEngine) {
      return {
        status: "Manual Review",
        engine: reviewEngine,
        priority: EnginePriority.getEnginePriority(reviewEngine),
        definitive: false,
      };
    }

    return {
      status: "NA",
      engine: null,
      priority: Number.MAX_SAFE_INTEGER,
      definitive: false,
    };
  }

  static getDecisionStatuses(decision) {
    if (decision?.status === "Fail") {
      return FAIL_STATUSES;
    }

    if (decision?.status === "Pass") {
      return PASS_STATUSES;
    }

    if (decision?.status === "Manual Review") {
      return REVIEW_STATUSES;
    }

    return new Set(["NA"]);
  }

  static getEngineResults(criterionIssues = []) {
    const resultMap = new Map();

    criterionIssues.forEach((issue) => {
      if (IGNORED_TYPES.has(issue.type)) {
        return;
      }

      const rawStatus = EnginePriority.getRawStatus(issue);
      const key = `${issue.engine || "unknown"}::${rawStatus}`;
      const current = resultMap.get(key) || {
        engine: issue.engine || "unknown",
        status: rawStatus,
        count: 0,
      };

      current.count += 1;
      resultMap.set(key, current);
    });

    return Array.from(resultMap.values()).sort((left, right) => {
      const priorityDiff =
        EnginePriority.getEnginePriority(left.engine) -
        EnginePriority.getEnginePriority(right.engine);

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return String(left.status).localeCompare(String(right.status));
    });
  }

  static getMergedReferenceLinks(criterionIssues = []) {
    const seen = new Set();
    const links = [];

    criterionIssues.forEach((issue) => {
      (issue.referenceLinks || []).forEach((link) => {
        if (!link?.url || seen.has(link.url)) {
          return;
        }

        seen.add(link.url);
        links.push(link);
      });
    });

    return links;
  }

  static getIssueDedupeKey(issue, decision) {
    const status = decision?.status || EnginePriority.normalizeStatus(issue.status);
    const pageUrl = issue.pageUrl || "";

    if (status === "Pass") {
      return [issue.criterion, pageUrl, status].join("::");
    }

    return [
      issue.criterion,
      pageUrl,
      status,
      EnginePriority.getElementKey(issue),
    ].join("::");
  }

  static getElementKey(issue = {}) {
    const elements = issue.elements || [];

    if (elements.length === 0) {
      return "document";
    }

    return (
      elements
        .map((element) =>
          [
            element.pageUrl || issue.pageUrl || "",
            element.selector || "",
            element.xpath || "",
            element.html || "",
            element.elementName || "",
          ]
            .filter(Boolean)
            .join("|"),
        )
        .filter(Boolean)
        .join("||") || "document"
    );
  }

  static chooseRepresentative(existing, candidate) {
    const existingHasElements = (existing.elements || []).length > 0;
    const candidateHasElements = (candidate.elements || []).length > 0;

    if (candidateHasElements && !existingHasElements) {
      return candidate;
    }

    if (existingHasElements && !candidateHasElements) {
      return existing;
    }

    if (
      EnginePriority.getEnginePriority(candidate.engine) <
      EnginePriority.getEnginePriority(existing.engine)
    ) {
      return candidate;
    }

    return existing;
  }

  static applyToIssues(issues = []) {
    const groups = new Map();
    const passthrough = [];

    issues.forEach((issue) => {
      if (!issue?.criterion || IGNORED_TYPES.has(issue.type)) {
        passthrough.push(issue);
        return;
      }

      if (!groups.has(issue.criterion)) {
        groups.set(issue.criterion, []);
      }

      groups.get(issue.criterion).push(issue);
    });

    const result = [...passthrough];

    groups.forEach((criterionIssues) => {
      const decision = EnginePriority.pickCriterionDecision(criterionIssues);
      const decisionStatuses = EnginePriority.getDecisionStatuses(decision);
      const engineResults = EnginePriority.getEngineResults(criterionIssues);
      const referenceLinks = EnginePriority.getMergedReferenceLinks(criterionIssues);
      const activeIssues = criterionIssues.filter((issue) =>
        decisionStatuses.has(EnginePriority.getRawStatus(issue)),
      );
      const candidates = activeIssues.length > 0 ? activeIssues : criterionIssues;
      const representatives = new Map();

      candidates.forEach((issue) => {
        const rawStatus = issue.rawStatus || issue.status;
        const annotated = {
          ...issue,
          enginePriority: EnginePriority.getEnginePriority(issue.engine),
          rawStatus,
          status: decision.status,
          finalStatus: decision.status,
          decisionEngine: decision.engine || issue.engine || null,
          suppressedByPriority: false,
          suppressedByEngine: undefined,
          engineResults,
          referenceLinks,
          mergedIssueIds: criterionIssues.map((item) => item.issueId).filter(Boolean),
          elements: (issue.elements || []).map((element) => ({
            ...element,
            rawStatus: element.rawStatus || element.status || rawStatus,
            status: decision.status,
          })),
        };
        const key = EnginePriority.getIssueDedupeKey(annotated, decision);
        const existing = representatives.get(key);

        representatives.set(
          key,
          existing
            ? EnginePriority.chooseRepresentative(existing, annotated)
            : annotated,
        );
      });

      representatives.forEach((issue) => {
        result.push({
          ...issue,
          redundantEntryCount: Math.max(
            criterionIssues.length - representatives.size,
            0,
          ),
        });
      });
    });

    return result;
  }

  static deriveCriterionState(criterionIssues = []) {
    return EnginePriority.pickCriterionDecision(criterionIssues).status;
  }
}

module.exports = EnginePriority;
