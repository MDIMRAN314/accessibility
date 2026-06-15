import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCountryRegulationDisplayName } from "@/data/accessibilityConfig";
import { accessibilityService, getApiErrorMessage } from "@/services/api";
import type { AccessibilityRequest } from "@/types/accessibility";
import styles from "@styles/RequestList.module.scss";

function RequestList(): JSX.Element {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<AccessibilityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const generated = await accessibilityService.generateReport(request.requestId);
        navigate(`/report/${generated.data.report.reportId}`);
      }
    } catch (reportError) {
      setError(getApiErrorMessage(reportError, "Failed to open report."));
    } finally {
      setBusyRequestId(null);
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
                    {request.complianceType === "WCAG Standards"
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
    </section>
  );
}

export default RequestList;
