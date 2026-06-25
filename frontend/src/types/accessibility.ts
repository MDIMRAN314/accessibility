export type RequestType = "Web" | "Mobile" | "PDF";

export type TaskType =
  | "Guidelines Check"
  | "Transcription Comparison"
  | "Generate Screen Reader Transcription";

export type ScreenReader = "JAWS";

export type ComplianceType = "WCAG Standards" | "Country Regulations";

export type WcagVersion = "2.0" | "2.1" | "2.2";

export type ConformanceLevel = "A" | "AA" | "AAA";

export type PdfStandard =
  | "PDF/UA (ISO 14289)"
  | "WCAG 2.0"
  | "WCAG 2.1"
  | "WCAG 2.2";

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
  | "Links/Buttons"
  | "ARIA"
  | "Color Contrast"
  | "Colour Contrast"
  | "Responsive"
  | "Hidden Content"
  | "Language"
  | "Tagged Content"
  | "Primary Language"
  | "Bookmarks"
  | "Tables"
  | "Lists"
  | "Title"
  | "Reading Order"
  | "Decorative Elements"
  | "Best Practice"
  | "Best Practices";

export type CountryRegulation =
  | "United States - ADA / Section 508"
  | "United Kingdom - Equality Act / PSBAR 2018"
  | "European Union - EAA / EN 301 549"
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
  screenReader?: ScreenReader;
  complianceType: ComplianceType;
  wcagVersion: WcagVersion;
  countryRegulation?: CountryRegulation;
  conformanceLevel: ConformanceLevel;
  pdfStandard?: PdfStandard;
  passCriteriaPercentage?: number;
  pdfMaxFailures?: number;
  checkPoints: CheckPoint[];
  guidelines: SelectedGuideline[];
  successCriteriaWeightage: Record<string, number>;
  sourceFileName?: string;
  sourceFileSize?: number;
  sourceFileMimeType?: string;
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
  referenceLinks?: ReferenceLink[];
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

export interface ReferenceLink {
  label: string;
  url: string;
  source?: string;
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
  unassessedWeightTotal?: number;
  normalizationWeightTotal?: number;
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

export interface TranscriptionSection {
  checkpoint: CheckPoint | string;
  lines: string[];
}

export interface ScreenReaderTranscription {
  screenReader: ScreenReader;
  mode?: "actual-jaws-demo" | "semantic-fallback" | string;
  url: string;
  pageTitle: string;
  generatedAt: string;
  selectedCheckPoints: CheckPoint[];
  actualContent: string;
  sections: TranscriptionSection[];
  stats: {
    characters: number;
    lines: number;
    words: number;
  };
  notes?: string[];
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

export interface PdfValidationCheck {
  ruleId?: string;
  clause?: string;
  testNumber?: string;
  description: string;
  status?: string;
  context?: string;
  criterion?: string;
  checkpoint?: CheckPoint | string;
}

export interface PdfValidationSummary {
  standard: PdfStandard | string;
  tool: "veraPDF";
  toolAvailable: boolean;
  toolVersion?: string;
  isCompliant?: boolean | null;
  error?: string;
  failedChecks: PdfValidationCheck[];
  passedRules?: number;
  failedRules?: number;
  rawSummary?: unknown;
}

export interface VeraPdfStatus {
  available: boolean;
  command: string;
  downloadUrl: string;
  installUrl: string;
  version?: string;
  error?: string;
  message: string;
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
  scannedPages?: ScannedPage[];
  generationTime: number;
  reportSize: number;
  accessibilityScore: number;
  requestDetails?: AccessibilityRequestPayload;
  transcription?: ScreenReaderTranscription;
  pdfValidation?: PdfValidationSummary;
  summary: ReportSummary;
  issueSeverityCount: IssueSeverityCount;
  scoreBreakdown?: ScoreBreakdown;
  issues: AccessibilityIssue[];
  principles: ReportPrinciple[];
  createdAt: string;
  updatedAt: string;
}

export interface ScoreHistoryResponse {
  success: boolean;
  reportId: string;
  requestId: string;
  scoreHistory: ScoreHistoryEntry[];
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
