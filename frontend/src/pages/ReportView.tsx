import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import ElementView from "@/components/ElementView";
import GuidelineView from "@/components/GuidelineView";
import ReportSummary from "@/components/ReportSummary";
import {
  getCountryRegulationDisplayName,
  normalizeCountryRegulation,
} from "@/data/accessibilityConfig";
import { accessibilityService, getApiErrorMessage } from "@/services/api";
import type {
  AccessibilityElement,
  AccessibilityIssue,
  AccessibilityReport,
  CountryRegulation,
  DetailDrawerSubject,
  ReferenceLink,
  ReportIssueTab,
  ReportStatus,
  ReportViewMode,
  Severity,
} from "@/types/accessibility";
import {
  formatBytes,
  formatDuration,
  getElementGroupByKey,
  getElementGroups,
  getElementKey,
  getFilteredIssues,
  getIssueById,
  getReportFileName,
  getRequestName,
  getVisibleTabCounts,
} from "@/utils/reportModel";
import styles from "@styles/ReportView.module.scss";

type IssueActionSubject = { mode: "bug" | "suggestion"; issueId: string };

function ReportView(): JSX.Element {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<AccessibilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ReportViewMode>("summary");
  const [activeIssueTab, setActiveIssueTab] = useState<ReportIssueTab>("all");
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "All">("All");
  const [requestDrawerOpen, setRequestDrawerOpen] = useState(false);
  const [detailSubject, setDetailSubject] = useState<DetailDrawerSubject | null>(null);
  const [issueActionSubject, setIssueActionSubject] = useState<IssueActionSubject | null>(null);
  const [debugElementKey, setDebugElementKey] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const loadReport = async () => {
      if (!reportId) {
        setError("Report not found.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await accessibilityService.getReport(reportId);
        setReport(response.data);
      } catch (reportError) {
        setError(getApiErrorMessage(reportError, "Failed to load report."));
      } finally {
        setLoading(false);
      }
    };

    void loadReport();
  }, [reportId]);

  const tabCounts = useMemo(() => (report ? getVisibleTabCounts(report) : []), [report]);

  const filteredIssues = useMemo(
    () =>
      report
        ? getFilteredIssues(report, activeIssueTab, search, severityFilter)
        : [],
    [activeIssueTab, report, search, severityFilter],
  );

  const elementGroups = useMemo(
    () => getElementGroups(filteredIssues),
    [filteredIssues],
  );

  const openDetail = (subject: DetailDrawerSubject) => {
    setDetailSubject(subject);
  };

  const navigateSummary = (
    mode: ReportViewMode,
    tab: ReportIssueTab = activeIssueTab,
    severity: Severity | "All" = severityFilter,
  ) => {
    setActiveView(mode);
    setActiveIssueTab(tab);
    setSeverityFilter(severity);
  };

  const handleDownloadReport = async () => {
    if (!report) {
      return;
    }

    try {
      const response = await accessibilityService.downloadReport(report.reportId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      const disposition = response.headers["content-disposition"];
      const fileNameFromHeader = getFileNameFromDisposition(disposition);
      link.href = url;
      link.setAttribute("download", fileNameFromHeader || getReportFileName(report));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(getApiErrorMessage(downloadError, "Failed to download report."));
    }
  };

  const handleIssueStatusChange = (issueId: string, status: ReportStatus) => {
    if (!report) {
      return;
    }

    setReport((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((issue) =>
              issue.issueId === issueId
                ? {
                    ...issue,
                    status,
                    elements: issue.elements.map((element) => ({ ...element, status })),
                  }
                : issue,
            ),
          }
        : current,
    );

    void accessibilityService
      .updateIssueStatus(report.reportId, issueId, status)
      .then((response) => {
        if (response.data.report) {
          setReport(response.data.report);
        }
      })
      .catch((statusError) => {
        setError(getApiErrorMessage(statusError, "Failed to update issue status."));
      });
  };

  const handleElementStatusChange = (elementKey: string, status: ReportStatus) => {
    if (!report) {
      return;
    }

    setReport((current) =>
      current
        ? {
            ...current,
            issues: current.issues.map((issue) => ({
              ...issue,
              elements: issue.elements.map((element) =>
                getElementKey(element) === elementKey ? { ...element, status } : element,
              ),
            })),
          }
        : current,
    );

    void accessibilityService
      .updateElementStatus(report.reportId, elementKey, status)
      .then((response) => {
        if (response.data.report) {
          setReport(response.data.report);
        }
      })
      .catch((statusError) => {
        setError(getApiErrorMessage(statusError, "Failed to update element status."));
      });
  };

  const openSourceDebugger = (elementKey: string) => {
    setDetailSubject(null);
    setDebugElementKey(elementKey);
  };

  if (loading) {
    return <div className={styles.stateMessage}>Loading report...</div>;
  }

  if (error && !report) {
    return <div className={styles.errorBanner}>{error}</div>;
  }

  if (!report) {
    return <div className={styles.errorBanner}>Report not found.</div>;
  }

  return (
    <section className={`${styles.reportPage} ${maximized ? styles.maximized : ""}`}>
      <header className={styles.reportHeader}>
        <div>
          <p>Accessibility report</p>
          <h2>{report.url}</h2>
          <span className={styles.requestName}>{getRequestName(report)}</span>
        </div>
        <div className={styles.reportActions}>
          <Metric label="Report Size" value={formatBytes(report.reportSize)} />
          <Metric
            breakdown={[
              ["Page load", report.generationTime * 0.35],
              ["Accessibility scan", report.generationTime * 0.45],
              ["Result mapping", report.generationTime * 0.12],
              ["Report assembly", report.generationTime * 0.08],
            ]}
            label="Generation Time"
            value={formatDuration(report.generationTime)}
          />
          <Metric label="Score" value={`${report.accessibilityScore}%`} />
          <Metric
            label="Pages"
            title={`${report.crawlSummary?.pagesFailed ?? 0} failed, ${report.crawlSummary?.pagesSkipped ?? 0} skipped`}
            value={`${report.crawlSummary?.pagesScanned ?? report.scannedPages?.length ?? 1}`}
          />
          <button onClick={() => setRequestDrawerOpen(true)} title="Request Details" type="button">
            Details
          </button>
          <button onClick={() => void handleDownloadReport()} title="Download Report" type="button">
            Download
          </button>
          <button
            onClick={() => setMaximized((current) => !current)}
            title="Expand"
            type="button"
          >
            {maximized ? "Restore" : "Expand"}
          </button>
        </div>
      </header>

      {error ? <div className={styles.inlineError}>{error}</div> : null}

      <nav className={styles.primaryTabs} aria-label="Report sections">
        {[
          ["summary", "Summary"],
          ["guidelines", "Guideline View"],
          ["elements", "Element View"],
        ].map(([key, label]) => (
          <button
            className={activeView === key ? styles.active : ""}
            key={key}
            onClick={() => setActiveView(key as ReportViewMode)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {activeView !== "summary" ? (
        <div className={styles.viewToolbar}>
          <div className={styles.issueTabs} role="tablist" aria-label="Issue type">
            {tabCounts
              .map((tab) => (
                <button
                  aria-selected={activeIssueTab === tab.key}
                  className={activeIssueTab === tab.key ? styles.active : ""}
                  key={tab.key}
                  onClick={() => setActiveIssueTab(tab.key)}
                  role="tab"
                  type="button"
                >
                  {tab.label} <span>{tab.count}</span>
                </button>
              ))}
          </div>

          <div className={styles.filters}>
            <input
              aria-label="Search report"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              type="search"
              value={search}
            />
            <select
              aria-label="Severity filter"
              onChange={(event) => setSeverityFilter(event.target.value as Severity | "All")}
              value={severityFilter}
            >
              <option value="All">All severities</option>
              <option value="Critical">Critical</option>
              <option value="Serious">Serious</option>
              <option value="Moderate">Moderate</option>
              <option value="Minor">Minor</option>
            </select>
          </div>
        </div>
      ) : null}

      <div className={styles.reportContent}>
        {activeView === "summary" ? (
          <ReportSummary
            onNavigate={navigateSummary}
            onOpenRequestDetails={() => setRequestDrawerOpen(true)}
            report={report}
          />
        ) : null}

        {activeView === "guidelines" ? (
          <GuidelineView
            activeTab={activeIssueTab}
            onCreateIssue={(issueId) => setIssueActionSubject({ mode: "bug", issueId })}
            onElementStatusChange={handleElementStatusChange}
            onLocateElement={openSourceDebugger}
            onOpenDetail={openDetail}
            onOpenSuggestion={(issueId) =>
              setIssueActionSubject({ mode: "suggestion", issueId })
            }
            onStatusChange={handleIssueStatusChange}
            report={report}
            search={search}
            severityFilter={severityFilter}
          />
        ) : null}

        {activeView === "elements" ? (
          <ElementView
            activeTab={activeIssueTab}
            onElementStatusChange={handleElementStatusChange}
            onLocateElement={openSourceDebugger}
            onOpenDetail={openDetail}
            onStatusChange={handleIssueStatusChange}
            report={report}
            search={search}
            severityFilter={severityFilter}
          />
        ) : null}
      </div>

      {requestDrawerOpen ? (
        <RequestDetailsDrawer
          onClose={() => setRequestDrawerOpen(false)}
          report={report}
        />
      ) : null}

      {detailSubject ? (
        <DetailDrawer
          elementGroups={elementGroups}
          issues={filteredIssues}
          onClose={() => setDetailSubject(null)}
          onLocateElement={openSourceDebugger}
          onOpen={openDetail}
          report={report}
          subject={detailSubject}
        />
      ) : null}

      {issueActionSubject ? (
        <IssueActionDrawer
          issue={getIssueById(report, issueActionSubject.issueId)}
          mode={issueActionSubject.mode}
          onClose={() => setIssueActionSubject(null)}
        />
      ) : null}

      {debugElementKey ? (
        <SourceDebugger
          elementGroup={getElementGroupByKey(report, debugElementKey)}
          onClose={() => setDebugElementKey(null)}
          onSwitchToReport={() => {
            setDebugElementKey(null);
            setActiveView("elements");
            openDetail({ kind: "element", elementKey: debugElementKey });
          }}
          report={report}
        />
      ) : null}
    </section>
  );
}

function Metric({
  breakdown,
  label,
  title,
  value,
}: {
  breakdown?: Array<[string, number]>;
  label: string;
  title?: string;
  value: string;
}): JSX.Element {
  return (
    <span className={styles.metric} title={title}>
      <small>{label}</small>
      <strong>{value}</strong>
      {breakdown ? (
        <span className={styles.metricPopover} role="tooltip">
          {breakdown.map(([name, duration]) => (
            <span key={name}>
              <em>{name}</em>
              <b>{formatDuration(Math.round(duration))}</b>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

interface RequestDetailsDrawerProps {
  onClose: () => void;
  report: AccessibilityReport;
}

function RequestDetailsDrawer({ onClose, report }: RequestDetailsDrawerProps): JSX.Element {
  const details = report.requestDetails;

  return (
    <aside className={styles.drawer} aria-label="Request details">
      <header>
        <h3>Request Details</h3>
        <button onClick={onClose} type="button" aria-label="Close">
          x
        </button>
      </header>
      <dl className={styles.detailList}>
        <div>
          <dt>Request Name</dt>
          <dd>{getRequestName(report)}</dd>
        </div>
        <div>
          <dt>URL</dt>
          <dd>{report.url}</dd>
        </div>
        <div>
          <dt>Compliance</dt>
          <dd>
            {report.complianceType === "WCAG Standards"
              ? `WCAG ${report.wcagVersion} ${report.conformanceLevel}`
              : getCountryRegulationDisplayName(report.countryRegulation)}
          </dd>
        </div>
        <div>
          <dt>Request Type</dt>
          <dd>{details?.requestType ?? "Web"}</dd>
        </div>
        <div>
          <dt>Scan Scope</dt>
          <dd>{details?.scanScope ?? report.scanScope ?? "Page"}</dd>
        </div>
        <div>
          <dt>Max Pages</dt>
          <dd>{details?.maxPages ?? report.crawlSummary?.maxPages ?? 1}</dd>
        </div>
        <div>
          <dt>Max Depth</dt>
          <dd>{details?.maxDepth ?? report.crawlSummary?.maxDepth ?? 0}</dd>
        </div>
        <div>
          <dt>Check Points</dt>
          <dd>{details?.checkPoints?.join(", ") ?? "All"}</dd>
        </div>
        <div>
          <dt>Guidelines</dt>
          <dd>{details?.guidelines?.join(", ") ?? "All"}</dd>
        </div>
      </dl>
      {details?.successCriteriaWeightage ? (
        <section className={styles.weightageDetails}>
          <h4>Success Criteria Weightage</h4>
          <dl className={styles.detailList}>
            {Object.entries(details.successCriteriaWeightage).map(([guidelineId, weight]) => (
              <div key={guidelineId}>
                <dt>{guidelineId}</dt>
                <dd>{weight}%</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {report.scannedPages?.length ? (
        <section className={styles.weightageDetails}>
          <h4>Scanned Pages</h4>
          <dl className={styles.detailList}>
            {report.scannedPages.map((page) => (
              <div key={page.url}>
                <dt>{page.status}</dt>
                <dd>{page.url}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </aside>
  );
}

interface DetailDrawerProps {
  elementGroups: ReturnType<typeof getElementGroups>;
  issues: AccessibilityIssue[];
  onClose: () => void;
  onLocateElement: (elementKey: string) => void;
  onOpen: (subject: DetailDrawerSubject) => void;
  report: AccessibilityReport;
  subject: DetailDrawerSubject;
}

function DetailDrawer({
  elementGroups,
  issues,
  onClose,
  onLocateElement,
  onOpen,
  report,
  subject,
}: DetailDrawerProps): JSX.Element {
  const issue =
    subject.kind === "issue" ? getIssueById(report, subject.issueId) : undefined;
  const elementGroup =
    subject.kind === "element"
      ? getElementGroupByKey(report, subject.elementKey)
      : undefined;
  const activeElement = issue?.elements[0] ?? elementGroup?.element;
  const relatedIssues = issue ? [issue] : elementGroup?.issues ?? [];
  const primaryIssue = issue ?? relatedIssues[0];
  const issueIndex = issue
    ? issues.findIndex((candidate) => candidate.issueId === issue.issueId)
    : -1;
  const elementIndex = elementGroup
    ? elementGroups.findIndex((candidate) => candidate.elementKey === elementGroup.elementKey)
    : -1;

  const previousIssue = issueIndex > 0 ? issues[issueIndex - 1] : undefined;
  const nextIssue = issueIndex >= 0 ? issues[issueIndex + 1] : undefined;
  const previousElement =
    elementIndex > 0 ? elementGroups[elementIndex - 1] : undefined;
  const nextElement = elementIndex >= 0 ? elementGroups[elementIndex + 1] : undefined;
  const referenceLinks = getIssueReferenceLinks(primaryIssue, report);

  return (
    <>
      <button className={styles.switchReportButton} onClick={onClose} type="button">
        Switch to Report
      </button>
      <aside className={`${styles.drawer} ${styles.detailDrawer}`} aria-label="Element details">
        <header>
          <div>
            <p>Element name</p>
            <h3>{activeElement?.elementName || elementGroup?.element.elementName || "Element details"}</h3>
          </div>
          <button onClick={onClose} type="button" aria-label="Close">
            x
          </button>
        </header>

        <section className={styles.detailIntro}>
          <article>
            <h4>Issue :</h4>
            <p>{primaryIssue?.description || "Review the affected element."}</p>
          </article>
          <article>
            <h4>Suggestion To Fix :</h4>
            <p>{primaryIssue?.suggestedFix || "Review the failed accessibility condition and update the markup or styling."}</p>
          </article>
          <article>
            <h4>Page :</h4>
            <p>{primaryIssue?.pageUrl ?? activeElement?.pageUrl ?? report.url}</p>
          </article>
        </section>

        <section className={styles.detailSection}>
          <h4>Image</h4>
          <ElementImagePanel activeElement={activeElement} />
        </section>

        <section className={styles.detailSection}>
          <h4>Locators</h4>
          <LocatorTable activeElement={activeElement} />
        </section>

        <section className={styles.detailSection}>
          <h4>DOM</h4>
          <DomPanel activeElement={activeElement} />
        </section>

        {primaryIssue?.howToTest || primaryIssue?.automationJustification ? (
          <section className={styles.guidancePanel}>
            {primaryIssue.howToTest ? (
              <article>
                <h4>How to Test</h4>
                <p>{primaryIssue.howToTest}</p>
              </article>
            ) : null}
            {primaryIssue.automationJustification ? (
              <article>
                <h4>Automation Feasibility</h4>
                <p>{primaryIssue.automationJustification}</p>
              </article>
            ) : null}
          </section>
        ) : null}

        {referenceLinks.length > 0 ? (
          <section className={styles.referencePanel}>
            <h4>References</h4>
            <div>
              {referenceLinks.map((link) => (
                <a href={link.url} key={`${link.source}-${link.url}`} rel="noreferrer" target="_blank">
                  <span>{link.label}</span>
                  {link.source ? <small>{link.source}</small> : null}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {activeElement ? (
          <button
            className={styles.openDomButton}
            onClick={() => onLocateElement(getElementKey(activeElement))}
            type="button"
          >
            Open Highlighted DOM View
          </button>
        ) : null}

        {relatedIssues.length > 0 ? (
          <div className={styles.relatedElements}>
            <h4>Related Issues</h4>
            {relatedIssues.map((relatedIssue) => (
              <article className={styles.relatedIssue} key={relatedIssue.issueId}>
                <strong>{relatedIssue.criterion}</strong>
                <span>{relatedIssue.description}</span>
                <small>{relatedIssue.severity} - {relatedIssue.status}</small>
              </article>
            ))}
          </div>
        ) : null}

        <footer>
          {subject.kind === "issue" ? (
            <>
              <button
                disabled={!previousIssue}
                onClick={() =>
                  previousIssue ? onOpen({ kind: "issue", issueId: previousIssue.issueId }) : undefined
                }
                type="button"
              >
                Previous Issue
              </button>
              <button
                disabled={!nextIssue}
                onClick={() =>
                  nextIssue ? onOpen({ kind: "issue", issueId: nextIssue.issueId }) : undefined
                }
                type="button"
              >
                Next Issue
              </button>
            </>
          ) : (
            <>
              <button
                disabled={!previousElement}
                onClick={() =>
                  previousElement
                    ? onOpen({ kind: "element", elementKey: previousElement.elementKey })
                    : undefined
                }
                type="button"
              >
                Previous Element
              </button>
              <button
                disabled={!nextElement}
                onClick={() =>
                  nextElement
                    ? onOpen({ kind: "element", elementKey: nextElement.elementKey })
                    : undefined
                }
                type="button"
              >
                Next Element
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  );
}

function ElementImagePanel({
  activeElement,
}: {
  activeElement?: AccessibilityElement;
}): JSX.Element {
  if (!activeElement) {
    return <div className={styles.emptyReport}>No element details found.</div>;
  }

  return (
    <div className={`${styles.detailPanel} ${styles.imageDetailPanel}`}>
      {activeElement.screenshot ? (
        <img alt={activeElement.elementName} src={activeElement.screenshot} />
      ) : (
        <div className={styles.noImage}>No highlighted image found</div>
      )}
    </div>
  );
}

function LocatorTable({
  activeElement,
}: {
  activeElement?: AccessibilityElement;
}): JSX.Element {
  if (!activeElement || (activeElement.locators ?? []).length === 0) {
    return <div className={styles.emptyReport}>No locators found.</div>;
  }

  return (
    <div className={styles.locatorTable}>
      <div>
        <strong>Locator Type</strong>
        <strong>Locator Value</strong>
      </div>
      {activeElement.locators?.map((locator) => (
        <div key={`${locator.type}-${locator.value}`}>
          <span>{locator.type}</span>
          <code>{locator.value}</code>
        </div>
      ))}
    </div>
  );
}

function DomPanel({
  activeElement,
}: {
  activeElement?: AccessibilityElement;
}): JSX.Element {
  return (
    <div className={`${styles.detailPanel} ${styles.domDetailPanel}`}>
      <pre>{activeElement?.html || "No DOM snippet found."}</pre>
    </div>
  );
}

function IssueActionDrawer({
  issue,
  mode,
  onClose,
}: {
  issue?: AccessibilityIssue;
  mode: IssueActionSubject["mode"];
  onClose: () => void;
}): JSX.Element {
  const [created, setCreated] = useState(false);

  if (!issue) {
    return (
      <aside className={styles.drawer} aria-label="Issue action">
        <header>
          <h3>Issue not found</h3>
          <button onClick={onClose} type="button" aria-label="Close">
            x
          </button>
        </header>
      </aside>
    );
  }

  const bugTitle = `${issue.criterion} - ${issue.description}`;
  const bugDescription = [
    `Severity: ${issue.severity}`,
    `Status: ${issue.status}`,
    `Type: ${issue.type}`,
    "",
    "Suggestion:",
    issue.suggestedFix || "Review the failed accessibility condition.",
    "",
    "Failed elements:",
    ...issue.elements.map(
      (element, index) =>
        `${index + 1}. ${element.elementName || element.selector || "Unnamed element"} - ${
          element.selector || element.xpath || "No locator"
        }`,
    ),
  ].join("\n");
  const referenceLinks = getIssueReferenceLinks(issue);

  return (
    <aside className={styles.drawer} aria-label={mode === "bug" ? "Create Issue" : "Suggestion to Fix"}>
      <header>
        <div>
          <h3>{mode === "bug" ? "Create Issue" : "Suggestion to Fix"}</h3>
          <p>{issue.criterion} {issue.severity}</p>
        </div>
        <button onClick={onClose} type="button" aria-label="Close">
          x
        </button>
      </header>

      {mode === "bug" ? (
        <div className={styles.issueDraft}>
          <label>
            <span>Title</span>
            <input readOnly value={bugTitle} />
          </label>
          <label>
            <span>Description</span>
            <textarea readOnly rows={12} value={bugDescription} />
          </label>
          {created ? (
            <p className={styles.successMessage}>Issue draft is ready for handoff.</p>
          ) : null}
          <button onClick={() => setCreated(true)} type="button">
            Create Issue
          </button>
        </div>
      ) : (
        <div className={styles.suggestionPanel}>
          <article>
            <h4>Recommended Fix</h4>
            <p>{issue.suggestedFix || "Review the affected markup and apply the WCAG recommendation."}</p>
          </article>
          {issue.howToTest ? (
            <article>
              <h4>How to Validate</h4>
              <p>{issue.howToTest}</p>
            </article>
          ) : null}
          {referenceLinks.length > 0 ? (
            <article>
              <h4>References</h4>
              <div className={styles.referenceList}>
                {referenceLinks.map((link) => (
                  <a href={link.url} key={`${link.source}-${link.url}`} rel="noreferrer" target="_blank">
                    <span>{link.label}</span>
                    {link.source ? <small>{link.source}</small> : null}
                  </a>
                ))}
              </div>
            </article>
          ) : null}
        </div>
      )}
    </aside>
  );
}

function SourceDebugger({
  elementGroup,
  onClose,
  onSwitchToReport,
  report,
}: {
  elementGroup?: ReturnType<typeof getElementGroupByKey>;
  onClose: () => void;
  onSwitchToReport: () => void;
  report: AccessibilityReport;
}): JSX.Element {
  const element = elementGroup?.element;
  const sourceUrl = element?.pageUrl || report.url;
  const issues = elementGroup?.issues ?? [];

  return (
    <section className={styles.debuggerOverlay} aria-label="Source debugger">
      <header>
        <div>
          <p>Highlighted source view</p>
          <h3>{sourceUrl}</h3>
        </div>
        <div>
          <button onClick={onSwitchToReport} type="button">
            Switch to Report
          </button>
          <button onClick={onClose} type="button" aria-label="Close">
            x
          </button>
        </div>
      </header>

      <div className={styles.debuggerLayout}>
        <section className={styles.sourcePane}>
          <div className={styles.sourceToolbar}>
            <span>{sourceUrl}</span>
            <button onClick={onSwitchToReport} type="button">Switch to Report</button>
          </div>
          <div className={styles.highlightedPreview}>
            {element?.screenshot ? (
              <img alt={element.elementName} src={element.screenshot} />
            ) : (
              <iframe sandbox="allow-forms allow-same-origin allow-scripts" src={sourceUrl} title="Application source" />
            )}
          </div>
          <div className={styles.domConsole}>
            <header>
              <span>Elements</span>
              <span>DOM</span>
            </header>
            <pre>{element?.html || "No DOM snippet found."}</pre>
          </div>
        </section>

        <aside className={styles.debuggerInspector}>
          <h4>Report Section</h4>
          {issues.length > 0 ? (
            <div className={styles.sourceIssueList}>
              {issues.map((issue) => (
                <article key={issue.issueId}>
                  <strong>{issue.criterion}</strong>
                  <span>{issue.description}</span>
                  <small>{issue.severity} - {issue.status}</small>
                </article>
              ))}
            </div>
          ) : (
            <p>No linked report issue found.</p>
          )}
          <h4>Element Details</h4>
          <dl className={styles.detailList}>
            <div>
              <dt>Name</dt>
              <dd>{element?.elementName || "Unnamed element"}</dd>
            </div>
            <div>
              <dt>Selector</dt>
              <dd>{element?.selector || "No CSS selector"}</dd>
            </div>
            <div>
              <dt>XPath</dt>
              <dd>{element?.xpath || "No XPath"}</dd>
            </div>
          </dl>
          <h4>Suggestion To Fix</h4>
          <p>{issues[0]?.suggestedFix || "Review the affected element and apply the recommendation."}</p>
        </aside>
      </div>
    </section>
  );
}

const COUNTRY_REFERENCE_LINKS: Record<CountryRegulation, ReferenceLink[]> = {
  "United States - ADA / Section 508": [
    {
      label: "ADA web accessibility guidance",
      source: "ADA",
      url: "https://www.ada.gov/resources/web-guidance/",
    },
    {
      label: "Section 508 ICT standards",
      source: "Section 508",
      url: "https://www.access-board.gov/ict/",
    },
  ],
  "United Kingdom - Equality Act / PSBAR 2018": [
    {
      label: "UK public sector accessibility requirements",
      source: "UK GOV",
      url: "https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps",
    },
  ],
  "European Union - EAA / EN 301 549": [
    {
      label: "EU web accessibility policy",
      source: "EU",
      url: "https://digital-strategy.ec.europa.eu/en/policies/web-accessibility",
    },
  ],
  "Canada - ACA / AODA": [
    {
      label: "Canada accessibility guidance",
      source: "Canada",
      url: "https://www.canada.ca/en/government/about/accessibility.html",
    },
  ],
  "Australia - DDA": [
    {
      label: "Australian web accessibility advisory notes",
      source: "Australia DDA",
      url: "https://humanrights.gov.au/our-work/disability-rights/world-wide-web-access-disability-discrimination-act-advisory-notes-ver-41-2014",
    },
  ],
  "India - RPwD Act / IS 17802": [
    {
      label: "India accessibility policy overview",
      source: "WAI Policies",
      url: "https://www.w3.org/WAI/policies/india/",
    },
  ],
  "Japan - JIS X 8341-3": [
    {
      label: "Japan accessibility policy overview",
      source: "WAI Policies",
      url: "https://www.w3.org/WAI/policies/japan/",
    },
  ],
  "Brazil - LBI / eMAG": [
    {
      label: "Brazil accessibility policy overview",
      source: "WAI Policies",
      url: "https://www.w3.org/WAI/policies/brazil/",
    },
  ],
  "Singapore - DSS": [
    {
      label: "Singapore accessibility policy overview",
      source: "WAI Policies",
      url: "https://www.w3.org/WAI/policies/singapore/",
    },
  ],
  "South Africa - PEPUDA": [
    {
      label: "South Africa accessibility policy overview",
      source: "WAI Policies",
      url: "https://www.w3.org/WAI/policies/south-africa/",
    },
  ],
};

function getIssueReferenceLinks(
  issue?: AccessibilityIssue,
  report?: AccessibilityReport,
): ReferenceLink[] {
  const links: ReferenceLink[] = [];

  if (issue?.referenceLinks?.length) {
    links.push(...issue.referenceLinks);
  } else if (issue?.helpUrl) {
    links.push({
      label: "Accessibility reference",
      source: issue.engine,
      url: issue.helpUrl,
    });
  }

  const countryRegulation = normalizeCountryRegulation(report?.countryRegulation);

  if (report?.complianceType === "Country Regulations" && countryRegulation) {
    links.push(...(COUNTRY_REFERENCE_LINKS[countryRegulation] ?? []));
  }

  const seen = new Set<string>();
  return links.filter((link) => {
    if (!link.url || seen.has(link.url)) {
      return false;
    }

    seen.add(link.url);
    return true;
  });
}

function getFileNameFromDisposition(disposition?: string): string | undefined {
  if (!disposition) {
    return undefined;
  }

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/"/g, ""));
    } catch {
      return encodedMatch[1].replace(/"/g, "");
    }
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1];
}

export default ReportView;
