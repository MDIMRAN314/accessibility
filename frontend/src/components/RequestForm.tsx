import {
  FormEvent,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  CHECK_POINTS,
  CONFORMANCE_LEVELS,
  COUNTRY_REGULATIONS,
  COUNTRY_REGULATION_DISPLAY_NAMES,
  DEFAULT_COUNTRY_REGULATION,
  PDF_CHECK_POINTS,
  PDF_STANDARDS,
  REQUEST_TYPES,
  SCREEN_READERS,
  TASK_TYPES,
  WCAG_VERSIONS,
  createDefaultWeightages,
  getCountryComplianceAlignment,
  getDynamicGuidelines,
  getRenderableGuidelines,
  getSelectedGuidelineIds,
  getWcagVersionForPdfStandard,
  getWeightageTotal,
  groupGuidelinesByPrinciple,
  reconcileWeightages,
} from "@/data/accessibilityConfig";
import {
  accessibilityService,
  getApiErrorMessage,
  getVeraPdfStatusFromError,
} from "@/services/api";
import type {
  AccessibilityRequestPayload,
  CheckPoint,
  ComplianceType,
  CountryRegulation,
  GuidelineConfig,
  PdfStandard,
  RequestType,
  SelectedGuideline,
  VeraPdfStatus,
} from "@/types/accessibility";
import styles from "@styles/RequestForm.module.scss";

type FormErrors = Partial<
  Record<keyof AccessibilityRequestPayload | "pdfFile" | "submit", string>
>;
type DropdownId = "checkpoints" | "guidelines";

const initialGuidelines = getDynamicGuidelines("2.2", CHECK_POINTS);

const initialForm: AccessibilityRequestPayload = {
  requestName: "",
  requestType: "Web",
  url: "",
  taskType: "Guidelines Check",
  screenReader: "JAWS",
  complianceType: "WCAG Standards",
  wcagVersion: "2.2",
  countryRegulation: DEFAULT_COUNTRY_REGULATION,
  conformanceLevel: "AA",
  pdfStandard: "PDF/UA (ISO 14289)",
  passCriteriaPercentage: 50,
  pdfMaxFailures: 100,
  checkPoints: CHECK_POINTS,
  guidelines: ["All"],
  successCriteriaWeightage: createDefaultWeightages(initialGuidelines),
};

const validateUrl = (url: string): string | undefined => {
  if (!url.trim()) {
    return "URL is required";
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Enter valid URL";
    }
  } catch {
    return "Enter valid URL";
  }

  return undefined;
};

const summarizeCheckPoints = (
  value: CheckPoint[],
  availableCheckPoints: CheckPoint[],
): string => {
  if (value.includes("All") || value.length === availableCheckPoints.length) {
    return `All (${availableCheckPoints.length - 1})`;
  }

  if (value.length === 0) {
    return "Select checkpoints";
  }

  return value.length === 1 ? value[0] : `${value.length} selected`;
};

const summarizeGuidelines = (
  value: SelectedGuideline[],
  visibleGuidelines: GuidelineConfig[],
): string => {
  if (value.includes("All")) {
    return `All (${visibleGuidelines.length})`;
  }

  if (value.length === 0) {
    return "Select guidelines";
  }

  return value.length === 1 ? value[0] : `${value.length} selected`;
};

const normalizePayloadCheckPoints = (
  checkPoints: CheckPoint[],
  availableCheckPoints: CheckPoint[],
): CheckPoint[] => {
  if (
    checkPoints.includes("All") ||
    checkPoints.length === availableCheckPoints.length
  ) {
    return ["All"];
  }

  return checkPoints;
};

const clampWeightage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
};

const isSupportedPdfFile = (file: File): boolean => {
  const fileName = file.name.toLowerCase();
  const hasPdfExtension =
    fileName.endsWith(".pdf") || fileName.endsWith(".pdfx");
  const hasPdfMimeType =
    !file.type ||
    ["application/pdf", "application/octet-stream", "application/vnd.adobe.pdf"].includes(
      file.type,
    );

  return hasPdfExtension && hasPdfMimeType;
};

const defaultVeraPdfStatus: VeraPdfStatus = {
  available: false,
  command: "verapdf",
  downloadUrl: "https://verapdf.org/software/",
  installUrl: "https://docs.verapdf.org/install/",
  message:
    "veraPDF is required before generating PDF reports. Download and install veraPDF, configure VERAPDF_COMMAND, then try again.",
};

function RequestForm(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState<AccessibilityRequestPayload>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generating, setGenerating] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownId | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [veraPdfStatus, setVeraPdfStatus] =
    useState<VeraPdfStatus | null>(null);
  const checkPointDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const guidelineDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const isPdfRequest = form.requestType === "PDF";
  const isScreenReaderTranscription =
    !isPdfRequest && form.taskType === "Generate Screen Reader Transcription";
  const availableCheckPoints = isPdfRequest ? PDF_CHECK_POINTS : CHECK_POINTS;

  const availableGuidelines = useMemo(
    () =>
      getDynamicGuidelines(
        form.wcagVersion,
        form.checkPoints,
        form.requestType,
      ),
    [form.checkPoints, form.requestType, form.wcagVersion],
  );

  const selectedGuidelines = useMemo(
    () => getRenderableGuidelines(form.guidelines, availableGuidelines),
    [availableGuidelines, form.guidelines],
  );

  const groupedGuidelines = useMemo(
    () => groupGuidelinesByPrinciple(selectedGuidelines),
    [selectedGuidelines],
  );

  const selectedGuidelineIds = useMemo(
    () => getSelectedGuidelineIds(form.guidelines, availableGuidelines),
    [availableGuidelines, form.guidelines],
  );

  const countryAlignment = useMemo(
    () =>
      getCountryComplianceAlignment(
        form.countryRegulation ?? DEFAULT_COUNTRY_REGULATION,
      ),
    [form.countryRegulation],
  );

  const weightageTotal = getWeightageTotal(form.successCriteriaWeightage);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!openDropdown) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      const isInsideDropdown =
        checkPointDropdownRef.current?.contains(target) ||
        guidelineDropdownRef.current?.contains(target);

      if (!isInsideDropdown) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdown(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openDropdown]);

  const toggleDropdown = (dropdown: DropdownId) => {
    setOpenDropdown((current) => (current === dropdown ? null : dropdown));
  };

  const patchForm = (patch: Partial<AccessibilityRequestPayload>) => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors((current) => ({ ...current, ...patchToEmptyErrors(patch) }));
  };

  const handleRequestTypeChange = (requestType: RequestType) => {
    if (requestType === form.requestType) {
      return;
    }

    const nextCheckPoints =
      requestType === "PDF" ? PDF_CHECK_POINTS : CHECK_POINTS;
    const nextWcagVersion =
      requestType === "PDF"
        ? getWcagVersionForPdfStandard(form.pdfStandard)
        : form.wcagVersion;
    const visibleGuidelines = getDynamicGuidelines(
      nextWcagVersion,
      nextCheckPoints,
      requestType,
    );

    patchForm({
      requestType,
      url: "",
      taskType: "Guidelines Check",
      complianceType: "WCAG Standards",
      wcagVersion: nextWcagVersion,
      conformanceLevel: "AA",
      countryRegulation: DEFAULT_COUNTRY_REGULATION,
      checkPoints: nextCheckPoints,
      guidelines: ["All"],
      successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
    });

    if (requestType !== "PDF") {
      setPdfFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleTaskTypeChange = (taskType: AccessibilityRequestPayload["taskType"]) => {
    if (form.requestType === "PDF") {
      patchForm({ taskType: "Guidelines Check" });
      return;
    }

    if (taskType === "Generate Screen Reader Transcription") {
      patchForm({
        taskType,
        requestType: "Web",
        screenReader: "JAWS",
        checkPoints: CHECK_POINTS,
        guidelines: [],
        successCriteriaWeightage: {},
      });
      return;
    }

    if (taskType === "Guidelines Check") {
      const visibleGuidelines = getDynamicGuidelines(
        form.wcagVersion,
        CHECK_POINTS,
        "Web",
      );

      patchForm({
        taskType,
        checkPoints: CHECK_POINTS,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      });
      return;
    }

    patchForm({ taskType });
  };

  const handleComplianceChange = (complianceType: ComplianceType) => {
    if (complianceType === "WCAG Standards") {
      patchForm({ complianceType });
      return;
    }

    setForm((current) => {
      const countryRegulation =
        current.countryRegulation ?? DEFAULT_COUNTRY_REGULATION;
      const alignment = getCountryComplianceAlignment(countryRegulation);
      const visibleGuidelines = getDynamicGuidelines(
        alignment.wcagVersion,
        current.checkPoints,
      );

      return {
        ...current,
        complianceType,
        countryRegulation,
        wcagVersion: alignment.wcagVersion,
        conformanceLevel: alignment.conformanceLevel,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
    setErrors((current) => ({
      ...current,
      complianceType: "",
      countryRegulation: "",
      wcagVersion: "",
      conformanceLevel: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const handleCountryChange = (countryRegulation: CountryRegulation) => {
    setForm((current) => {
      const alignment = getCountryComplianceAlignment(countryRegulation);
      const visibleGuidelines = getDynamicGuidelines(
        alignment.wcagVersion,
        current.checkPoints,
      );

      return {
        ...current,
        countryRegulation,
        wcagVersion: alignment.wcagVersion,
        conformanceLevel: alignment.conformanceLevel,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
    setErrors((current) => ({
      ...current,
      countryRegulation: "",
      wcagVersion: "",
      conformanceLevel: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const handleCheckPointToggle = (checkpoint: CheckPoint) => {
    setForm((current) => {
      const currentCheckPoints =
        current.requestType === "PDF" ? PDF_CHECK_POINTS : CHECK_POINTS;
      const currentWithoutAll = current.checkPoints.filter(
        (item) => item !== "All",
      );
      let nextCheckPoints: CheckPoint[];

      if (checkpoint === "All") {
        nextCheckPoints = current.checkPoints.includes("All")
          ? []
          : currentCheckPoints;
      } else if (currentWithoutAll.includes(checkpoint)) {
        nextCheckPoints = currentWithoutAll.filter(
          (item) => item !== checkpoint,
        );
      } else {
        nextCheckPoints = [...currentWithoutAll, checkpoint];
      }

      if (nextCheckPoints.length === currentCheckPoints.length - 1) {
        nextCheckPoints = currentCheckPoints;
      }

      const visibleGuidelines = getDynamicGuidelines(
        current.wcagVersion,
        nextCheckPoints,
        current.requestType,
      );

      return {
        ...current,
        checkPoints: nextCheckPoints,
        guidelines: visibleGuidelines.length > 0 ? ["All"] : [],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
    setErrors((current) => ({
      ...current,
      checkPoints: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const selectAllCheckPoints = () => {
    setForm((current) => {
      const currentCheckPoints =
        current.requestType === "PDF" ? PDF_CHECK_POINTS : CHECK_POINTS;

      if (current.taskType === "Generate Screen Reader Transcription") {
        return {
          ...current,
          checkPoints: currentCheckPoints,
          guidelines: [],
          successCriteriaWeightage: {},
        };
      }

      const visibleGuidelines = getDynamicGuidelines(
        current.wcagVersion,
        currentCheckPoints,
        current.requestType,
      );

      return {
        ...current,
        checkPoints: currentCheckPoints,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
    setErrors((current) => ({
      ...current,
      checkPoints: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const deselectAllCheckPoints = () => {
    setForm((current) => ({
      ...current,
      checkPoints: [],
      guidelines: [],
      successCriteriaWeightage: {},
    }));
    setErrors((current) => ({
      ...current,
      checkPoints: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const handleGuidelineToggle = (guideline: SelectedGuideline) => {
    setForm((current) => {
      if (guideline === "All") {
        const shouldSelectAll = !current.guidelines.includes("All");

        return {
          ...current,
          guidelines:
            shouldSelectAll && availableGuidelines.length > 0 ? ["All"] : [],
          successCriteriaWeightage: shouldSelectAll
            ? createDefaultWeightages(availableGuidelines)
            : {},
        };
      }

      const currentIds = current.guidelines.includes("All")
        ? availableGuidelines.map((item) => item.id)
        : current.guidelines.filter(
            (item): item is Exclude<SelectedGuideline, "All"> => item !== "All",
          );

      const nextIds = currentIds.includes(guideline)
        ? currentIds.filter((item) => item !== guideline)
        : [...currentIds, guideline];

      const nextGuidelines: SelectedGuideline[] =
        availableGuidelines.length > 0 &&
        nextIds.length === availableGuidelines.length
          ? ["All"]
          : nextIds;

      const renderable = getRenderableGuidelines(
        nextGuidelines,
        availableGuidelines,
      );

      return {
        ...current,
        guidelines: nextGuidelines,
        successCriteriaWeightage: reconcileWeightages(
          renderable,
          current.successCriteriaWeightage,
        ),
      };
    });
    setErrors((current) => ({
      ...current,
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const selectAllGuidelines = () => {
    setForm((current) => ({
      ...current,
      guidelines: availableGuidelines.length > 0 ? ["All"] : [],
      successCriteriaWeightage: createDefaultWeightages(availableGuidelines),
    }));
    setErrors((current) => ({
      ...current,
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const deselectAllGuidelines = () => {
    setForm((current) => ({
      ...current,
      guidelines: [],
      successCriteriaWeightage: {},
    }));
    setErrors((current) => ({
      ...current,
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const handleWcagVersionChange = (
    wcagVersion: AccessibilityRequestPayload["wcagVersion"],
  ) => {
    setForm((current) => {
      const visibleGuidelines = getDynamicGuidelines(
        wcagVersion,
        current.checkPoints,
        current.requestType,
      );

      return {
        ...current,
        wcagVersion,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
  };

  const handlePdfStandardChange = (pdfStandard: PdfStandard) => {
    setForm((current) => {
      const wcagVersion = getWcagVersionForPdfStandard(pdfStandard);
      const visibleGuidelines = getDynamicGuidelines(
        wcagVersion,
        current.checkPoints,
        "PDF",
      );

      return {
        ...current,
        pdfStandard,
        wcagVersion,
        complianceType: "WCAG Standards",
        conformanceLevel: "AA",
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
    setErrors((current) => ({
      ...current,
      pdfStandard: "",
      wcagVersion: "",
      guidelines: "",
      successCriteriaWeightage: "",
    }));
  };

  const handleWeightageChange = (guidelineId: string, value: number) => {
    setForm((current) => {
      const nextValue = clampWeightage(value);
      const otherTotal = Object.entries(
        current.successCriteriaWeightage,
      ).reduce(
        (total, [id, weightage]) =>
          id === guidelineId
            ? total
            : total + clampWeightage(Number(weightage)),
        0,
      );
      const maxAllowed = Math.max(0, 100 - otherTotal);

      return {
        ...current,
        successCriteriaWeightage: {
          ...current.successCriteriaWeightage,
          [guidelineId]: Math.min(nextValue, maxAllowed),
        },
      };
    });
    setErrors((current) => ({ ...current, successCriteriaWeightage: "" }));
  };

  const resetWeightages = () => {
    patchForm({
      successCriteriaWeightage: createDefaultWeightages(selectedGuidelines),
    });
  };

  const handlePdfFileChange = (file: File | null) => {
    setPdfFile(file);
    setErrors((current) => ({ ...current, pdfFile: "" }));

    if (file?.name && !form.requestName?.trim()) {
      patchForm({ requestName: file.name.replace(/\.(pdf|pdfx)$/i, "") });
    }
  };

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};

    if (isPdfRequest) {
      if (!pdfFile) {
        nextErrors.pdfFile = "PDF file is required";
      } else if (!isSupportedPdfFile(pdfFile)) {
        nextErrors.pdfFile = "Only PDF and PDF/X files are supported";
      }
    } else {
      const urlError = validateUrl(form.url);

      if (urlError) {
        nextErrors.url = urlError;
      }
    }

    if (
      form.taskType === "Guidelines Check" &&
      selectedGuidelineIds.length === 0
    ) {
      nextErrors.guidelines = "At least one guideline is required";
    }

    if (
      form.taskType === "Guidelines Check" &&
      (weightageTotal <= 0 || weightageTotal > 100)
    ) {
      nextErrors.successCriteriaWeightage =
        "Total weightage must be greater than 0 and no more than 100";
    }

    if (isScreenReaderTranscription && form.checkPoints.length === 0) {
      nextErrors.checkPoints = "At least one checkpoint is required";
    }

    if (isScreenReaderTranscription && form.screenReader !== "JAWS") {
      nextErrors.screenReader = "JAWS is the supported screen reader for this POC";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const showVeraPdfPopup = (status?: VeraPdfStatus) => {
    setVeraPdfStatus(status ?? defaultVeraPdfStatus);
  };

  const verifyVeraPdfBeforePdfReport = async (): Promise<boolean> => {
    if (!isPdfRequest) {
      return true;
    }

    try {
      const response = await accessibilityService.getVeraPdfStatus();
      const status = response.data.veraPdf;

      if (!status.available) {
        showVeraPdfPopup(status);
        return false;
      }

      return true;
    } catch (error) {
      const status = getVeraPdfStatusFromError(error);

      if (status) {
        showVeraPdfPopup(status);
        return false;
      }

      throw error;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setGenerating(true);
    setErrors({});

    try {
      if (!(await verifyVeraPdfBeforePdfReport())) {
        return;
      }

      const payload: AccessibilityRequestPayload = {
        requestType: isScreenReaderTranscription ? "Web" : form.requestType,
        url: isPdfRequest ? pdfFile?.name || "" : form.url.trim(),
        taskType: isScreenReaderTranscription
          ? "Generate Screen Reader Transcription"
          : form.taskType,
        screenReader: isScreenReaderTranscription ? "JAWS" : undefined,
        complianceType: isPdfRequest ? "WCAG Standards" : form.complianceType,
        requestName: form.requestName?.trim() || undefined,
        wcagVersion:
          form.requestType === "PDF"
            ? getWcagVersionForPdfStandard(
                form.pdfStandard ?? "PDF/UA (ISO 14289)",
              )
            : form.complianceType === "Country Regulations"
            ? countryAlignment.wcagVersion
            : form.wcagVersion,
        conformanceLevel:
          form.requestType === "PDF"
            ? "AA"
            : form.complianceType === "Country Regulations"
            ? countryAlignment.conformanceLevel
            : form.conformanceLevel,
        checkPoints: normalizePayloadCheckPoints(
          form.checkPoints,
          availableCheckPoints,
        ),
        guidelines: isScreenReaderTranscription
          ? []
          : form.guidelines.includes("All")
            ? ["All"]
            : selectedGuidelineIds,
        successCriteriaWeightage: isScreenReaderTranscription
          ? {}
          : form.successCriteriaWeightage,
        countryRegulation:
          !isPdfRequest && form.complianceType === "Country Regulations"
            ? (form.countryRegulation ?? DEFAULT_COUNTRY_REGULATION)
            : undefined,
        pdfStandard: isPdfRequest ? form.pdfStandard : undefined,
        passCriteriaPercentage: isPdfRequest
          ? form.passCriteriaPercentage ?? 50
          : undefined,
        pdfMaxFailures: isPdfRequest ? form.pdfMaxFailures ?? 100 : undefined,
        sourceFileName: isPdfRequest ? pdfFile?.name : undefined,
        sourceFileSize: isPdfRequest ? pdfFile?.size : undefined,
        sourceFileMimeType: isPdfRequest ? pdfFile?.type : undefined,
      };

      const requestResponse =
        isPdfRequest && pdfFile
          ? await accessibilityService.createPdfRequest(payload, pdfFile)
          : await accessibilityService.createRequest(payload);
      const reportResponse = await accessibilityService.generateReport(
        requestResponse.data.request.requestId,
      );

      navigate(`/report/${reportResponse.data.report.reportId}`);
    } catch (error) {
      const veraPdfError = getVeraPdfStatusFromError(error);

      if (veraPdfError) {
        showVeraPdfPopup(veraPdfError);
        return;
      }

      setErrors({
        submit: getApiErrorMessage(
          error,
          "Failed to process accessibility test",
        ),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className={styles.requestPage}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.kicker}>Accessibility Workbench</p>
          <h2>Create accessibility request</h2>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            title="Request details"
            aria-label="Request details"
          >
            i
          </button>
          <button type="button" title="Save" aria-label="Save">
            S
          </button>
        </div>
      </header>

      <form className={styles.formShell} onSubmit={handleSubmit} ref={formRef}>
        {errors.submit ? (
          <div className={styles.errorBanner}>{errors.submit}</div>
        ) : null}

        <div
          className={styles.requestTypeTabs}
          role="tablist"
          aria-label="Request Type"
        >
          {REQUEST_TYPES.map((type) => (
            <button
              aria-selected={form.requestType === type}
              className={form.requestType === type ? styles.active : ""}
              key={type}
              onClick={() => handleRequestTypeChange(type)}
              role="tab"
              type="button"
            >
              {type}
            </button>
          ))}
        </div>

        {isPdfRequest ? (
          <>
            <div className={`${styles.fieldGrid} ${styles.pdfFieldGrid}`}>
              <Field label="Request Name">
                <input
                  onChange={(event) =>
                    patchForm({ requestName: event.target.value })
                  }
                  placeholder="Quarterly PDF audit"
                  type="text"
                  value={form.requestName ?? ""}
                />
              </Field>

              <Field label="Comparison Type" required>
                <select
                  onChange={(event) =>
                    handleTaskTypeChange(
                      event.target
                        .value as AccessibilityRequestPayload["taskType"],
                    )
                  }
                  value={form.taskType}
                >
                  <option value="Guidelines Check">Guidelines Check</option>
                </select>
              </Field>

              <Field label="Standards" required>
                <select
                  onChange={(event) =>
                    handlePdfStandardChange(event.target.value as PdfStandard)
                  }
                  value={form.pdfStandard ?? "PDF/UA (ISO 14289)"}
                >
                  {PDF_STANDARDS.map((standard) => (
                    <option key={standard} value={standard}>
                      {standard}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Criteria" required error={errors.checkPoints}>
                <details
                  className={styles.multiSelect}
                  open={openDropdown === "checkpoints"}
                  ref={checkPointDropdownRef}
                >
                  <summary
                    aria-expanded={openDropdown === "checkpoints"}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleDropdown("checkpoints");
                    }}
                  >
                    {summarizeCheckPoints(form.checkPoints, availableCheckPoints)}
                  </summary>
                  <div className={styles.optionPanel}>
                    <div className={styles.optionActions}>
                      <button onClick={selectAllCheckPoints} type="button">
                        Select All
                      </button>
                      <button onClick={deselectAllCheckPoints} type="button">
                        Deselect All
                      </button>
                    </div>
                    {availableCheckPoints.map((checkpoint) => (
                      <label key={checkpoint}>
                        <input
                          checked={
                            checkpoint === "All"
                              ? form.checkPoints.includes("All")
                              : form.checkPoints.includes("All") ||
                                form.checkPoints.includes(checkpoint)
                          }
                          onChange={() => handleCheckPointToggle(checkpoint)}
                          type="checkbox"
                        />
                        <span>{checkpoint}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </Field>

              <Field label="Pass Criteria %" required>
                <input
                  max={100}
                  min={0}
                  onChange={(event) =>
                    patchForm({
                      passCriteriaPercentage: clampWeightage(
                        Number(event.target.value),
                      ),
                    })
                  }
                  type="number"
                  value={form.passCriteriaPercentage ?? 50}
                />
              </Field>

              <Field label="Max Failures" required>
                <input
                  min={1}
                  onChange={(event) =>
                    patchForm({
                      pdfMaxFailures: Math.max(
                        1,
                        Math.trunc(Number(event.target.value) || 1),
                      ),
                    })
                  }
                  type="number"
                  value={form.pdfMaxFailures ?? 100}
                />
              </Field>
            </div>

            <section className={styles.pdfUploadPanel}>
              <Field label="PDF File" required error={errors.pdfFile}>
                <input
                  accept="application/pdf,.pdf,.pdfx"
                  aria-invalid={Boolean(errors.pdfFile)}
                  onChange={(event) =>
                    handlePdfFileChange(event.target.files?.[0] ?? null)
                  }
                  ref={fileInputRef}
                  type="file"
                />
              </Field>
              {pdfFile ? (
                <div className={styles.fileSummary}>
                  <strong>{pdfFile.name}</strong>
                  <span>{(pdfFile.size / 1024).toFixed(1)} KB</span>
                </div>
              ) : null}
            </section>
          </>
        ) : (
          <div className={styles.fieldGrid}>
            <Field label="Request Name">
              <input
                onChange={(event) =>
                  patchForm({ requestName: event.target.value })
                }
                placeholder="Homepage audit"
                type="text"
                value={form.requestName ?? ""}
              />
            </Field>

            <Field label="URL" required error={errors.url}>
              <input
                aria-invalid={Boolean(errors.url)}
                onChange={(event) => patchForm({ url: event.target.value })}
                placeholder="https://example.com"
                type="url"
                value={form.url}
              />
            </Field>

            <Field label="Accessibility Task Type" required>
              <select
                onChange={(event) =>
                  handleTaskTypeChange(
                    event.target
                      .value as AccessibilityRequestPayload["taskType"],
                  )
                }
                value={form.taskType}
              >
                {TASK_TYPES.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {taskType}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {!isPdfRequest && form.taskType === "Guidelines Check" ? (
          <>
            <div className={styles.fieldGrid}>
              <Field label="Accessibility Check Points" required>
                <details
                  className={styles.multiSelect}
                  open={openDropdown === "checkpoints"}
                  ref={checkPointDropdownRef}
                >
                  <summary
                    aria-expanded={openDropdown === "checkpoints"}
                    onClick={(event) => {
                      event.preventDefault();
                      toggleDropdown("checkpoints");
                    }}
                  >
                    {summarizeCheckPoints(form.checkPoints, availableCheckPoints)}
                  </summary>
                  <div className={styles.optionPanel}>
                    <div className={styles.optionActions}>
                      <button onClick={selectAllCheckPoints} type="button">
                        Select All
                      </button>
                      <button onClick={deselectAllCheckPoints} type="button">
                        Deselect All
                      </button>
                    </div>
                    {availableCheckPoints.map((checkpoint) => (
                      <label key={checkpoint}>
                        <input
                          checked={
                            checkpoint === "All"
                              ? form.checkPoints.includes("All")
                              : form.checkPoints.includes("All") ||
                                form.checkPoints.includes(checkpoint)
                          }
                          onChange={() => handleCheckPointToggle(checkpoint)}
                          type="checkbox"
                        />
                        <span>{checkpoint}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </Field>

              <div className={styles.complianceBlock}>
                <span className={styles.groupLabel}>Compliance Type :</span>
                <label>
                  <input
                    checked={form.complianceType === "WCAG Standards"}
                    name="complianceType"
                    onChange={() => handleComplianceChange("WCAG Standards")}
                    type="radio"
                  />
                  <span>WCAG Standard</span>
                </label>
                <label>
                  <input
                    checked={form.complianceType === "Country Regulations"}
                    name="complianceType"
                    onChange={() =>
                      handleComplianceChange("Country Regulations")
                    }
                    type="radio"
                  />
                  <span>Country Regulations</span>
                </label>
              </div>
            </div>

            <div className={styles.fieldGrid}>
              {form.complianceType === "WCAG Standards" ? (
                <>
                  <Field label="WCAG Version" required>
                    <select
                      onChange={(event) =>
                        handleWcagVersionChange(
                          event.target
                            .value as AccessibilityRequestPayload["wcagVersion"],
                        )
                      }
                      value={form.wcagVersion}
                    >
                      {WCAG_VERSIONS.map((version) => (
                        <option key={version} value={version}>
                          WCAG {version}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Conformance Level" required>
                    <select
                      onChange={(event) =>
                        patchForm({
                          conformanceLevel: event.target
                            .value as AccessibilityRequestPayload["conformanceLevel"],
                        })
                      }
                      value={form.conformanceLevel}
                    >
                      {CONFORMANCE_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : (
                <Field label="Country Regulations" required>
                  <select
                    onChange={(event) =>
                      handleCountryChange(
                        event.target.value as CountryRegulation,
                      )
                    }
                    value={form.countryRegulation}
                  >
                    {COUNTRY_REGULATIONS.map((regulation) => (
                      <option key={regulation} value={regulation}>
                        {COUNTRY_REGULATION_DISPLAY_NAMES[regulation]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.complianceType === "WCAG Standards" ? (
                <Field label="Guidelines" required error={errors.guidelines}>
                  <details
                    className={styles.multiSelect}
                    open={openDropdown === "guidelines"}
                    ref={guidelineDropdownRef}
                  >
                    <summary
                      aria-expanded={openDropdown === "guidelines"}
                      onClick={(event) => {
                        event.preventDefault();
                        toggleDropdown("guidelines");
                      }}
                    >
                      {summarizeGuidelines(
                        form.guidelines,
                        availableGuidelines,
                      )}
                    </summary>
                    <div className={styles.optionPanel}>
                      <div className={styles.optionActions}>
                        <button onClick={selectAllGuidelines} type="button">
                          Select All
                        </button>
                        <button onClick={deselectAllGuidelines} type="button">
                          Deselect All
                        </button>
                      </div>
                      <label>
                        <input
                          checked={form.guidelines.includes("All")}
                          disabled={availableGuidelines.length === 0}
                          onChange={() => handleGuidelineToggle("All")}
                          type="checkbox"
                        />
                        <span>All</span>
                      </label>
                      {availableGuidelines.map((guideline) => (
                        <label key={guideline.id}>
                          <input
                            checked={
                              form.guidelines.includes("All") ||
                              form.guidelines.includes(guideline.id)
                            }
                            onChange={() => handleGuidelineToggle(guideline.id)}
                            type="checkbox"
                          />
                          <span>
                            {guideline.id} - {guideline.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                </Field>
              ) : null}
            </div>

            <section className={styles.weightagePanel}>
              <header>
                <h3>Success Criteria Weightage</h3>
                <div
                  className={
                    weightageTotal > 0 && weightageTotal <= 100
                      ? styles.totalOk
                      : styles.totalError
                  }
                >
                  <span>
                    <strong>Selected Weightage: {weightageTotal} / 100</strong>
                    <small>Score is normalized within selected applicable criteria.</small>
                  </span>
                  <button
                    aria-label="Reset weightage"
                    onClick={resetWeightages}
                    title="Reset weightage"
                    type="button"
                  >
                    Reset
                  </button>
                </div>
              </header>
              {errors.successCriteriaWeightage ? (
                <p className={styles.fieldError}>
                  {errors.successCriteriaWeightage}
                </p>
              ) : null}
              <div className={styles.weightageTable}>
                <div className={styles.tableHeader}>
                  <span>Principle</span>
                  <span>Guidelines</span>
                  <span>Weightage in %</span>
                </div>
                {groupedGuidelines.map((group) =>
                  group.guidelines.map((guideline, index) => {
                    const currentWeightage =
                      form.successCriteriaWeightage[guideline.id] ?? 0;
                    const maxWeightage = Math.max(
                      0,
                      100 - (weightageTotal - currentWeightage),
                    );

                    return (
                      <div className={styles.tableRow} key={guideline.id}>
                        <span>
                          {index === 0
                            ? `${groupedGuidelines.indexOf(group) + 1}. ${group.principle}`
                            : ""}
                        </span>
                        <span>
                          {guideline.id} - {guideline.name}
                        </span>
                        <span>
                          <input
                            aria-label={`Weightage for ${guideline.name}`}
                            max={maxWeightage}
                            min={0}
                            onChange={(event) =>
                              handleWeightageChange(
                                guideline.id,
                                Number(event.target.value),
                              )
                            }
                            type="number"
                            value={currentWeightage}
                          />
                        </span>
                      </div>
                    );
                  }),
                )}
              </div>
            </section>
          </>
        ) : isScreenReaderTranscription ? (
          <div className={styles.fieldGrid}>
            <Field label="Accessibility Check Points" required error={errors.checkPoints}>
              <details
                className={styles.multiSelect}
                open={openDropdown === "checkpoints"}
                ref={checkPointDropdownRef}
              >
                <summary
                  aria-expanded={openDropdown === "checkpoints"}
                  onClick={(event) => {
                    event.preventDefault();
                    toggleDropdown("checkpoints");
                  }}
                >
                  {summarizeCheckPoints(form.checkPoints, availableCheckPoints)}
                </summary>
                <div className={styles.optionPanel}>
                  <div className={styles.optionActions}>
                    <button onClick={selectAllCheckPoints} type="button">
                      Select All
                    </button>
                    <button onClick={deselectAllCheckPoints} type="button">
                      Deselect All
                    </button>
                  </div>
                  {availableCheckPoints.map((checkpoint) => (
                    <label key={checkpoint}>
                      <input
                        checked={
                          checkpoint === "All"
                            ? form.checkPoints.includes("All")
                            : form.checkPoints.includes("All") ||
                              form.checkPoints.includes(checkpoint)
                        }
                        onChange={() => handleCheckPointToggle(checkpoint)}
                        type="checkbox"
                      />
                      <span>{checkpoint}</span>
                    </label>
                  ))}
                </div>
              </details>
            </Field>

            <Field label="Screen Reader" required error={errors.screenReader}>
              <select
                onChange={(event) =>
                  patchForm({
                    screenReader:
                      event.target.value as AccessibilityRequestPayload["screenReader"],
                  })
                }
                value={form.screenReader ?? "JAWS"}
              >
                {SCREEN_READERS.map((screenReader) => (
                  <option key={screenReader} value={screenReader}>
                    {screenReader}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className={styles.pendingMode}>
            {form.taskType} is configured as a request type and can be saved for
            later workflow automation.
          </div>
        )}

        <footer className={styles.formActions}>
          <button disabled={generating} type="submit">
            {generating ? "Generating Report..." : "Generate Report"}
          </button>
        </footer>
      </form>

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
                onClick={() => setVeraPdfStatus(null)}
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
                onClick={() => {
                  setVeraPdfStatus(null);
                  window.setTimeout(() => formRef.current?.requestSubmit(), 0);
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

interface FieldProps {
  children: ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}

function Field({
  children,
  error,
  label,
  required = false,
}: FieldProps): JSX.Element {
  return (
    <label className={styles.field}>
      <span>
        {required ? "* " : ""}
        {label}
      </span>
      {children}
      {error ? <small>{error}</small> : null}
    </label>
  );
}

function patchToEmptyErrors(
  patch: Partial<AccessibilityRequestPayload>,
): Partial<Record<keyof AccessibilityRequestPayload, string>> {
  return Object.keys(patch).reduce<
    Partial<Record<keyof AccessibilityRequestPayload, string>>
  >((cleared, key) => {
    cleared[key as keyof AccessibilityRequestPayload] = "";
    return cleared;
  }, {});
}

export default RequestForm;
