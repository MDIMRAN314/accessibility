import { KeyboardEvent, useMemo, useState } from "react";
import {
  deriveAggregateStatus,
  getAllowedStatuses,
  getElementKey,
  getFilteredIssues,
  isStatusEditable,
} from "@/utils/reportModel";
import type {
  AccessibilityElement,
  AccessibilityIssue,
  AccessibilityReport,
  DetailDrawerSubject,
  IssueType,
  ReportCriterion,
  ReportIssueTab,
  ReportStatus,
  Severity,
} from "@/types/accessibility";
import styles from "@styles/ReportView.module.scss";

const ISSUE_TYPE_BY_TAB: Partial<Record<ReportIssueTab, IssueType>> = {
  automated: "Automated",
  "semi-automated": "Semi-Automated",
  manual: "Manual",
  "best-practices": "Best Practices",
};

interface GuidelineViewProps {
  activeTab: ReportIssueTab;
  onCreateIssue: (issueId: string) => void;
  onElementStatusChange: (elementKey: string, status: ReportStatus) => void;
  onLocateElement: (elementKey: string) => void;
  onOpenDetail: (subject: DetailDrawerSubject) => void;
  onOpenSuggestion: (issueId: string) => void;
  onStatusChange: (issueId: string, status: ReportStatus) => void;
  report: AccessibilityReport;
  search: string;
  severityFilter: Severity | "All";
}

function GuidelineView({
  activeTab,
  onCreateIssue,
  onElementStatusChange,
  onLocateElement,
  onOpenDetail,
  onOpenSuggestion,
  onStatusChange,
  report,
  search,
  severityFilter,
}: GuidelineViewProps): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredIssues = useMemo(
    () => getFilteredIssues(report, activeTab, search, severityFilter),
    [activeTab, report, search, severityFilter],
  );
  const knownCriterionIds = useMemo(() => {
    return new Set(
      report.principles.flatMap((principle) =>
        principle.guidelines.flatMap((guideline) =>
          guideline.criteria.map((criterion) => criterion.id),
        ),
      ),
    );
  }, [report.principles]);
  const unmatchedIssues = useMemo(
    () => filteredIssues.filter((issue) => !knownCriterionIds.has(issue.criterion)),
    [filteredIssues, knownCriterionIds],
  );

  const tabIssueType = ISSUE_TYPE_BY_TAB[activeTab];
  const hasActiveFilter = Boolean(search.trim()) || severityFilter !== "All";
  const unmatchedKey = "unmatched-axe-findings";
  const unmatchedOpen =
    expanded[unmatchedKey] ?? activeTab === "best-practices";

  const expandAll = () => {
    const next: Record<string, boolean> = {};

    report.principles.forEach((principle, principleIndex) => {
      next[`principle-${principleIndex}`] = true;
      principle.guidelines.forEach((guideline, guidelineIndex) => {
        next[`guideline-${principleIndex}-${guidelineIndex}`] = true;
        guideline.criteria.forEach((criterion) => {
          next[`criterion-${criterion.id}`] = true;
        });
      });
    });

    filteredIssues.forEach((issue) => {
      next[getIssueKey(issue.issueId)] = true;
    });
    next[unmatchedKey] = true;

    setExpanded(next);
  };

  const collapseAll = () => setExpanded({});

  const toggle = (key: string) => {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className={styles.treePanel}>
      <div className={styles.treeActions}>
        <button onClick={expandAll} type="button" title="Expand all">
          +
        </button>
        <button onClick={collapseAll} type="button" title="Collapse all">
          -
        </button>
      </div>

      <div className={styles.reportTable}>
        <div className={styles.tableHead}>
          <span>Standard</span>
          <span>Severity</span>
          <span>Status</span>
        </div>

        {report.principles.map((principle, principleIndex) => {
          const visibleGuidelines = principle.guidelines
            .map((guideline, guidelineIndex) => {
              const visibleCriteria = guideline.criteria.filter((criterion) =>
                shouldShowCriterion(
                  criterion,
                  tabIssueType,
                  hasActiveFilter,
                  filteredIssues,
                ),
              );

              return {
                guideline,
                guidelineIndex,
                visibleCriteria,
              };
            })
            .filter((item) => item.visibleCriteria.length > 0);

          if (visibleGuidelines.length === 0) {
            return null;
          }

          const principleIssues = getIssuesForCriteria(
            filteredIssues,
            visibleGuidelines.flatMap((item) =>
              item.visibleCriteria.map((criterion) => criterion.id),
            ),
          );
          const principleKey = `principle-${principleIndex}`;

          return (
            <div className={styles.levelGroup} key={principleKey}>
              <TreeLevelRow
                depth={0}
                isOpen={Boolean(expanded[principleKey])}
                issues={principleIssues}
                onToggle={() => toggle(principleKey)}
                status={deriveAggregateStatus(principleIssues, principle.status ?? "NA")}
                title={principle.name}
              />

              {expanded[principleKey]
                ? visibleGuidelines.map(({ guideline, guidelineIndex, visibleCriteria }) => {
                    const criterionIds = visibleCriteria.map((criterion) => criterion.id);
                    const guidelineIssues = getIssuesForCriteria(filteredIssues, criterionIds);
                    const guidelineKey = `guideline-${principleIndex}-${guidelineIndex}`;

                    return (
                      <div className={styles.childGroup} key={guidelineKey}>
                        <TreeLevelRow
                          depth={1}
                          isOpen={Boolean(expanded[guidelineKey])}
                          issues={guidelineIssues}
                          onToggle={() => toggle(guidelineKey)}
                          status={deriveAggregateStatus(
                            guidelineIssues,
                            guideline.status ?? "NA",
                          )}
                          title={guideline.name}
                        />

                        {expanded[guidelineKey]
                          ? visibleCriteria.map((criterion) => {
                              const criterionIssues = filteredIssues.filter(
                                (issue) => issue.criterion === criterion.id,
                              );
                              const criterionKey = `criterion-${criterion.id}`;
                              const canExpand = criterionIssues.length > 0;

                              return (
                                <div className={styles.criteriaGroup} key={criterion.id}>
                                  <TreeLevelRow
                                    depth={2}
                                    disabled={!canExpand}
                                    isOpen={Boolean(expanded[criterionKey])}
                                    issues={criterionIssues}
                                    onToggle={() => toggle(criterionKey)}
                                    status={deriveAggregateStatus(
                                      criterionIssues,
                                      criterion.status ?? "Pass",
                                    )}
                                    title={`${criterion.id} ${criterion.name} (${criterion.level})`}
                                  />

                                  {expanded[criterionKey]
                                    ? criterionIssues.map((issue) => {
                                        const issueKey = getIssueKey(issue.issueId);

                                        return (
                                          <IssueRow
                                            isExpanded={Boolean(expanded[issueKey])}
                                            issue={issue}
                                            key={issue.issueId}
                                            onCreateIssue={onCreateIssue}
                                            onElementStatusChange={onElementStatusChange}
                                            onLocateElement={onLocateElement}
                                            onOpenDetail={onOpenDetail}
                                            onOpenSuggestion={onOpenSuggestion}
                                            onStatusChange={onStatusChange}
                                            onToggle={() => toggle(issueKey)}
                                          />
                                        );
                                      })
                                    : null}
                                </div>
                              );
                            })
                          : null}
                      </div>
                    );
                  })
                : null}
            </div>
          );
        })}

        {unmatchedIssues.length > 0 ? (
          <div className={styles.levelGroup}>
            <TreeLevelRow
              depth={0}
              isOpen={unmatchedOpen}
              issues={unmatchedIssues}
              onToggle={() => toggle(unmatchedKey)}
              status={deriveAggregateStatus(unmatchedIssues, "Warning")}
              title={
                activeTab === "best-practices"
                  ? "Axe Best Practice Findings"
                  : "Unmapped Axe Findings"
              }
            />

            {unmatchedOpen
              ? unmatchedIssues.map((issue) => {
                  const issueKey = getIssueKey(issue.issueId);

                  return (
                    <IssueRow
                      isExpanded={Boolean(expanded[issueKey])}
                      issue={issue}
                      key={issue.issueId}
                      onCreateIssue={onCreateIssue}
                      onElementStatusChange={onElementStatusChange}
                      onLocateElement={onLocateElement}
                      onOpenDetail={onOpenDetail}
                      onOpenSuggestion={onOpenSuggestion}
                      onStatusChange={onStatusChange}
                      onToggle={() => toggle(issueKey)}
                    />
                  );
                })
              : null}
          </div>
        ) : null}

        {filteredIssues.length === 0 ? (
          <div className={styles.emptyReport}>No issues match the current filters.</div>
        ) : null}
      </div>
    </section>
  );
}

interface TreeLevelRowProps {
  depth: 0 | 1 | 2;
  disabled?: boolean;
  isOpen: boolean;
  issues: AccessibilityIssue[];
  onToggle: () => void;
  status: ReportStatus;
  title: string;
}

function TreeLevelRow({
  depth,
  disabled = false,
  isOpen,
  issues,
  onToggle,
  status,
  title,
}: TreeLevelRowProps): JSX.Element {
  const depthClass = styles[`depth${depth}`] ?? "";

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      aria-disabled={disabled}
      aria-expanded={disabled ? undefined : isOpen}
      className={`${styles.levelRow} ${depthClass} ${
        disabled ? styles.disabledRow : ""
      }`}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      <span>
        <button
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={styles.rowToggle}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          title={isOpen ? "Collapse" : "Expand"}
          type="button"
        >
          {isOpen ? "-" : "+"}
        </button>
        <span className={styles.rowTitle}>{title}</span>
        <CountPills issues={issues} />
      </span>
      <span />
      <StatusBadge status={status} />
    </div>
  );
}

interface IssueRowProps {
  isExpanded: boolean;
  issue: AccessibilityIssue;
  onCreateIssue: (issueId: string) => void;
  onElementStatusChange: (elementKey: string, status: ReportStatus) => void;
  onLocateElement: (elementKey: string) => void;
  onOpenDetail: (subject: DetailDrawerSubject) => void;
  onOpenSuggestion: (issueId: string) => void;
  onStatusChange: (issueId: string, status: ReportStatus) => void;
  onToggle: () => void;
}

function IssueRow({
  isExpanded,
  issue,
  onCreateIssue,
  onElementStatusChange,
  onLocateElement,
  onOpenDetail,
  onOpenSuggestion,
  onStatusChange,
  onToggle,
}: IssueRowProps): JSX.Element {
  const allowedStatuses = getAllowedStatuses(issue.status, "issue");
  const editable = isStatusEditable(issue.status, "issue");

  return (
    <div className={styles.issueBlock}>
      <div className={styles.issueRow}>
        <div className={styles.issueTitleCell}>
          <button
            aria-label={isExpanded ? "Collapse issue" : "Expand issue"}
            className={styles.rowToggle}
            onClick={onToggle}
            title={isExpanded ? "Collapse" : "Expand"}
            type="button"
          >
            {isExpanded ? "-" : "+"}
          </button>
          <button
            className={styles.issueDetailButton}
            onClick={() => onOpenDetail({ kind: "issue", issueId: issue.issueId })}
            type="button"
          >
            <span>
              {issue.description}
              <small>
                {issue.criterion} - {issue.elements.length} elements
              </small>
            </span>
          </button>
        </div>
        <span className={styles[`severity${issue.severity}`]}>{issue.severity}</span>
        <select
          disabled={!editable}
          onChange={(event) => onStatusChange(issue.issueId, event.target.value as ReportStatus)}
          title={editable ? "Change status" : "Status is not editable"}
          value={issue.status}
        >
          {allowedStatuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <div className={styles.issueHoverActions}>
          <button
            onClick={() => onCreateIssue(issue.issueId)}
            title="Create Issue"
            type="button"
          >
            B
          </button>
          <button
            onClick={() => onOpenSuggestion(issue.issueId)}
            title="Suggestion to Fix"
            type="button"
          >
            ?
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className={styles.issueElements}>
          {issue.elements.length > 0 ? (
            issue.elements.map((element, index) => (
              <ElementInlineRow
                element={element}
                key={`${issue.issueId}-${getElementKey(element)}-${index}`}
                onElementStatusChange={onElementStatusChange}
                onLocateElement={onLocateElement}
                onOpenDetail={onOpenDetail}
              />
            ))
          ) : (
            <div className={styles.emptyInlineRow}>No elements captured for this issue.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface ElementInlineRowProps {
  element: AccessibilityElement;
  onElementStatusChange: (elementKey: string, status: ReportStatus) => void;
  onLocateElement: (elementKey: string) => void;
  onOpenDetail: (subject: DetailDrawerSubject) => void;
}

function ElementInlineRow({
  element,
  onElementStatusChange,
  onLocateElement,
  onOpenDetail,
}: ElementInlineRowProps): JSX.Element {
  const elementKey = getElementKey(element);
  const status = element.status ?? "Manual Review";
  const allowedStatuses = getAllowedStatuses(status, "element");
  const editable = isStatusEditable(status, "element");

  return (
    <div className={styles.elementInlineRow}>
      <div className={styles.issueTitleCell}>
        <span className={styles.elementIndent} />
        <button
          className={styles.issueDetailButton}
          onClick={() => onOpenDetail({ kind: "element", elementKey })}
          type="button"
        >
          <span>
            {element.elementName || element.selector || "Unnamed element"}
            <small>{element.selector || element.xpath || "No locator"}</small>
          </span>
        </button>
        <button
          className={styles.locateButton}
          onClick={() => onLocateElement(elementKey)}
          title="Highlight Element"
          type="button"
        >
          H
        </button>
      </div>
      <span />
      <select
        disabled={!editable}
        onChange={(event) => onElementStatusChange(elementKey, event.target.value as ReportStatus)}
        title={editable ? "Change element status" : "Status is not editable"}
        value={status}
      >
        {allowedStatuses.map((allowedStatus) => (
          <option key={allowedStatus} value={allowedStatus}>
            {allowedStatus}
          </option>
        ))}
      </select>
    </div>
  );
}

function CountPills({ issues }: { issues: AccessibilityIssue[] }): JSX.Element {
  const elementCount = issues.reduce((total, issue) => total + issue.elements.length, 0);

  return (
    <span className={styles.countPills}>
      <span title="Issues">
        {issues.length} <abbr>I</abbr>
        <strong>Issues</strong>
      </span>
      <span title="Elements">
        {elementCount} <abbr>E</abbr>
        <strong>Elements</strong>
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: ReportStatus }): JSX.Element {
  return <span className={styles.statusBadge}>{status}</span>;
}

function getIssuesForCriteria(
  issues: AccessibilityIssue[],
  criterionIds: string[],
): AccessibilityIssue[] {
  const idSet = new Set(criterionIds);
  return issues.filter((issue) => idSet.has(issue.criterion));
}

function getIssueKey(issueId: string): string {
  return `issue-${issueId}`;
}

function shouldShowCriterion(
  criterion: ReportCriterion,
  tabIssueType: IssueType | undefined,
  hasActiveFilter: boolean,
  filteredIssues: AccessibilityIssue[],
): boolean {
  if (tabIssueType && criterion.type !== tabIssueType) {
    return false;
  }

  if (!hasActiveFilter) {
    return true;
  }

  return filteredIssues.some((issue) => issue.criterion === criterion.id);
}

export default GuidelineView;
