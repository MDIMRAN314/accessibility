import {
  getIssuesForTab,
  getSeverityCounts,
  formatBytes,
  formatDuration,
  isBestPracticeConfigured,
} from "@/utils/reportModel";
import { getCountryRegulationDisplayName } from "@/data/accessibilityConfig";
import type {
  AccessibilityReport,
  ReportIssueTab,
  ReportViewMode,
  Severity,
} from "@/types/accessibility";
import styles from "@styles/ReportView.module.scss";

interface ReportSummaryProps {
  onOpenRequestDetails: () => void;
  onNavigate: (
    mode: ReportViewMode,
    tab?: ReportIssueTab,
    severity?: Severity | "All",
  ) => void;
  report: AccessibilityReport;
}

function ReportSummary({
  onNavigate,
  onOpenRequestDetails,
  report,
}: ReportSummaryProps): JSX.Element {
  const allIssues = getIssuesForTab(report.issues, "all");
  const severityCounts = getSeverityCounts(allIssues);
  const configuredWeightTotal = report.scoreBreakdown?.configuredWeightTotal ?? 100;
  const scoredWeightTotal =
    report.scoreBreakdown?.scoredWeightTotal ?? configuredWeightTotal;
  const showBestPractices = isBestPracticeConfigured(report);
  const pagesScanned =
    report.crawlSummary?.pagesScanned ?? report.scannedPages?.length ?? 1;
  const pagesFailed = report.crawlSummary?.pagesFailed ?? 0;
  const automaticIssues = getIssuesForTab(report.issues, "automated").length;
  const semiAutomatedIssues = getIssuesForTab(report.issues, "semi-automated").length;
  const manualIssues = getIssuesForTab(report.issues, "manual").length;
  const maxIssueCount = Math.max(
    automaticIssues,
    semiAutomatedIssues,
    manualIssues,
    1,
  );
  const scoreTone =
    report.accessibilityScore >= 90
      ? "Low"
      : report.accessibilityScore >= 70
        ? "Medium"
        : "High";
  const complianceLabel =
    report.complianceType === "Country Regulations" && report.countryRegulation
      ? getCountryRegulationDisplayName(report.countryRegulation)
      : `WCAG ${report.wcagVersion} ${report.conformanceLevel}`;

  const issueCards: Array<{ label: string; tab: ReportIssueTab; value: number }> = [
    { label: "Total issues", tab: "all", value: allIssues.length },
    {
      label: "Automated",
      tab: "automated",
      value: getIssuesForTab(report.issues, "automated").length,
    },
    {
      label: "Semi-Automated",
      tab: "semi-automated",
      value: getIssuesForTab(report.issues, "semi-automated").length,
    },
    {
      label: "Manual Issues",
      tab: "manual",
      value: getIssuesForTab(report.issues, "manual").length,
    },
    {
      label: "Best Practices",
      tab: "best-practices",
      value: getIssuesForTab(report.issues, "best-practices").length,
    },
  ];

  const severityCards: Array<{ label: Severity; value: number }> = [
    { label: "Critical", value: severityCounts.critical },
    { label: "Serious", value: severityCounts.serious },
    { label: "Moderate", value: severityCounts.moderate },
    { label: "Minor", value: severityCounts.minor },
  ];

  return (
    <section className={styles.summaryDashboard}>
      <article className={styles.scorePanel}>
        <div className={styles.scoreMeterWrap}>
          <div
            className={styles.scoreMeter}
            style={{
              background: `conic-gradient(#167a7f ${report.accessibilityScore * 3.6}deg, #eef1f6 0deg)`,
            }}
          >
            <span>Score</span>
            <strong>{report.accessibilityScore}%</strong>
            <em>{scoreTone}</em>
          </div>
        </div>
        <p>
          This score is calculated from automatically assessed{" "}
          <button onClick={onOpenRequestDetails} type="button">
            Success criteria weightage
          </button>
          .
          {scoredWeightTotal !== configuredWeightTotal
            ? ` ${scoredWeightTotal}% of configured weight was scored; remaining criteria require manual validation.`
            : ""}
          {configuredWeightTotal !== 100
            ? ` Configured total ${configuredWeightTotal}% is normalized.`
            : ""}
        </p>
        <ul className={styles.scoreLegend}>
          <li><span className={styles.highRiskDot} /> Below 70 - High risk</li>
          <li><span className={styles.mediumRiskDot} /> 70-89 - Medium risk</li>
          <li><span className={styles.lowRiskDot} /> 90-100 - Low risk</li>
        </ul>
      </article>

      <article className={styles.issuePanel}>
        <header>
          <h3>Total Issues</h3>
          <strong>{allIssues.length}</strong>
        </header>
        <div className={styles.issueBars}>
          <IssueBar
            label="Automatic Issues"
            max={maxIssueCount}
            onClick={() => onNavigate("guidelines", "automated", "All")}
            value={automaticIssues}
          />
          <IssueBar
            label="Semi Automated Issues"
            max={maxIssueCount}
            onClick={() => onNavigate("guidelines", "semi-automated", "All")}
            value={semiAutomatedIssues}
          />
          <IssueBar
            label="Manual Issues"
            max={maxIssueCount}
            onClick={() => onNavigate("guidelines", "manual", "All")}
            value={manualIssues}
          />
        </div>

        <div className={styles.issueBreakdown}>
          {issueCards
            .filter((item) => item.tab !== "best-practices" || showBestPractices)
            .map((item) => (
              <button
                key={item.tab}
                onClick={() => onNavigate("guidelines", item.tab, "All")}
                type="button"
              >
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
        </div>

        <div className={styles.summarySeverityCards}>
          {severityCards.map((item) => (
            <button
              className={styles[`severity${item.label}`]}
              key={item.label}
              onClick={() => onNavigate("guidelines", "all", item.label)}
              type="button"
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </div>

        <p className={styles.disclaimer}>
          This report is based on {complianceLabel}; automated analysis is included and manual validation may still be required for full compliance.
        </p>
        <dl className={styles.summaryMeta}>
          <div><dt>Report Size</dt><dd>{formatBytes(report.reportSize)}</dd></div>
          <div><dt>Generation Time</dt><dd>{formatDuration(report.generationTime)}</dd></div>
          <div><dt>Scope</dt><dd>{report.scanScope ?? report.requestDetails?.scanScope ?? "Page"}</dd></div>
          <div>
            <dt>Pages</dt>
            <dd>{pagesScanned}{pagesFailed ? ` scanned, ${pagesFailed} failed` : ""}</dd>
          </div>
        </dl>
      </article>
    </section>
  );
}

function IssueBar({
  label,
  max,
  onClick,
  value,
}: {
  label: string;
  max: number;
  onClick: () => void;
  value: number;
}): JSX.Element {
  const width = `${Math.round((value / max) * 100)}%`;

  return (
    <button className={styles.issueBar} onClick={onClick} type="button">
      <span>{label}</span>
      <b><i style={{ width }} /></b>
      <strong>{value}</strong>
    </button>
  );
}

export default ReportSummary;
