import { useMemo, useState } from "react";
import {
  getAllowedStatuses,
  getElementGroups,
  getFilteredIssues,
  isStatusEditable,
} from "@/utils/reportModel";
import type {
  AccessibilityReport,
  DetailDrawerSubject,
  ReportIssueTab,
  ReportStatus,
  Severity,
} from "@/types/accessibility";
import styles from "@styles/ReportView.module.scss";

interface ElementViewProps {
  activeTab: ReportIssueTab;
  onElementStatusChange: (elementKey: string, status: ReportStatus) => void;
  onLocateElement: (elementKey: string) => void;
  onOpenDetail: (subject: DetailDrawerSubject) => void;
  onStatusChange: (issueId: string, status: ReportStatus) => void;
  report: AccessibilityReport;
  search: string;
  severityFilter: Severity | "All";
}

function ElementView({
  activeTab,
  onElementStatusChange,
  onLocateElement,
  onOpenDetail,
  onStatusChange,
  report,
  search,
  severityFilter,
}: ElementViewProps): JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredIssues = useMemo(
    () => getFilteredIssues(report, activeTab, search, severityFilter),
    [activeTab, report, search, severityFilter],
  );

  const elementGroups = useMemo(() => getElementGroups(filteredIssues), [filteredIssues]);

  const toggle = (key: string) => {
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <section className={styles.treePanel}>
      <div className={styles.reportTable}>
        <div className={styles.tableHead}>
          <span>Element</span>
          <span>Severity</span>
          <span>Status</span>
        </div>

        {elementGroups.length === 0 ? (
          <div className={styles.emptyReport}>No elements match the current filters.</div>
        ) : (
          elementGroups.map((group) => {
            const status = group.element.status ?? "Manual Review";
            const allowedStatuses = getAllowedStatuses(status, "element");
            const editable = isStatusEditable(status, "element");

            return (
              <div className={styles.elementGroup} key={group.elementKey}>
                <div className={styles.levelRow} role="group">
                  <span>
                    <button
                      aria-label={expanded[group.elementKey] ? "Collapse" : "Expand"}
                      className={styles.rowToggle}
                      onClick={() => toggle(group.elementKey)}
                      title={expanded[group.elementKey] ? "Collapse" : "Expand"}
                      type="button"
                    >
                      {expanded[group.elementKey] ? "-" : "+"}
                    </button>
                    <button
                      className={styles.issueDetailButton}
                      onClick={() => onOpenDetail({ kind: "element", elementKey: group.elementKey })}
                      type="button"
                    >
                      <span>
                        {group.element.elementName || group.element.selector || "Unnamed element"}
                        <small>{group.element.selector || group.element.xpath || "No locator"}</small>
                      </span>
                    </button>
                    <button
                      className={styles.locateButton}
                      onClick={() => onLocateElement(group.elementKey)}
                      title="Highlight Element"
                      type="button"
                    >
                      H
                    </button>
                    <span className={styles.countPills}>
                      <span title="Issues">
                        {group.issues.length} <abbr>I</abbr>
                        <strong>Issues</strong>
                      </span>
                    </span>
                  </span>
                  <span />
                  <select
                    disabled={!editable}
                    onChange={(event) =>
                      onElementStatusChange(group.elementKey, event.target.value as ReportStatus)
                    }
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

                {expanded[group.elementKey] ? (
                  <div className={styles.elementIssues}>
                    {group.issues.map((issue) => {
                      const issueAllowedStatuses = getAllowedStatuses(
                        issue.status,
                        "issue",
                      );
                      const issueEditable = isStatusEditable(issue.status, "issue");

                      return (
                        <div className={styles.issueRow} key={`${group.elementKey}-${issue.issueId}`}>
                          <button
                            className={styles.issueDetailButton}
                            onClick={() =>
                              onOpenDetail({ kind: "issue", issueId: issue.issueId })
                            }
                            type="button"
                          >
                            <span>
                              <strong>{issue.criterion}</strong> {issue.description}
                            </span>
                          </button>
                          <span className={styles[`severity${issue.severity}`]}>
                            {issue.severity}
                          </span>
                          <select
                            disabled={!issueEditable}
                            onChange={(event) =>
                              onStatusChange(issue.issueId, event.target.value as ReportStatus)
                            }
                            title={issueEditable ? "Change status" : "Status is not editable"}
                            value={issue.status}
                          >
                            {issueAllowedStatuses.map((allowedStatus) => (
                              <option key={allowedStatus} value={allowedStatus}>
                                {allowedStatus}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

export default ElementView;
