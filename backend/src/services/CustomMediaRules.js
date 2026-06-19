class CustomMediaRules {
  static async scan(page) {
    return page.evaluate(() => {
      const TRANSCRIPT_SELECTORS = [
        'a[href*="transcript"]',
        "[data-transcript]",
        '[role="doc-note"]',
        ".transcript",
        '[aria-label*="transcript"]',
      ];
      const VAGUE_TITLES = new Set([
        "iframe",
        "frame",
        "content",
        "embed",
        "widget",
        "page",
      ]);

      const toLower = (value) => String(value || "").toLowerCase();

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
          const tagName = current.nodeName.toLowerCase();
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

          segments.unshift(`${tagName}${position}`);
          current = parent;
        }

        return `/${segments.join("/")}`;
      };

      const getSearchScope = (element) =>
        element.closest("article, section, main, [role='main'], .media, .video, .audio") ||
        element.parentElement ||
        document.body;

      const findTranscript = (element) => {
        const scope = getSearchScope(element);

        for (const selector of TRANSCRIPT_SELECTORS) {
          const match = scope.querySelector(selector);

          if (match) {
            return match;
          }
        }

        return null;
      };

      const getElementSnapshot = (element) => {
        const selector = getCssPath(element);
        const title = element.getAttribute("title");
        const ariaLabel = element.getAttribute("aria-label");
        const src = element.getAttribute("src");

        return {
          elementName:
            title ||
            ariaLabel ||
            selector ||
            src ||
            element.nodeName.toLowerCase(),
          selector,
          xpath: getXPath(element),
          html: element.outerHTML ? element.outerHTML.slice(0, 1000) : "",
        };
      };

      const isYoutube = (src) =>
        src.includes("youtube.com") || src.includes("youtu.be");
      const isVimeo = (src) => src.includes("vimeo.com");
      const isVideoUrl = (src) =>
        [
          "youtube",
          "youtu.be",
          "vimeo",
          "video",
          "player",
          "mp4",
          "webm",
          "brightcove",
          "wistia",
          "vidyard",
          "loom",
        ].some((keyword) => src.includes(keyword));
      const isInteractiveEmbed = (src) =>
        [
          "maps",
          "youtube",
          "youtu.be",
          "vimeo",
          "player",
          "docs.google",
          ".pdf",
        ].some((keyword) => src.includes(keyword));

      const results = [];
      const addResult = ({
        element,
        id,
        criterion,
        description,
        recommendation,
        severity,
        status = "Fail",
        type = "Automated",
        checkpoint,
        tags = [],
      }) => {
        results.push({
          id,
          criterion,
          description,
          recommendation,
          severity,
          status,
          type,
          checkpoint,
          tags,
          element: getElementSnapshot(element),
        });
      };

      document.querySelectorAll("iframe").forEach((iframe) => {
        const src = toLower(iframe.getAttribute("src"));
        const title = iframe.getAttribute("title");
        const normalizedTitle = toLower(title).trim();

        if (!title || VAGUE_TITLES.has(normalizedTitle) || title.trim().length < 5) {
          addResult({
            element: iframe,
            id: "iframe-has-descriptive-title",
            criterion: "4.1.2",
            description: !title
              ? "iFrame is missing a descriptive title attribute."
              : `iFrame title "${title}" is not descriptive enough.`,
            recommendation:
              'Add a title that describes the embedded content, such as title="Google Maps: Office Location".',
            severity: "Serious",
            checkpoint: "ARIA",
            tags: ["wcag2a", "wcag412", "iframe", "custom-media"],
          });
        }

        if (isYoutube(src) && !src.includes("cc_load_policy=1")) {
          addResult({
            element: iframe,
            id: "captions-in-embedded-video",
            criterion: "1.2.2",
            description:
              "YouTube embedded video does not request captions by default.",
            recommendation:
              "Add the cc_load_policy=1 parameter to the YouTube iframe URL and verify caption quality.",
            severity: "Critical",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag122", "video", "caption", "custom-media"],
          });
        }

        if (isVimeo(src)) {
          addResult({
            element: iframe,
            id: "vimeo-captions-manual-review",
            criterion: "1.2.2",
            description:
              "Vimeo embedded video captions require manual verification in the video settings.",
            recommendation:
              "Verify captions are enabled and accurate in Vimeo, and confirm users can access them in the embedded player.",
            severity: "Moderate",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag122", "video", "caption", "custom-media"],
          });
        }

        if (isVideoUrl(src) && !findTranscript(iframe)) {
          addResult({
            element: iframe,
            id: "embedded-video-has-transcript-or-description",
            criterion: "1.2.3",
            description:
              "Embedded video does not have a nearby transcript or audio description reference.",
            recommendation:
              "Provide a transcript link or audio description alternative adjacent to the embedded video.",
            severity: "Critical",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag123", "video", "audio-description", "custom-media"],
          });
        }

        if (isInteractiveEmbed(src)) {
          addResult({
            element: iframe,
            id: "iframe-keyboard-accessible",
            criterion: "2.1.1",
            description:
              "Embedded iframe content needs keyboard accessibility verification.",
            recommendation:
              "Tab into the iframe, operate all controls with the keyboard, and verify focus can leave the embedded content.",
            severity: "Moderate",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Tab Order",
            tags: ["wcag2a", "wcag211", "keyboard", "iframe", "custom-media"],
          });
        }
      });

      document.querySelectorAll("video").forEach((video) => {
        const captionTracks = video.querySelectorAll('track[kind="captions"]');
        const descriptionTracks = video.querySelectorAll(
          'track[kind="descriptions"]',
        );

        if (captionTracks.length === 0) {
          addResult({
            element: video,
            id: "captions-in-html5-video",
            criterion: "1.2.2",
            description: "HTML5 video is missing a captions track.",
            recommendation:
              'Add a <track kind="captions" src="captions.vtt" srclang="en" label="English"> element.',
            severity: "Critical",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag122", "video", "caption", "custom-media"],
          });
        }

        if (descriptionTracks.length === 0 && !findTranscript(video)) {
          addResult({
            element: video,
            id: "video-has-audio-description-or-transcript",
            criterion: "1.2.3",
            description:
              "Video does not have an audio description track or nearby transcript.",
            recommendation:
              'Add a <track kind="descriptions"> element or provide a transcript/media alternative next to the video.',
            severity: "Critical",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag123", "video", "audio-description", "custom-media"],
          });
        }
      });

      document.querySelectorAll("audio").forEach((audio) => {
        if (!findTranscript(audio)) {
          addResult({
            element: audio,
            id: "audio-element-has-transcript",
            criterion: "1.2.1",
            description: "Audio-only content does not have a nearby transcript.",
            recommendation:
              'Add an adjacent transcript link or inline transcript, for example <a href="transcript.txt" data-transcript>Transcript</a>.',
            severity: "Critical",
            status: "Manual Review",
            type: "Manual",
            checkpoint: "Video/Audio",
            tags: ["wcag2a", "wcag121", "audio", "transcript", "custom-media"],
          });
        }
      });

      document.querySelectorAll("embed").forEach((embed) => {
        const title = embed.getAttribute("title");
        const ariaLabel = embed.getAttribute("aria-label");
        const ariaLabelledBy = embed.getAttribute("aria-labelledby");

        if (!title && !ariaLabel && !ariaLabelledBy) {
          addResult({
            element: embed,
            id: "embed-element-labeled",
            criterion: "4.1.2",
            description: "Embed element is missing an accessible name.",
            recommendation:
              'Add title, aria-label, or aria-labelledby that describes the embedded content.',
            severity: "Serious",
            checkpoint: "ARIA",
            tags: ["wcag2a", "wcag412", "embed", "custom-media"],
          });
        }
      });

      return results;
    });
  }
}

module.exports = CustomMediaRules;
