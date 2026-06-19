const MAX_FINDINGS_PER_RULE = 20;

class CustomWcagRules {
  static async scan(page) {
    const domFindings = await this.scanDomRules(page);
    const reflowFindings = await this.scanReflow(page);

    return [...domFindings, ...reflowFindings];
  }

  static async scanDomRules(page) {
    return page.evaluate((maxFindingsPerRule) => {
      const VAGUE_LABELS = new Set([
        "field",
        "input",
        "text",
        "enter",
        "please enter",
      ]);
      const PERSONAL_PURPOSES = [
        {
          autocomplete: "email",
          patterns: ["email", "e-mail"],
          types: ["email"],
        },
        {
          autocomplete: "tel",
          patterns: ["phone", "mobile", "telephone", "contact number"],
          types: ["tel"],
        },
        {
          autocomplete: "name",
          patterns: ["full name", "your name", "name"],
        },
        {
          autocomplete: "given-name",
          patterns: ["first name", "given name", "forename"],
        },
        {
          autocomplete: "family-name",
          patterns: ["last name", "family name", "surname"],
        },
        {
          autocomplete: "street-address",
          patterns: ["address", "street address"],
        },
        {
          autocomplete: "address-level2",
          patterns: ["city", "town"],
        },
        {
          autocomplete: "postal-code",
          patterns: ["postal code", "postcode", "zip"],
        },
        {
          autocomplete: "country-name",
          patterns: ["country"],
        },
        {
          autocomplete: "bday",
          patterns: ["date of birth", "birth date", "birthday"],
          types: ["date"],
        },
        {
          autocomplete: "one-time-code",
          patterns: ["otp", "one time code", "verification code"],
        },
        {
          autocomplete: "current-password",
          patterns: ["password"],
          types: ["password"],
        },
      ];
      const VALID_AUTOCOMPLETE_TOKENS = new Set([
        "additional-name",
        "address-level1",
        "address-level2",
        "address-level3",
        "address-level4",
        "address-line1",
        "address-line2",
        "address-line3",
        "bday",
        "bday-day",
        "bday-month",
        "bday-year",
        "cc-additional-name",
        "cc-csc",
        "cc-exp",
        "cc-exp-month",
        "cc-exp-year",
        "cc-family-name",
        "cc-given-name",
        "cc-name",
        "cc-number",
        "cc-type",
        "country",
        "country-name",
        "current-password",
        "email",
        "family-name",
        "given-name",
        "honorific-prefix",
        "honorific-suffix",
        "impp",
        "language",
        "name",
        "new-password",
        "nickname",
        "off",
        "on",
        "one-time-code",
        "organization",
        "organization-title",
        "photo",
        "postal-code",
        "sex",
        "street-address",
        "tel",
        "tel-area-code",
        "tel-country-code",
        "tel-extension",
        "tel-local",
        "tel-local-prefix",
        "tel-local-suffix",
        "tel-national",
        "transaction-amount",
        "transaction-currency",
        "url",
        "username",
      ]);

      const results = [];
      const counts = {};

      const toLower = (value) => String(value || "").toLowerCase();
      const isNativeInteractive = (element) =>
        ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(
          element.tagName,
        );
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || 1) > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const isFocusable = (element) => {
        const tabindex = element.getAttribute("tabindex");

        if (tabindex !== null) {
          return Number.parseInt(tabindex, 10) >= 0;
        }

        if (element.matches("a[href], button, input, select, textarea, summary")) {
          return !element.disabled;
        }

        return false;
      };
      const escapeCssIdentifier = (value) =>
        String(value).replace(/([^\w-])/g, "\\$1");
      const getCssPath = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const segments = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let selector = current.nodeName.toLowerCase();

          if (current.id) {
            selector += `#${escapeCssIdentifier(current.id)}`;
            segments.unshift(selector);
            break;
          }

          if (current.classList.length > 0) {
            selector += `.${Array.from(current.classList)
              .slice(0, 2)
              .map(escapeCssIdentifier)
              .join(".")}`;
          }

          const parent = current.parentElement;

          if (parent) {
            const siblings = Array.from(parent.children).filter(
              (sibling) => sibling.nodeName === current.nodeName,
            );

            if (siblings.length > 1) {
              selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
            }
          }

          segments.unshift(selector);
          current = parent;

          if (segments.length >= 8) {
            break;
          }
        }

        return segments.join(" > ");
      };
      const getXPath = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
          return "";
        }

        const segments = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
          const parent = current.parentElement;
          const sameTagSiblings = parent
            ? Array.from(parent.children).filter(
                (sibling) => sibling.nodeName === current.nodeName,
              )
            : [];
          const position =
            sameTagSiblings.length > 1
              ? `[${sameTagSiblings.indexOf(current) + 1}]`
              : "";

          segments.unshift(`${current.nodeName.toLowerCase()}${position}`);
          current = parent;
        }

        return `/${segments.join("/")}`;
      };
      const getElementSnapshot = (element) => ({
        elementName:
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent?.trim().slice(0, 80) ||
          getCssPath(element) ||
          element.nodeName.toLowerCase(),
        selector: getCssPath(element),
        xpath: getXPath(element),
        html: element.outerHTML ? element.outerHTML.slice(0, 1000) : "",
      });
      const addResult = ({
        element,
        id,
        criterion,
        description,
        recommendation,
        severity = "Moderate",
        status = "Fail",
        type = "Automated",
        checkpoint,
        tags = [],
      }) => {
        counts[id] = counts[id] || 0;

        if (counts[id] >= maxFindingsPerRule) {
          return;
        }

        counts[id] += 1;
        results.push({
          engine: "custom-wcag-rules",
          id,
          criterion,
          description,
          recommendation,
          severity,
          status,
          type,
          checkpoint,
          tags,
          element: element ? getElementSnapshot(element) : null,
        });
      };
      const getLabelText = (input) => {
        const id = input.getAttribute("id");
        const ariaLabel = input.getAttribute("aria-label");
        const labelledBy = input.getAttribute("aria-labelledby");

        if (ariaLabel) {
          return ariaLabel.trim();
        }

        if (labelledBy) {
          return labelledBy
            .split(/\s+/)
            .map((token) => document.getElementById(token)?.textContent || "")
            .join(" ")
            .trim();
        }

        if (id) {
          const label = Array.from(document.querySelectorAll("label")).find(
            (candidate) => candidate.getAttribute("for") === id,
          );

          if (label) {
            return label.textContent.trim();
          }
        }

        const wrappingLabel = input.closest("label");

        if (wrappingLabel) {
          return wrappingLabel.textContent.trim();
        }

        return (
          input.getAttribute("placeholder") ||
          input.getAttribute("title") ||
          input.getAttribute("name") ||
          ""
        ).trim();
      };
      const getExpectedAutocomplete = (input) => {
        const inputType = toLower(input.getAttribute("type") || "text");
        const labelText = toLower(
          [
            getLabelText(input),
            input.getAttribute("name"),
            input.getAttribute("id"),
            input.getAttribute("placeholder"),
          ].join(" "),
        );

        const exactTypeMatch = PERSONAL_PURPOSES.find((purpose) =>
          (purpose.types || []).includes(inputType),
        );

        if (exactTypeMatch) {
          return exactTypeMatch.autocomplete;
        }

        const textMatch = PERSONAL_PURPOSES.find((purpose) =>
          purpose.patterns.some((pattern) => labelText.includes(pattern)),
        );

        return textMatch?.autocomplete || null;
      };
      const isInLiveRegion = (element) =>
        Boolean(
          element.closest(
            '[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]',
          ),
        );
      const hasCloseControl = (element) =>
        Boolean(
          element.querySelector(
            'button[aria-label*="close" i], button[title*="close" i], [data-dismiss], [data-close], .close',
          ),
        );
      const hasKeyboardExitHint = (element) =>
        /escape|esc|tab|keyboard/.test(toLower(element.textContent));
      const getFocusableElements = () =>
        Array.from(
          document.querySelectorAll(
            'a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="checkbox"], [role="switch"]',
          ),
        ).filter((element) => isVisible(element));

      document
        .querySelectorAll("video")
        .forEach((video) => {
          if (!video.querySelector('track[kind="descriptions"]')) {
            addResult({
              element: video,
              id: "audio-description-prerecorded-aa",
              criterion: "1.2.5",
              description:
                "Video does not expose an audio description track required for WCAG AA.",
              recommendation:
                'Add a synchronized <track kind="descriptions"> file and verify the description covers important visual information.',
              severity: "Critical",
              status: "Fail",
              type: "Semi-Automated",
              checkpoint: "Video/Audio",
              tags: ["wcag2aa", "wcag125", "video", "audio-description"],
            });
          }
        });

      document
        .querySelectorAll("iframe")
        .forEach((iframe) => {
          const src = toLower(iframe.getAttribute("src"));
          const isEmbeddedVideo = [
            "youtube",
            "youtu.be",
            "vimeo",
            "video",
            "player",
            "brightcove",
            "wistia",
            "vidyard",
            "loom",
          ].some((keyword) => src.includes(keyword));

          if (isEmbeddedVideo) {
            addResult({
              element: iframe,
              id: "embedded-video-audio-description-aa-review",
              criterion: "1.2.5",
              description:
                "Embedded video needs WCAG AA audio description verification.",
              recommendation:
                "Verify the embedded player provides a synchronized audio description track, not only a transcript.",
              severity: "Moderate",
              status: "Manual Review",
              type: "Manual",
              checkpoint: "Video/Audio",
              tags: ["wcag2aa", "wcag125", "video", "audio-description"],
            });

            addResult({
              element: iframe,
              id: "iframe-no-keyboard-trap-review",
              criterion: "2.1.2",
              description:
                "Embedded media iframe needs keyboard-trap verification.",
              recommendation:
                "Tab into and out of the iframe using only the keyboard. If exit requires non-standard keys, provide visible instructions.",
              severity: "Moderate",
              status: "Manual Review",
              type: "Manual",
              checkpoint: "Tab Order",
              tags: ["wcag2a", "wcag212", "keyboard", "iframe"],
            });
          }
        });

      document
        .querySelectorAll('input:not([type="hidden"]), textarea, select')
        .forEach((input) => {
          const inputType = toLower(input.getAttribute("type") || "text");

          if (["button", "submit", "reset", "image"].includes(inputType)) {
            return;
          }

          const labelText = getLabelText(input);
          const autocomplete = toLower(input.getAttribute("autocomplete"));
          const autocompleteTokens = autocomplete.split(/\s+/).filter(Boolean);
          const expectedAutocomplete = getExpectedAutocomplete(input);

          if (labelText && VAGUE_LABELS.has(toLower(labelText))) {
            addResult({
              element: input,
              id: "input-purpose-vague-label",
              criterion: "1.3.5",
              description: `Input label "${labelText}" does not clearly identify the input purpose.`,
              recommendation:
                "Use a label that describes the expected data, such as Email Address, Phone Number, or Date of Birth.",
              severity: "Moderate",
              status: "Warning",
              type: "Automated",
              checkpoint: "Forms",
              tags: ["wcag21aa", "wcag135", "forms"],
            });
          }

          if (expectedAutocomplete && !autocomplete) {
            addResult({
              element: input,
              id: "input-purpose-missing-autocomplete",
              criterion: "1.3.5",
              description: `Input appears to collect ${expectedAutocomplete} but does not include autocomplete="${expectedAutocomplete}".`,
              recommendation: `Add autocomplete="${expectedAutocomplete}" so browsers and assistive technologies can identify the input purpose.`,
              severity: "Moderate",
              status: "Warning",
              type: "Automated",
              checkpoint: "Forms",
              tags: ["wcag21aa", "wcag135", "forms", "autocomplete"],
            });
          }

          if (
            expectedAutocomplete &&
            autocomplete &&
            !autocompleteTokens.includes(expectedAutocomplete) &&
            autocomplete !== "off"
          ) {
            addResult({
              element: input,
              id: "input-purpose-mismatched-autocomplete",
              criterion: "1.3.5",
              description: `Input appears to collect ${expectedAutocomplete} but uses autocomplete="${autocomplete}".`,
              recommendation: `Use autocomplete="${expectedAutocomplete}" or another valid token that matches the field purpose.`,
              severity: "Moderate",
              status: "Warning",
              type: "Automated",
              checkpoint: "Forms",
              tags: ["wcag21aa", "wcag135", "forms", "autocomplete"],
            });
          }

          autocompleteTokens
            .filter(
              (token) =>
                !token.startsWith("section-") &&
                !["shipping", "billing", "home", "work", "mobile", "fax", "pager"].includes(
                  token,
                ) &&
                !VALID_AUTOCOMPLETE_TOKENS.has(token),
            )
            .forEach((token) => {
              addResult({
                element: input,
                id: "input-purpose-invalid-autocomplete",
                criterion: "1.3.5",
                description: `Input uses invalid autocomplete token "${token}".`,
                recommendation:
                  "Use a valid HTML autocomplete token such as email, name, tel, street-address, or one-time-code.",
                severity: "Serious",
                status: "Fail",
                type: "Automated",
                checkpoint: "Forms",
                tags: ["wcag21aa", "wcag135", "forms", "autocomplete"],
              });
            });
        });

      getFocusableElements().forEach((element) => {
        const role = toLower(element.getAttribute("role"));
        const tabindex = element.getAttribute("tabindex");
        const tabindexValue =
          tabindex === null ? null : Number.parseInt(tabindex, 10);
        const hasClick = element.hasAttribute("onclick");
        const hasKeyboardHandler =
          element.hasAttribute("onkeydown") ||
          element.hasAttribute("onkeyup") ||
          element.hasAttribute("onkeypress");
        const hasMouseOnly =
          (element.hasAttribute("onmouseover") ||
            element.hasAttribute("onmouseenter") ||
            element.hasAttribute("onmousemove")) &&
          !hasKeyboardHandler &&
          !element.hasAttribute("onfocus");

        if (
          !isNativeInteractive(element) &&
          (hasClick ||
            ["button", "link", "menuitem", "tab", "checkbox", "switch"].includes(
              role,
            )) &&
          !isFocusable(element)
        ) {
          addResult({
            element,
            id: "keyboard-interactive-not-focusable",
            criterion: "2.1.1",
            description:
              "Custom interactive element is not reachable from the keyboard.",
            recommendation:
              "Use a native button/link or add tabindex=\"0\" and keyboard activation handling.",
            severity: "Serious",
            status: "Fail",
            type: "Automated",
            checkpoint: "Tab Order",
            tags: ["wcag2a", "wcag211", "keyboard"],
          });
        }

        if (
          !isNativeInteractive(element) &&
          ["button", "menuitem", "tab", "checkbox", "switch"].includes(role) &&
          !hasKeyboardHandler
        ) {
          addResult({
            element,
            id: "keyboard-custom-control-needs-key-handler-review",
            criterion: "2.1.1",
            description:
              "Custom ARIA control needs keyboard activation verification.",
            recommendation:
              "Verify Enter/Space or arrow-key behavior is implemented according to the control role.",
            severity: "Moderate",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Tab Order",
            tags: ["wcag2a", "wcag211", "keyboard"],
          });
        }

        if (hasMouseOnly) {
          addResult({
            element,
            id: "keyboard-mouse-only-handler",
            criterion: "2.1.1",
            description:
              "Element has mouse-only interaction handlers without equivalent keyboard/focus handlers.",
            recommendation:
              "Provide keyboard and focus event equivalents for mouse-only behavior.",
            severity: "Serious",
            status: "Warning",
            type: "Semi-Automated",
            checkpoint: "Focus Order",
            tags: ["wcag2a", "wcag211", "keyboard"],
          });
        }

        if (tabindexValue !== null && tabindexValue > 0) {
          addResult({
            element,
            id: "focus-order-positive-tabindex",
            criterion: "2.4.3",
            description: `Element uses positive tabindex="${tabindexValue}", which can create an illogical focus order.`,
            recommendation:
              "Use natural DOM order and tabindex=\"0\" only when an element must be focusable.",
            severity: "Serious",
            status: "Fail",
            type: "Automated",
            checkpoint: "Tab Order",
            tags: ["wcag2a", "wcag243", "focus-order"],
          });
        }

        const order = Number.parseInt(window.getComputedStyle(element).order, 10);
        if (Number.isFinite(order) && order !== 0) {
          addResult({
            element,
            id: "focus-order-css-order-review",
            criterion: "2.4.3",
            description:
              "Focusable element uses CSS order, which may make visual and keyboard focus order differ.",
            recommendation:
              "Verify keyboard focus order follows the visual and logical reading sequence.",
            severity: "Moderate",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Focus Order",
            tags: ["wcag2a", "wcag243", "focus-order"],
          });
        }
      });

      document.querySelectorAll('[draggable="true"]').forEach((element) => {
        const keyboardHint = /keyboard|move|arrow|enter|space/.test(
          toLower(element.getAttribute("aria-label") || element.textContent),
        );
        const moveButton = element.parentElement?.querySelector(
          'button[aria-label*="move" i], button[title*="move" i]',
        );

        if (!keyboardHint && !moveButton) {
          addResult({
            element,
            id: "keyboard-drag-drop-needs-alternative",
            criterion: "2.1.1",
            description:
              "Drag-and-drop element does not expose an obvious keyboard alternative.",
            recommendation:
              "Provide keyboard controls or buttons that perform the same move/reorder action.",
            severity: "Serious",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Tab Order",
            tags: ["wcag2a", "wcag211", "keyboard", "drag-drop"],
          });
        }
      });

      document
        .querySelectorAll('[role="dialog"], [aria-modal="true"], .modal')
        .forEach((dialog) => {
          if (!isVisible(dialog)) {
            return;
          }

          if (!hasCloseControl(dialog) && !hasKeyboardExitHint(dialog)) {
            addResult({
              element: dialog,
              id: "keyboard-trap-dialog-exit-review",
              criterion: "2.1.2",
              description:
                "Visible dialog does not expose an obvious close control or keyboard exit instruction.",
              recommendation:
                "Ensure users can close the dialog with Escape or a keyboard-focusable close button, and return focus to the trigger.",
              severity: "Serious",
              status: "Manual Review",
              type: "Manual",
              checkpoint: "Tab Order",
              tags: ["wcag2a", "wcag212", "keyboard-trap", "dialog"],
            });
          }
        });

      document
        .querySelectorAll('[role="combobox"], [role="listbox"], [role="menu"]')
        .forEach((widget) => {
          if (!isVisible(widget)) {
            return;
          }

          if (!hasKeyboardExitHint(widget)) {
            addResult({
              element: widget,
              id: "keyboard-trap-widget-exit-review",
              criterion: "2.1.2",
              description:
                "Custom keyboard widget needs no-keyboard-trap verification.",
              recommendation:
                "Verify Tab, Shift+Tab, Escape, and arrow-key behavior allow users to leave the widget or provide instructions for non-standard exit keys.",
              severity: "Moderate",
              status: "Manual Review",
              type: "Manual",
              checkpoint: "Tab Order",
              tags: ["wcag2a", "wcag212", "keyboard-trap"],
            });
          }
        });

      getFocusableElements()
        .slice(0, 80)
        .forEach((element) => {
          const previousActive = document.activeElement;

          try {
            element.focus({ preventScroll: true });
          } catch {
            return;
          }

          if (document.activeElement !== element) {
            return;
          }

          const style = window.getComputedStyle(element);
          const hasOutline =
            style.outlineStyle !== "none" &&
            style.outlineStyle !== "hidden" &&
            Number.parseFloat(style.outlineWidth || "0") >= 1;
          const hasBoxShadow = style.boxShadow && style.boxShadow !== "none";
          const hasVisibleFocusRing = hasOutline || hasBoxShadow;

          if (!hasVisibleFocusRing) {
            addResult({
              element,
              id: "focus-visible-indicator-missing",
              criterion: "2.4.7",
              description:
                "Focusable element does not expose a detectable outline or box-shadow when focused.",
              recommendation:
                "Provide a visible focus indicator with sufficient contrast, such as an outline or focus ring.",
              severity: "Serious",
              status: "Warning",
              type: "Semi-Automated",
              checkpoint: "Focus Order",
              tags: ["wcag2aa", "wcag247", "focus-visible"],
            });
          }

          const rect = element.getBoundingClientRect();
          const points = [
            [rect.left + rect.width / 2, rect.top + rect.height / 2],
            [rect.left + 2, rect.top + 2],
            [rect.right - 2, rect.bottom - 2],
          ].filter(
            ([x, y]) =>
              x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight,
          );
          const obscured = points.some(([x, y]) => {
            const topElement = document.elementFromPoint(x, y);

            return topElement && topElement !== element && !element.contains(topElement);
          });

          if (obscured) {
            addResult({
              element,
              id: "focus-not-obscured-enhanced",
              criterion: "2.4.12",
              description:
                "Focused element appears to be partially or fully obscured by another layer.",
              recommendation:
                "Adjust sticky headers, overlays, or scroll margins so the focused element remains fully visible.",
              severity: "Serious",
              status: "Fail",
              type: "Automated",
              checkpoint: "Focus Order",
              tags: ["wcag22aaa", "wcag2412", "focus-obscured"],
            });
          }

          if (previousActive && typeof previousActive.focus === "function") {
            previousActive.focus({ preventScroll: true });
          }
        });

      document
        .querySelectorAll(
          '[role="alert"], [role="status"], [aria-live], .error, .errors, .success, .toast, .notification, .alert, [class*="error"], [class*="success"], [class*="toast"], [class*="notification"]',
        )
        .forEach((element) => {
          if (!isVisible(element)) {
            return;
          }

          const text = toLower(element.textContent);
          const looksLikeStatus =
            /error|failed|invalid|success|saved|complete|loading|processing|warning|alert/.test(
              text,
            ) || /error|success|toast|notification|alert/.test(toLower(element.className));

          if (!looksLikeStatus) {
            return;
          }

          if (!isInLiveRegion(element)) {
            addResult({
              element,
              id: "status-message-not-live-region",
              criterion: "4.1.3",
              description:
                "Status-like message is not inside a live region or status/alert role.",
              recommendation:
                'Use role="status" or aria-live="polite" for non-urgent updates, and role="alert" for urgent errors.',
              severity: "Serious",
              status: "Warning",
              type: "Semi-Automated",
              checkpoint: "ARIA",
              tags: ["wcag21aa", "wcag413", "live-region", "status"],
            });
          }
        });

      document
        .querySelectorAll('[aria-invalid="true"]')
        .forEach((input) => {
          const describedBy = input.getAttribute("aria-describedby");
          const describedElements = describedBy
            ? describedBy
                .split(/\s+/)
                .map((id) => document.getElementById(id))
                .filter(Boolean)
            : [];
          const errorElement =
            describedElements.find((element) =>
              /error|invalid|required|failed/.test(toLower(element.textContent)),
            ) || input.nextElementSibling;

          if (errorElement && !isInLiveRegion(errorElement)) {
            addResult({
              element: errorElement,
              id: "form-error-not-live-region",
              criterion: "4.1.3",
              description:
                "Form error message may not be announced because it is not in a live region.",
              recommendation:
                'Place validation feedback in role="alert" or an assertive live region, and reference it with aria-describedby.',
              severity: "Serious",
              status: "Warning",
              type: "Semi-Automated",
              checkpoint: "ARIA",
              tags: ["wcag21aa", "wcag413", "live-region", "forms"],
            });
          }
        });

      return results;
    }, MAX_FINDINGS_PER_RULE);
  }

  static async scanReflow(page) {
    const originalViewport = page.viewportSize() || { width: 1440, height: 1000 };

    try {
      await page.setViewportSize({ width: 320, height: originalViewport.height });
      await page.waitForTimeout(250);

      return await page.evaluate((maxFindingsPerRule) => {
        const results = [];
        let count = 0;

        const isVisible = (element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const escapeCssIdentifier = (value) =>
          String(value).replace(/([^\w-])/g, "\\$1");
        const getCssPath = (element) => {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return "";
          }

          const segments = [];
          let current = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();

            if (current.id) {
              selector += `#${escapeCssIdentifier(current.id)}`;
              segments.unshift(selector);
              break;
            }

            if (current.classList.length > 0) {
              selector += `.${Array.from(current.classList)
                .slice(0, 2)
                .map(escapeCssIdentifier)
                .join(".")}`;
            }

            segments.unshift(selector);
            current = current.parentElement;

            if (segments.length >= 8) {
              break;
            }
          }

          return segments.join(" > ");
        };
        const getXPath = (element) => {
          if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return "";
          }

          const segments = [];
          let current = element;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            segments.unshift(current.nodeName.toLowerCase());
            current = current.parentElement;
          }

          return `/${segments.join("/")}`;
        };
        const getElementSnapshot = (element) => ({
          elementName:
            element.getAttribute("aria-label") ||
            element.getAttribute("title") ||
            element.textContent?.trim().slice(0, 80) ||
            getCssPath(element) ||
            element.nodeName.toLowerCase(),
          selector: getCssPath(element),
          xpath: getXPath(element),
          html: element.outerHTML ? element.outerHTML.slice(0, 1000) : "",
        });
        const addResult = ({ element, description, recommendation, status }) => {
          if (count >= maxFindingsPerRule) {
            return;
          }

          count += 1;
          results.push({
            engine: "custom-wcag-rules",
            id: "reflow-horizontal-overflow",
            criterion: "1.4.10",
            description,
            recommendation,
            severity: "Serious",
            status,
            type: "Semi-Automated",
            checkpoint: "Responsive",
            tags: ["wcag21aa", "wcag1410", "reflow", "responsive"],
            element: element ? getElementSnapshot(element) : null,
          });
        };

        const root = document.documentElement;
        const pageOverflow = Math.ceil(root.scrollWidth) > window.innerWidth + 2;

        if (pageOverflow) {
          addResult({
            element: document.body,
            description: `Page requires horizontal scrolling at 320px viewport width (${Math.ceil(
              root.scrollWidth,
            )}px content width).`,
            recommendation:
              "Remove fixed-width layout constraints or add responsive wrapping so content fits at 320px without two-dimensional scrolling.",
            status: "Fail",
          });
        }

        Array.from(document.querySelectorAll("body *"))
          .filter((element) => isVisible(element))
          .forEach((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            const allowsOwnScroll =
              ["auto", "scroll"].includes(style.overflowX) ||
              ["TABLE", "PRE", "CODE"].includes(element.tagName);

            if (
              rect.left < -2 ||
              rect.right > window.innerWidth + 2 ||
              (element.scrollWidth > element.clientWidth + 2 && !allowsOwnScroll)
            ) {
              addResult({
                element,
                description:
                  "Element overflows the 320px viewport and may require horizontal scrolling.",
                recommendation:
                  "Use responsive widths, wrapping, or layout changes so the element fits within the viewport.",
                status: "Warning",
              });
            }
          });

        return results;
      }, MAX_FINDINGS_PER_RULE);
    } finally {
      await page.setViewportSize(originalViewport);
      await page.waitForTimeout(100).catch(() => {});
    }
  }
}

module.exports = CustomWcagRules;
