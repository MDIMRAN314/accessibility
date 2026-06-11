export type RequestType = "Web" | "Mobile" | "PDF";

export type TaskType =
  | "Guidelines Check"
  | "Transcription Comparison"
  | "Generate Screen Reader Transcription";

export type ComplianceType = "WCAG Standards" | "Country Regulations";

export type WcagVersion = "2.0" | "2.1" | "2.2";

export type ConformanceLevel = "A" | "AA" | "AAA";

export type CheckPoint =
  | "All"
  | "Headings"
  | "Landmarks"
  | "Page Title"
  | "Tab Order"
  | "Focus Order"
  | "Skip Links"
  | "Forms"
  | "Images"
  | "Video/Audio"
  | "Link/Buttons"
  | "ARIA"
  | "Color Contrast"
  | "Hidden Content"
  | "Language"
  | "Best Practices";

export type CountryRegulation =
  | "US - ADA / Section 508"
  | "UK - Equality Act / PSBAR 2018"
  | "EU - EAA / EN 301 549"
  | "Canada - ACA / AODA"
  | "Australia - DDA"
  | "India - RPwD Act / IS 17802"
  | "Japan - JIS X 8341-3"
  | "Brazil - LBI / eMAG"
  | "Singapore - DSS"
  | "South Africa - PEPUDA";

export type PrincipleName =
  | "Perceivable"
  | "Operable"
  | "Understandable"
  | "Robust";

export type GuidelineId =
  | "1.1"
  | "1.2"
  | "1.3"
  | "1.4"
  | "2.1"
  | "2.2"
  | "2.3"
  | "2.4"
  | "2.5"
  | "3.1"
  | "3.2"
  | "3.3"
  | "4.1";

export type SelectedGuideline = "All" | GuidelineId;

export type IssueType =
  | "Automated"
  | "Semi-Automated"
  | "Manual"
  | "Best Practices";

export type Severity = "Critical" | "Serious" | "Moderate" | "Minor" | "None";

export type ReportStatus =
  | "Pass"
  | "Fail"
  | "Warning"
  | "NA"
  | "Manual Review"
  | "Approved Exception"
  | "Not an issue"
  | "Best Practice"
  | "Error"
  | "Suppressed";

export type ReportViewMode = "summary" | "guidelines" | "elements";

export type ScanScope = "Page" | "Site";

export type ReportIssueTab =
  | "all"
  | "automated"
  | "semi-automated"
  | "manual"
  | "best-practices";

export interface GuidelineConfig {
  id: GuidelineId;
  name: string;
  principle: PrincipleName;
  type: IssueType;
  checkPoints: CheckPoint[];
}

export interface SuccessCriterionConfig {
  id: string;
  name: string;
  level: ConformanceLevel | "Removed";
  guidelineId: GuidelineId;
  type: IssueType;
  howToTest?: string;
  automationJustification?: string;
  axeRuleIds?: string[];
}

export interface AccessibilityRequestPayload {
  requestName?: string;
  requestType: RequestType;
  url: string;
  taskType: TaskType;
  complianceType: ComplianceType;
  wcagVersion: WcagVersion;
  countryRegulation?: CountryRegulation;
  conformanceLevel: ConformanceLevel;
  checkPoints: CheckPoint[];
  guidelines: SelectedGuideline[];
  successCriteriaWeightage: Record<string, number>;
  scanScope: ScanScope;
  maxPages: number;
  maxDepth: number;
  autoScroll: boolean;
  includeSitemap: boolean;
}

export interface AccessibilityRequest extends AccessibilityRequestPayload {
  requestId: string;
  status: "Pending" | "Running" | "Completed" | "Failed";
  createdAt: string;
  updatedAt: string;
}

export interface ElementLocator {
  type: string;
  value: string;
}

export interface AccessibilityElement {
  elementId?: string;
  elementName: string;
  selector?: string;
  xpath?: string;
  html?: string;
  screenshot?: string | null;
  pageUrl?: string;
  pageTitle?: string;
  locators?: ElementLocator[];
  status?: ReportStatus;
  rawStatus?: ReportStatus;
}

export interface AccessibilityIssue {
  issueId: string;
  criterion: string;
  principle?: PrincipleName | string;
  guideline?: string;
  description: string;
  severity: Severity;
  status: ReportStatus;
  type: IssueType;
  elements: AccessibilityElement[];
  pageUrl?: string;
  pageTitle?: string;
  pageDepth?: number;
  suggestedFix?: string;
  howToTest?: string;
  automationJustification?: string;
  helpUrl?: string;
  engine?: "axe-core" | "ibm-equal-access" | "htmlcs" | string;
  enginePriority?: number;
  engineResults?: Array<{
    engine: string;
    status: ReportStatus | string;
    count: number;
  }>;
  mergedIssueIds?: string[];
  redundantEntryCount?: number;
  rawStatus?: ReportStatus;
  finalStatus?: ReportStatus;
  decisionEngine?: string | null;
  suppressedByPriority?: boolean;
  suppressedByEngine?: string;
  createdAt?: string;
}

export interface ReportCriterion {
  id: string;
  name: string;
  level: ConformanceLevel | "Removed";
  status?: ReportStatus;
  type: IssueType;
  issues?: AccessibilityIssue[];
}

export interface ReportGuideline {
  name: string;
  status?: ReportStatus;
  criteria: ReportCriterion[];
}

export interface ReportPrinciple {
  name: PrincipleName | string;
  status?: ReportStatus;
  guidelines: ReportGuideline[];
}

export interface ReportSummary {
  totalIssues: number;
  automatedIssues: number;
  semiAutomatedIssues: number;
  manualIssues: number;
  bestPractices: number;
  passCount: number;
  failCount: number;
  warningCount: number;
}

export interface IssueSeverityCount {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export interface GuidelineScoreBreakdown {
  guidelineId: GuidelineId;
  guidelineName: string;
  weight: number;
  scoredWeight?: number;
  assessedSuccessCriteria: number;
  passedSuccessCriteria: number;
  guidelineScore: number | null;
  complianceScore: number;
}

export interface ScoreBreakdown {
  configuredWeightTotal: number;
  scoredWeightTotal?: number;
  rawComplianceScore: number;
  normalizedScore: number;
  guidelines: GuidelineScoreBreakdown[];
}

export interface ScoreHistoryEntry {
  previousScore: number;
  updatedScore: number;
  updatedAt: string;
  reason: string;
}

export interface ScannedPage {
  url: string;
  depth: number;
  title?: string;
  status: "Scanned" | "Failed" | string;
  statusCode?: number | null;
  issueCount: number;
  error?: string | null;
}

export interface CrawlSummary {
  scanScope: ScanScope;
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  autoScroll: boolean;
  includeSitemap: boolean;
  pagesQueued: number;
  pagesScanned: number;
  pagesFailed: number;
  pagesSkipped: number;
}

export interface AccessibilityReport {
  reportId: string;
  requestId: string;
  requestName?: string;
  url: string;
  wcagVersion: WcagVersion;
  conformanceLevel: ConformanceLevel;
  complianceType: ComplianceType;
  countryRegulation?: CountryRegulation;
  scanScope?: ScanScope;
  scannedPages?: ScannedPage[];
  crawlSummary?: CrawlSummary;
  generationTime: number;
  reportSize: number;
  accessibilityScore: number;
  requestDetails?: AccessibilityRequestPayload;
  summary: ReportSummary;
  issueSeverityCount: IssueSeverityCount;
  scoreBreakdown?: ScoreBreakdown;
  scoreHistory?: ScoreHistoryEntry[];
  issues: AccessibilityIssue[];
  principles: ReportPrinciple[];
  createdAt: string;
  updatedAt: string;
}

export interface TabCount {
  key: ReportIssueTab;
  label: string;
  count: number;
}

export interface ElementIssueGroup {
  elementKey: string;
  element: AccessibilityElement;
  issues: AccessibilityIssue[];
}

export type DetailDrawerSubject =
  | { kind: "issue"; issueId: string }
  | { kind: "element"; elementKey: string };
