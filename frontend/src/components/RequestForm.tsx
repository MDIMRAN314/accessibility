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
  REQUEST_TYPES,
  TASK_TYPES,
  WCAG_VERSIONS,
  createDefaultWeightages,
  getCountryComplianceAlignment,
  getDynamicGuidelines,
  getRenderableGuidelines,
  getSelectedGuidelineIds,
  getWeightageTotal,
  groupGuidelinesByPrinciple,
  reconcileWeightages,
} from "@/data/accessibilityConfig";
import { accessibilityService, getApiErrorMessage } from "@/services/api";
import type {
  AccessibilityRequestPayload,
  CheckPoint,
  ComplianceType,
  CountryRegulation,
  GuidelineConfig,
  RequestType,
  SelectedGuideline,
} from "@/types/accessibility";
import styles from "@styles/RequestForm.module.scss";

type FormErrors = Partial<
  Record<keyof AccessibilityRequestPayload | "submit", string>
>;
type DropdownId = "checkpoints" | "guidelines";

const initialGuidelines = getDynamicGuidelines("2.2", CHECK_POINTS);

const initialForm: AccessibilityRequestPayload = {
  requestName: "",
  requestType: "Web",
  url: "",
  taskType: "Guidelines Check",
  complianceType: "WCAG Standards",
  wcagVersion: "2.2",
  countryRegulation: DEFAULT_COUNTRY_REGULATION,
  conformanceLevel: "AA",
  checkPoints: CHECK_POINTS,
  guidelines: ["All"],
  successCriteriaWeightage: createDefaultWeightages(initialGuidelines),
  scanScope: "Page",
  maxPages: 10,
  maxDepth: 2,
  autoScroll: true,
  includeSitemap: true,
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

const summarizeCheckPoints = (value: CheckPoint[]): string => {
  if (value.includes("All") || value.length === CHECK_POINTS.length) {
    return `All (${CHECK_POINTS.length - 1})`;
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

const clampWeightage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
};

function RequestForm(): JSX.Element {
  const navigate = useNavigate();
  const [form, setForm] = useState<AccessibilityRequestPayload>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [generating, setGenerating] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownId | null>(null);
  const checkPointDropdownRef = useRef<HTMLDetailsElement | null>(null);
  const guidelineDropdownRef = useRef<HTMLDetailsElement | null>(null);

  const availableGuidelines = useMemo(
    () => getDynamicGuidelines(form.wcagVersion, form.checkPoints),
    [form.checkPoints, form.wcagVersion],
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
    patchForm({ requestType });
  };

  const handleScanScopeChange = (
    scanScope: AccessibilityRequestPayload["scanScope"],
  ) => {
    patchForm({
      scanScope,
      maxPages: scanScope === "Page" ? 1 : Math.max(form.maxPages, 2),
      maxDepth: scanScope === "Page" ? 0 : Math.max(form.maxDepth, 1),
    });
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
      const currentWithoutAll = current.checkPoints.filter(
        (item) => item !== "All",
      );
      let nextCheckPoints: CheckPoint[];

      if (checkpoint === "All") {
        nextCheckPoints = current.checkPoints.includes("All")
          ? []
          : CHECK_POINTS;
      } else if (currentWithoutAll.includes(checkpoint)) {
        nextCheckPoints = currentWithoutAll.filter(
          (item) => item !== checkpoint,
        );
      } else {
        nextCheckPoints = [...currentWithoutAll, checkpoint];
      }

      if (nextCheckPoints.length === CHECK_POINTS.length - 1) {
        nextCheckPoints = CHECK_POINTS;
      }

      const visibleGuidelines = getDynamicGuidelines(
        current.wcagVersion,
        nextCheckPoints,
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
      );

      return {
        ...current,
        wcagVersion,
        guidelines: ["All"],
        successCriteriaWeightage: createDefaultWeightages(visibleGuidelines),
      };
    });
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

  const validateForm = (): boolean => {
    const nextErrors: FormErrors = {};
    const urlError = validateUrl(form.url);

    if (urlError) {
      nextErrors.url = urlError;
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

    if (
      form.scanScope === "Site" &&
      (form.maxPages < 1 || form.maxPages > 50)
    ) {
      nextErrors.maxPages = "Max pages must be between 1 and 50";
    }

    if (form.scanScope === "Site" && (form.maxDepth < 0 || form.maxDepth > 5)) {
      nextErrors.maxDepth = "Max depth must be between 0 and 5";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setGenerating(true);
    setErrors({});

    try {
      const payload: AccessibilityRequestPayload = {
        ...form,
        requestName: form.requestName?.trim() || undefined,
        wcagVersion:
          form.complianceType === "Country Regulations"
            ? countryAlignment.wcagVersion
            : form.wcagVersion,
        conformanceLevel:
          form.complianceType === "Country Regulations"
            ? countryAlignment.conformanceLevel
            : form.conformanceLevel,
        guidelines: form.guidelines.includes("All")
          ? ["All"]
          : selectedGuidelineIds,
        countryRegulation:
          form.complianceType === "Country Regulations"
            ? (form.countryRegulation ?? DEFAULT_COUNTRY_REGULATION)
            : undefined,
      };

      const requestResponse = await accessibilityService.createRequest(payload);
      const reportResponse = await accessibilityService.generateReport(
        requestResponse.data.request.requestId,
      );

      navigate(`/report/${reportResponse.data.report.reportId}`);
    } catch (error) {
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

      <form className={styles.formShell} onSubmit={handleSubmit}>
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
                patchForm({
                  taskType: event.target
                    .value as AccessibilityRequestPayload["taskType"],
                })
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

        <section className={styles.scanCoveragePanel}>
          <header>
            <h3>Scan Coverage</h3>
            <span>{form.scanScope === "Site" ? "Site" : "Page"}</span>
          </header>
          <div className={styles.coverageGrid}>
            <div
              className={styles.segmentedControl}
              role="radiogroup"
              aria-label="Scan scope"
            >
              {(
                ["Page", "Site"] as AccessibilityRequestPayload["scanScope"][]
              ).map((scope) => (
                <button
                  aria-checked={form.scanScope === scope}
                  className={form.scanScope === scope ? styles.active : ""}
                  key={scope}
                  onClick={() => handleScanScopeChange(scope)}
                  role="radio"
                  type="button"
                >
                  {scope}
                </button>
              ))}
            </div>

            <Field label="Max Pages" error={errors.maxPages}>
              <input
                disabled={form.scanScope === "Page"}
                max={50}
                min={1}
                onChange={(event) =>
                  patchForm({ maxPages: Number(event.target.value) || 1 })
                }
                type="number"
                value={form.scanScope === "Page" ? 1 : form.maxPages}
              />
            </Field>

            <Field label="Max Depth" error={errors.maxDepth}>
              <input
                disabled={form.scanScope === "Page"}
                max={5}
                min={0}
                onChange={(event) =>
                  patchForm({ maxDepth: Number(event.target.value) || 0 })
                }
                type="number"
                value={form.scanScope === "Page" ? 0 : form.maxDepth}
              />
            </Field>

            <label className={styles.toggleField}>
              <input
                checked={form.autoScroll}
                onChange={(event) =>
                  patchForm({ autoScroll: event.target.checked })
                }
                type="checkbox"
              />
              <span>Auto-scroll</span>
            </label>

            <label className={styles.toggleField}>
              <input
                checked={form.includeSitemap}
                disabled={form.scanScope === "Page"}
                onChange={(event) =>
                  patchForm({ includeSitemap: event.target.checked })
                }
                type="checkbox"
              />
              <span>Sitemap</span>
            </label>
          </div>
        </section>

        {form.taskType === "Guidelines Check" ? (
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
                    {summarizeCheckPoints(form.checkPoints)}
                  </summary>
                  <div className={styles.optionPanel}>
                    {CHECK_POINTS.map((checkpoint) => (
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
                <>
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

                  <Field label="WCAG Alignment" required>
                    <input
                      readOnly
                      type="text"
                      value={`WCAG ${countryAlignment.wcagVersion} ${countryAlignment.conformanceLevel}`}
                    />
                  </Field>
                </>
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
                  Total Weightage : {weightageTotal}/100
                  <button
                    aria-label="Reset weightage"
                    onClick={resetWeightages}
                    title="Reset weightage"
                    type="button"
                  >
                    R
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
