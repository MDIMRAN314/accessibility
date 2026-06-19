import { useEffect, useMemo, useRef, useState } from "react";
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
type TranscriptAudioSegment = {
  duration: number;
  end: number;
  start: number;
  text: string;
};

const TRANSCRIPT_WORDS_PER_SECOND = 2.4;
const TRANSCRIPT_SEEK_STEP_SECONDS = 10;

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
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

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
  const isTranscriptionReport = Boolean(report?.transcription);
  const isPdfReport = report?.requestDetails?.requestType === "PDF";
  const scannedPages = report?.scannedPages ?? [];
  const pagesScanned =
    scannedPages.filter((page) => page.status !== "Failed").length ||
    scannedPages.length ||
    1;
  const pagesFailed = scannedPages.filter((page) => page.status === "Failed").length;

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

  const handleDownloadReport = async (format: "html" | "pdf" = "html") => {
    if (!report) {
      return;
    }

    try {
      const response = await accessibilityService.downloadReport(report.reportId, format);
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
          {isTranscriptionReport ? (
            <>
              <Metric
                label="Screen Reader"
                value={report.transcription?.screenReader ?? "JAWS"}
              />
              <Metric
                label="Transcript Lines"
                value={`${report.transcription?.stats.lines ?? 0}`}
              />
            </>
          ) : (
            <>
              <Metric label="Score" value={`${report.accessibilityScore}%`} />
              <Metric
                label="Pages"
                title={`${pagesFailed} failed`}
                value={`${pagesScanned}`}
              />
            </>
          )}
          <button onClick={() => setRequestDrawerOpen(true)} title="Request Details" type="button">
            Details
          </button>
          {isPdfReport ? (
            <button
              onClick={() => setPdfPreviewOpen(true)}
              title="Preview uploaded PDF"
              type="button"
            >
              Preview PDF
            </button>
          ) : null}
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

      {!isTranscriptionReport ? (
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
      ) : null}

      {!isTranscriptionReport && activeView !== "summary" ? (
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
        {isTranscriptionReport ? (
          <TranscriptionReport
            onDownloadPdf={() => void handleDownloadReport("pdf")}
            report={report}
          />
        ) : null}

        {!isTranscriptionReport && activeView === "summary" ? (
          <ReportSummary
            onNavigate={navigateSummary}
            onOpenRequestDetails={() => setRequestDrawerOpen(true)}
            report={report}
          />
        ) : null}

        {!isTranscriptionReport && activeView === "guidelines" ? (
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

        {!isTranscriptionReport && activeView === "elements" ? (
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

      {!isTranscriptionReport && detailSubject ? (
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

      {!isTranscriptionReport && issueActionSubject ? (
        <IssueActionDrawer
          issue={getIssueById(report, issueActionSubject.issueId)}
          mode={issueActionSubject.mode}
          onClose={() => setIssueActionSubject(null)}
        />
      ) : null}

      {!isTranscriptionReport && debugElementKey ? (
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

      {isPdfReport && pdfPreviewOpen ? (
        <PdfPreviewModal
          onClose={() => setPdfPreviewOpen(false)}
          report={report}
        />
      ) : null}

    </section>
  );
}

function TranscriptionReport({
  onDownloadPdf,
  report,
}: {
  onDownloadPdf: () => void;
  report: AccessibilityReport;
}): JSX.Element {
  const [activeTab, setActiveTab] = useState<"summary" | "details">("summary");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const playbackRunIdRef = useRef(0);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const transcription = report.transcription;
  const transcriptSegments = useMemo(
    () => buildTranscriptAudioSegments(transcription?.actualContent ?? ""),
    [transcription?.actualContent],
  );
  const estimatedDuration = Math.max(
    1,
    getTranscriptDuration(transcriptSegments) ||
      Math.ceil(((transcription?.stats.words ?? 0) || 1) / TRANSCRIPT_WORDS_PER_SECOND),
  );
  const timelineValue = Math.min(
    estimatedDuration,
    Math.max(0, Math.round(elapsedSeconds)),
  );
  const currentSegment = transcriptSegments[currentSegmentIndex];

  useEffect(
    () => () => {
      playbackRunIdRef.current += 1;
      window.speechSynthesis?.cancel();
    },
    [],
  );

  useEffect(() => {
    if (!isSpeaking) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((current) =>
        current >= estimatedDuration ? estimatedDuration : current + 1,
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [estimatedDuration, isSpeaking]);

  useEffect(() => {
    setCurrentSegmentIndex(
      getTranscriptSegmentIndexAtTime(transcriptSegments, elapsedSeconds),
    );
  }, [elapsedSeconds, transcriptSegments]);

  useEffect(() => {
    setElapsedSeconds(0);
    setCurrentSegmentIndex(0);
    playbackRunIdRef.current += 1;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, [transcription?.actualContent]);

  if (!transcription) {
    return <div className={styles.emptyReport}>No transcription data found.</div>;
  }

  const speakSegment = (segmentIndex: number, runId: number) => {
    const segment = transcriptSegments[segmentIndex];

    if (!segment || isMuted || !("speechSynthesis" in window)) {
      setIsSpeaking(false);
      return;
    }

    setCurrentSegmentIndex(segmentIndex);
    setElapsedSeconds(segment.start);

    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.rate = 0.95;
    utterance.onend = () => {
      if (playbackRunIdRef.current !== runId) {
        return;
      }

      setElapsedSeconds(segment.end);
      const nextSegmentIndex = segmentIndex + 1;

      if (nextSegmentIndex >= transcriptSegments.length) {
        currentUtteranceRef.current = null;
        setIsSpeaking(false);
        return;
      }

      speakSegment(nextSegmentIndex, runId);
    };
    utterance.onerror = () => {
      if (playbackRunIdRef.current === runId) {
        setIsSpeaking(false);
      }
    };

    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const startSpeechFromSegment = (segmentIndex: number) => {
    if (isMuted || !("speechSynthesis" in window) || transcriptSegments.length === 0) {
      return;
    }

    const safeSegmentIndex = Math.min(
      Math.max(segmentIndex, 0),
      transcriptSegments.length - 1,
    );
    playbackRunIdRef.current += 1;
    const runId = playbackRunIdRef.current;
    window.speechSynthesis.cancel();
    speakSegment(safeSegmentIndex, runId);
  };

  const seekToSegment = (segmentIndex: number, resumePlayback = isSpeaking) => {
    if (transcriptSegments.length === 0) {
      return;
    }

    const safeSegmentIndex = Math.min(
      Math.max(segmentIndex, 0),
      transcriptSegments.length - 1,
    );
    const nextSegment = transcriptSegments[safeSegmentIndex];
    playbackRunIdRef.current += 1;
    window.speechSynthesis?.cancel();
    currentUtteranceRef.current = null;
    setCurrentSegmentIndex(safeSegmentIndex);
    setElapsedSeconds(nextSegment.start);
    setIsSpeaking(false);

    if (resumePlayback && !isMuted) {
      window.setTimeout(() => startSpeechFromSegment(safeSegmentIndex), 0);
    }
  };

  const seekToTime = (seconds: number) => {
    seekToSegment(
      getTranscriptSegmentIndexAtTime(transcriptSegments, seconds),
      isSpeaking,
    );
  };

  const seekBySeconds = (seconds: number) => {
    seekToTime(elapsedSeconds + seconds);
  };

  const playTranscript = () => {
    if (isMuted || !("speechSynthesis" in window) || transcriptSegments.length === 0) {
      return;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsSpeaking(true);
      return;
    }

    const segmentIndex =
      elapsedSeconds >= estimatedDuration
        ? 0
        : getTranscriptSegmentIndexAtTime(transcriptSegments, elapsedSeconds);
    startSpeechFromSegment(segmentIndex);
  };

  const pauseTranscript = () => {
    window.speechSynthesis?.pause();
    setIsSpeaking(false);
  };

  const toggleMute = () => {
    playbackRunIdRef.current += 1;
    window.speechSynthesis?.cancel();
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setIsMuted((current) => !current);
  };

  const saveGoldenFile = () => {
    const payload = {
      requestId: report.requestId,
      reportId: report.reportId,
      url: report.url,
      screenReader: transcription.screenReader,
      mode: transcription.mode,
      selectedCheckPoints: transcription.selectedCheckPoints,
      pageTitle: transcription.pageTitle,
      generatedAt: transcription.generatedAt,
      actualContent: transcription.actualContent,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    const safeName = getRequestName(report).replace(/[^a-z0-9]+/gi, "_");

    link.href = window.URL.createObjectURL(blob);
    link.download = `${safeName || "transcription"}_jaws_golden.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(link.href);
  };

  return (
    <section className={styles.transcriptionReport}>
      <nav className={styles.transcriptionTabs} aria-label="Transcription views">
        <button
          className={activeTab === "summary" ? styles.active : ""}
          onClick={() => setActiveTab("summary")}
          type="button"
        >
          Summary
        </button>
        <button
          className={activeTab === "details" ? styles.active : ""}
          onClick={() => setActiveTab("details")}
          type="button"
        >
          Detailed View
        </button>
      </nav>

      <div className={styles.transcriptionUrl}>
        <strong>URL:</strong> {transcription.url}
      </div>

      {activeTab === "summary" ? (
        <div className={styles.transcriptionSummary}>
          <article>
            <h3>Screen Reader</h3>
            <strong>{transcription.screenReader}</strong>
            <span>
              {transcription.mode === "actual-jaws-demo"
                ? "Actual JAWS demo mode"
                : "JAWS-style fallback"}
            </span>
          </article>
          <article>
            <h3>Page Title</h3>
            <strong>{transcription.pageTitle}</strong>
            <span>{transcription.selectedCheckPoints.length} checkpoints</span>
          </article>
          <article>
            <h3>Transcript Size</h3>
            <strong>{transcription.stats.lines} lines</strong>
            <span>{transcription.stats.words} words</span>
          </article>
        </div>
      ) : (
        <div className={styles.transcriptionSections}>
          {transcription.sections.map((section) => (
            <article key={section.checkpoint}>
              <h3>{section.checkpoint}</h3>
              <ul>
                {section.lines.map((line, index) => (
                  <li key={`${section.checkpoint}-${index}`}>{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      <section className={styles.transcriptPanel}>
        <header>
          <h3>Traversal Transcript</h3>
          <div className={styles.transcriptActions}>
            <button
              aria-label="Download traversal transcript as PDF"
              onClick={onDownloadPdf}
              title="Download traversal transcript as PDF"
              type="button"
            >
              PDF
            </button>
            <button
              aria-label="Save to golden file"
              className={styles.saveGoldenButton}
              onClick={saveGoldenFile}
              title="Save to golden file"
              type="button"
            >
              Save
            </button>
          </div>
        </header>
        {showCaptions ? <pre>{transcription.actualContent}</pre> : null}
        <div className={styles.audioControls}>
          <button
            aria-label={`Back ${TRANSCRIPT_SEEK_STEP_SECONDS} seconds`}
            disabled={transcriptSegments.length === 0}
            onClick={() => seekBySeconds(-TRANSCRIPT_SEEK_STEP_SECONDS)}
            title={`Back ${TRANSCRIPT_SEEK_STEP_SECONDS} seconds`}
            type="button"
          >
            -{TRANSCRIPT_SEEK_STEP_SECONDS}
          </button>
          <button
            aria-label={isSpeaking ? "Pause transcription" : "Play transcription"}
            disabled={isMuted || transcriptSegments.length === 0}
            onClick={isSpeaking ? pauseTranscript : playTranscript}
            title={isSpeaking ? "Pause" : "Play"}
            type="button"
          >
            {isSpeaking ? "||" : ">"}
          </button>
          <button
            aria-label={`Forward ${TRANSCRIPT_SEEK_STEP_SECONDS} seconds`}
            disabled={transcriptSegments.length === 0}
            onClick={() => seekBySeconds(TRANSCRIPT_SEEK_STEP_SECONDS)}
            title={`Forward ${TRANSCRIPT_SEEK_STEP_SECONDS} seconds`}
            type="button"
          >
            +{TRANSCRIPT_SEEK_STEP_SECONDS}
          </button>
          <span>{formatTranscriptTime(elapsedSeconds)}</span>
          <input
            aria-label="Transcript timeline"
            max={estimatedDuration}
            min={0}
            onChange={(event) => seekToTime(Number(event.target.value))}
            step={1}
            type="range"
            value={timelineValue}
          />
          <span>{formatTranscriptTime(estimatedDuration)}</span>
          <button
            aria-label={isMuted ? "Unmute transcription" : "Mute transcription"}
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            type="button"
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            aria-label="Toggle captions"
            className={showCaptions ? styles.active : ""}
            onClick={() => setShowCaptions((current) => !current)}
            title="Closed captions"
            type="button"
          >
            CC
          </button>
        </div>
        {currentSegment ? (
          <p className={styles.audioPosition}>
            {currentSegmentIndex + 1}/{transcriptSegments.length}: {currentSegment.text}
          </p>
        ) : null}
      </section>

      {transcription.notes?.length ? (
        <div className={styles.transcriptionNote}>
          {transcription.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

    </section>
  );
}

function formatTranscriptTime(seconds: number): string {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function buildTranscriptAudioSegments(content: string): TranscriptAudioSegment[] {
  let cursor = 0;

  return content
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => {
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const duration = Math.max(
        1,
        Math.ceil(wordCount / TRANSCRIPT_WORDS_PER_SECOND),
      );
      const segment = {
        duration,
        end: cursor + duration,
        start: cursor,
        text,
      };
      cursor = segment.end;

      return segment;
    });
}

function getTranscriptDuration(segments: TranscriptAudioSegment[]): number {
  return segments.length > 0 ? segments[segments.length - 1].end : 0;
}

function getTranscriptSegmentIndexAtTime(
  segments: TranscriptAudioSegment[],
  seconds: number,
): number {
  if (segments.length === 0) {
    return 0;
  }

  const safeSeconds = Math.max(0, seconds);
  const index = segments.findIndex((segment) => safeSeconds < segment.end);

  return index >= 0 ? index : segments.length - 1;
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
  const isPdfReport = details?.requestType === "PDF";

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
          <dt>{isPdfReport ? "File" : "URL"}</dt>
          <dd>{report.url}</dd>
        </div>
        <div>
          <dt>Compliance</dt>
          <dd>
            {isPdfReport && details?.pdfStandard
              ? details.pdfStandard
              : report.complianceType === "WCAG Standards"
              ? `WCAG ${report.wcagVersion} ${report.conformanceLevel}`
              : getCountryRegulationDisplayName(report.countryRegulation)}
          </dd>
        </div>
        <div>
          <dt>Request Type</dt>
          <dd>{details?.requestType ?? "Web"}</dd>
        </div>
        <div>
          <dt>Pages Scanned</dt>
          <dd>{isPdfReport ? "1 document" : (report.scannedPages?.length ?? 1)}</dd>
        </div>
        {isPdfReport && details?.sourceFileSize ? (
          <div>
            <dt>File Size</dt>
            <dd>{formatBytes(details.sourceFileSize)}</dd>
          </div>
        ) : null}
        {isPdfReport && details?.pdfMaxFailures ? (
          <div>
            <dt>Max Failures</dt>
            <dd>{details.pdfMaxFailures}</dd>
          </div>
        ) : null}
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
      {report.pdfValidation ? (
        <section className={styles.weightageDetails}>
          <h4>PDF Validation</h4>
          <dl className={styles.detailList}>
            <div>
              <dt>Tool</dt>
              <dd>{report.pdfValidation.tool}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {report.pdfValidation.toolAvailable
                  ? report.pdfValidation.isCompliant
                    ? "Compliant"
                    : "Not compliant"
                  : "veraPDF unavailable"}
              </dd>
            </div>
            <div>
              <dt>Failed Checks</dt>
              <dd>{report.pdfValidation.failedChecks.length}</dd>
            </div>
            {report.pdfValidation.error ? (
              <div>
                <dt>Error</dt>
                <dd>{report.pdfValidation.error}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
    </aside>
  );
}

function PdfPreviewModal({
  onClose,
  report,
}: {
  onClose: () => void;
  report: AccessibilityReport;
}): JSX.Element {
  const sourceUrl = accessibilityService.getReportSourceUrl(report.reportId);

  return (
    <section className={styles.pdfPreviewOverlay} aria-label="PDF preview">
      <header>
        <div>
          <p>Uploaded file preview</p>
          <h3>{report.requestDetails?.sourceFileName || report.url}</h3>
        </div>
        <div>
          <a href={sourceUrl} rel="noreferrer" target="_blank">
            Open in Browser
          </a>
          <button onClick={onClose} type="button" aria-label="Close">
            x
          </button>
        </div>
      </header>
      <iframe src={sourceUrl} title="Uploaded PDF preview" />
    </section>
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
