import { REPORT_TABS } from "@/data/accessibilityConfig";
import type {
  AccessibilityElement,
  AccessibilityIssue,
  AccessibilityReport,
  ElementIssueGroup,
  IssueSeverityCount,
  ReportIssueTab,
  ReportStatus,
  Severity,
  TabCount,
} from "@/types/accessibility";

const issueStatuses = new Set<ReportStatus>([
  "Fail",
  "Warning",
  "Manual Review",
  "Approved Exception",
  "Not an issue",
  "Best Practice",
  "Error",
]);

const statusOrder: ReportStatus[] = [
  "Fail",
  "Error",
  "Warning",
  "Manual Review",
  "Approved Exception",
  "Not an issue",
  "Best Practice",
  "Pass",
  "NA",
];

type StatusTarget = "issue" | "element" | "aggregate";

export const isReportableIssue = (issue: AccessibilityIssue): boolean =>
  issue.type === "Best Practices" || issueStatuses.has(issue.status);

export const getIssuesForTab = (
  issues: AccessibilityIssue[],
  tab: ReportIssueTab,
): AccessibilityIssue[] => {
  const reportable = issues.filter(isReportableIssue);
  const tabConfig = REPORT_TABS.find((item) => item.key === tab);

  if (!tabConfig?.type) {
    return reportable;
  }

  return reportable.filter((issue) => issue.type === tabConfig.type);
};

export const getTabCounts = (report: AccessibilityReport): TabCount[] =>
  REPORT_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    count: getIssuesForTab(report.issues, tab.key).length,
  }));

export const isBestPracticeConfigured = (report: AccessibilityReport): boolean => {
  const checkPoints = report.requestDetails?.checkPoints ?? [];

  if (checkPoints.includes("All") || checkPoints.includes("Best Practices")) {
    return true;
  }

  if (!report.requestDetails) {
    return report.summary.bestPractices > 0;
  }

  return false;
};

export const getVisibleTabCounts = (report: AccessibilityReport): TabCount[] =>
  getTabCounts(report).filter(
    (tab) => tab.key !== "best-practices" || isBestPracticeConfigured(report),
  );

export const getFilteredIssues = (
  report: AccessibilityReport,
  tab: ReportIssueTab,
  search: string,
  severity: Severity | "All",
): AccessibilityIssue[] => {
  const query = search.trim().toLowerCase();

  return getIssuesForTab(report.issues, tab).filter((issue) => {
    const severityMatches = severity === "All" || issue.severity === severity;
    const searchMatches =
      !query ||
      [
        issue.issueId,
        issue.criterion,
        issue.description,
        issue.guideline,
        issue.pageUrl,
        issue.suggestedFix,
        ...issue.elements.flatMap((element) => [
          element.elementName,
          element.pageUrl,
        ]),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));

    return severityMatches && searchMatches;
  });
};

export const getSeverityCounts = (
  issues: AccessibilityIssue[],
): IssueSeverityCount =>
  issues.reduce<IssueSeverityCount>(
    (counts, issue) => {
      if (issue.severity === "Critical") counts.critical += 1;
      if (issue.severity === "Serious") counts.serious += 1;
      if (issue.severity === "Moderate") counts.moderate += 1;
      if (issue.severity === "Minor") counts.minor += 1;
      return counts;
    },
    { critical: 0, serious: 0, moderate: 0, minor: 0 },
  );

export const getElementKey = (element: AccessibilityElement): string =>
  [element.pageUrl, element.selector || element.xpath || element.html || element.elementName]
    .filter(Boolean)
    .join("::");

export const getElementGroups = (
  issues: AccessibilityIssue[],
): ElementIssueGroup[] => {
  const groups = new Map<string, ElementIssueGroup>();

  issues.forEach((issue) => {
    issue.elements.forEach((element) => {
      const key = getElementKey(element);
      const existing = groups.get(key);

      if (existing) {
        existing.issues.push(issue);
        return;
      }

      groups.set(key, { elementKey: key, element, issues: [issue] });
    });
  });

  return Array.from(groups.values());
};

export const getIssueById = (
  report: AccessibilityReport,
  issueId: string,
): AccessibilityIssue | undefined => report.issues.find((issue) => issue.issueId === issueId);

export const getElementGroupByKey = (
  report: AccessibilityReport,
  elementKey: string,
): ElementIssueGroup | undefined =>
  getElementGroups(report.issues.filter(isReportableIssue)).find(
    (group) => group.elementKey === elementKey,
  );

export const deriveAggregateStatus = (
  issues: AccessibilityIssue[],
  fallback: ReportStatus = "NA",
): ReportStatus => {
  const statuses = getAggregateStatuses(issues);

  if (statuses.length === 0) {
    return fallback;
  }

  if (statuses.every((status) => status === "NA")) {
    return "NA";
  }

  if (statuses.some((status) => status === "Fail" || status === "Error")) {
    return "Fail";
  }

  if (statuses.some((status) => status === "Warning" || status === "Manual Review")) {
    return "Warning";
  }

  if (
    statuses.every((status) =>
      ["Pass", "Approved Exception", "Not an issue", "Best Practice"].includes(status),
    )
  ) {
    return "Pass";
  }

  return statusOrder.find((status) => statuses.includes(status)) ?? "Warning";
};

export const getAllowedStatuses = (
  status: ReportStatus,
  target: StatusTarget = "issue",
): ReportStatus[] => {
  if (target === "aggregate") {
    return [status];
  }

  if (["Pass", "Fail", "Warning", "NA", "Best Practice"].includes(status)) {
    return [status];
  }

  if (status === "Error") {
    return ["Error", "Approved Exception", "Not an issue"];
  }

  if (status === "Manual Review") {
    return ["Manual Review", "Not an issue", "Error", "Approved Exception"];
  }

  if (status === "Approved Exception") {
    return ["Approved Exception", "Error", "Manual Review"];
  }

  if (status === "Not an issue") {
    return ["Not an issue", "Error", "Manual Review"];
  }

  return [status];
};

export const isStatusEditable = (
  status: ReportStatus,
  target: StatusTarget = "issue",
): boolean => getAllowedStatuses(status, target).length > 1;

const getAggregateStatuses = (issues: AccessibilityIssue[]): ReportStatus[] =>
  issues
    .flatMap((issue) => [
      issue.status,
      ...issue.elements
        .map((element) => element.status)
        .filter((status): status is ReportStatus => Boolean(status)),
    ])
    .filter((status) => status !== "Suppressed");

export const getRequestName = (report: AccessibilityReport): string => {
  if (report.requestName?.trim()) {
    return report.requestName.trim();
  }

  if (report.requestDetails?.requestName?.trim()) {
    return report.requestDetails.requestName.trim();
  }

  try {
    const url = new URL(report.url);
    return url.hostname.replace(/^www\./, "") || report.requestId;
  } catch {
    return report.requestId;
  }
};

export const sanitizeFileName = (value: string): string =>
  value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "Accessibility";

export const getReportFileName = (report: AccessibilityReport): string =>
  `${sanitizeFileName(getRequestName(report))}Report.html`;

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 KB";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (milliseconds: number): string => {
  if (!Number.isFinite(milliseconds) || milliseconds < 1000) {
    return `${Math.max(milliseconds, 0)} ms`;
  }

  return `${(milliseconds / 1000).toFixed(2)} s`;
};

export const severityClassName = (severity: Severity): string =>
  severity.toLowerCase().replace(/\s+/g, "-");
