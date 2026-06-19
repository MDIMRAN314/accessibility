import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCountryRegulationDisplayName } from "@/data/accessibilityConfig";
import {
  accessibilityService,
  getApiErrorMessage,
  getVeraPdfStatusFromError,
} from "@/services/api";
import type { AccessibilityRequest, VeraPdfStatus } from "@/types/accessibility";
import styles from "@styles/RequestList.module.scss";

const defaultVeraPdfStatus: VeraPdfStatus = {
  available: false,
  command: "verapdf",
  downloadUrl: "https://verapdf.org/software/",
  installUrl: "https://docs.verapdf.org/install/",
  message:
    "veraPDF is required before generating PDF reports. Download and install veraPDF, configure VERAPDF_COMMAND, then try again.",
};

function RequestList(): JSX.Element {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AccessibilityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [veraPdfStatus, setVeraPdfStatus] =
    useState<VeraPdfStatus | null>(null);
  const [retryRequest, setRetryRequest] = useState<AccessibilityRequest | null>(
    null,
  );

  useEffect(() => {
    const loadRequests = async () => {
      try {
        setLoading(true);
        const response = await accessibilityService.getAllRequests();
        setRequests(response.data);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Failed to load requests."));
      } finally {
        setLoading(false);
      }
    };

    void loadRequests();
  }, []);

  const openReport = async (request: AccessibilityRequest) => {
    setBusyRequestId(request.requestId);
    setError(null);

    try {
      try {
        const reportResponse = await accessibilityService.getReportByRequestId(request.requestId);
        navigate(`/report/${reportResponse.data.reportId}`);
        return;
      } catch {
        if (request.requestType === "PDF") {
          const veraPdfAvailable = await verifyVeraPdfForRequest(request);

          if (!veraPdfAvailable) {
            return;
          }
        }

        const generated = await accessibilityService.generateReport(request.requestId);
        navigate(`/report/${generated.data.report.reportId}`);
      }
    } catch (reportError) {
      const status = getVeraPdfStatusFromError(reportError);

      if (status) {
        showVeraPdfPopup(status, request);
        return;
      }

      setError(getApiErrorMessage(reportError, "Failed to open report."));
    } finally {
      setBusyRequestId(null);
    }
  };

  const showVeraPdfPopup = (
    status: VeraPdfStatus | undefined,
    request?: AccessibilityRequest,
  ) => {
    setVeraPdfStatus(status ?? defaultVeraPdfStatus);
    setRetryRequest(request ?? null);
  };

  const verifyVeraPdfForRequest = async (
    request: AccessibilityRequest,
  ): Promise<boolean> => {
    try {
      const response = await accessibilityService.getVeraPdfStatus();
      const status = response.data.veraPdf;

      if (!status.available) {
        showVeraPdfPopup(status, request);
        return false;
      }

      return true;
    } catch (statusError) {
      const status = getVeraPdfStatusFromError(statusError);

      if (status) {
        showVeraPdfPopup(status, request);
        return false;
      }

      throw statusError;
    }
  };

  if (loading) {
    return <div className={styles.stateMessage}>Loading requests...</div>;
  }

  return (
    <section className={styles.requestList}>
      <header>
        <div>
          <p>Accessibility Workbench</p>
          <h2>Test history</h2>
        </div>
        <button type="button" onClick={() => navigate("/")}>
          New Test
        </button>
      </header>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      {requests.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>No test requests found</h3>
          <p>Create a request to generate your first accessibility report.</p>
        </div>
      ) : (
        <div className={styles.tableScroller}>
          <table>
            <thead>
              <tr>
                <th>Request ID</th>
                <th>URL</th>
                <th>Type</th>
                <th>Compliance</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.requestId}>
                  <td>{request.requestId}</td>
                  <td>
                    <span className={styles.urlCell}>{request.url}</span>
                  </td>
                  <td>{request.requestType}</td>
                  <td>
                    {request.requestType === "PDF" && request.pdfStandard
                      ? request.pdfStandard
                      : request.complianceType === "WCAG Standards"
                      ? `WCAG ${request.wcagVersion} ${request.conformanceLevel}`
                      : getCountryRegulationDisplayName(request.countryRegulation)}
                  </td>
                  <td>
                    <span className={styles[`status${request.status}`]}>
                      {request.status}
                    </span>
                  </td>
                  <td>{new Date(request.createdAt).toLocaleString()}</td>
                  <td>
                    <button
                      disabled={busyRequestId === request.requestId}
                      onClick={() => void openReport(request)}
                      type="button"
                    >
                      {busyRequestId === request.requestId ? "Opening..." : "Open Report"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {veraPdfStatus ? (
        <div className={styles.modalBackdrop} role="presentation">
          <aside
            aria-labelledby="vera-pdf-title"
            aria-modal="true"
            className={styles.veraPdfModal}
            role="dialog"
          >
            <header>
              <div>
                <p>PDF validation dependency</p>
                <h3 id="vera-pdf-title">veraPDF is not installed</h3>
              </div>
              <button
                aria-label="Close"
                onClick={() => {
                  setVeraPdfStatus(null);
                  setRetryRequest(null);
                }}
                type="button"
              >
                x
              </button>
            </header>

            <p>{veraPdfStatus.message}</p>
            <dl>
              <div>
                <dt>Expected command</dt>
                <dd>{veraPdfStatus.command}</dd>
              </div>
              {veraPdfStatus.error ? (
                <div>
                  <dt>System response</dt>
                  <dd>{veraPdfStatus.error}</dd>
                </div>
              ) : null}
            </dl>

            <footer>
              <a
                href={veraPdfStatus.downloadUrl}
                rel="noreferrer"
                target="_blank"
              >
                Download veraPDF
              </a>
              <a
                href={veraPdfStatus.installUrl}
                rel="noreferrer"
                target="_blank"
              >
                Installation Guide
              </a>
              <button
                disabled={!retryRequest}
                onClick={() => {
                  const requestToRetry = retryRequest;
                  setVeraPdfStatus(null);
                  setRetryRequest(null);
                  if (requestToRetry) {
                    void openReport(requestToRetry);
                  }
                }}
                type="button"
              >
                Retry Generate
              </button>
            </footer>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

export default RequestList;
