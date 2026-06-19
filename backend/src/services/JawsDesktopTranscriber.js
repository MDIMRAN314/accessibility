const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { chromium } = require("playwright");

const DEFAULT_CAPTURE_WAIT_MS = 12000;
const DEFAULT_NAVIGATION_TIMEOUT = 180000;
const DEFAULT_NETWORK_IDLE_TIMEOUT = 10000;
const DEFAULT_TRAVERSAL_IDLE_LIMIT = 25;
const DEFAULT_TRAVERSAL_MAX_STEPS = 500;
const DEFAULT_TRAVERSAL_STEP_WAIT_MS = 250;

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const normalize = (value) =>
  String(value || "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

class JawsDesktopTranscriber {
  static async getAvailability() {
    if (process.platform !== "win32") {
      return {
        available: false,
        reason: "Actual JAWS transcription requires Windows.",
      };
    }

    const exePath = await this.findExecutable();

    return exePath
      ? {
          available: true,
          exePath,
        }
      : {
          available: false,
          reason:
            "JAWS executable was not found. Install the JAWS demo/free 40-minute version or set JAWS_EXE_PATH.",
        };
  }

  static async generate({ url, checkPoints = ["All"] }) {
    const availability = await this.getAvailability();

    if (!availability.available) {
      throw new Error(availability.reason);
    }

    await this.startJaws(availability.exePath);

    let browserSession;
    const keepBrowserOpen = this.shouldKeepBrowserOpen();
    try {
      browserSession = await this.launchBrowser();
      const { context } = browserSession;
      const page = await context.newPage();

      page.setDefaultTimeout(DEFAULT_NAVIGATION_TIMEOUT);
      page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT);

      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_NAVIGATION_TIMEOUT,
      });

      if (!response || !response.ok()) {
        throw new Error(
          `HTTP Error: ${response ? response.status() : "No response"}`,
        );
      }

      await page
        .waitForLoadState("networkidle", {
          timeout: DEFAULT_NETWORK_IDLE_TIMEOUT,
        })
        .catch(() => {});

      const title = normalize(await page.title()) || "Untitled page";
      await page.bringToFront();
      await this.activateBrowserWindow(title);
      await wait(800);
      await this.clearSpeechHistory();
      await page.bringToFront();
      await this.activateBrowserWindow(title);
      await wait(500);
      await page.locator("body").click({ position: { x: 20, y: 20 } }).catch(() => {});
      await wait(500);
      await page.keyboard.press("Control+Home").catch(() => {});
      await wait(500);

      const transcript = await this.captureTraversalTranscript({
        page,
        title,
        url,
      });

      if (!transcript) {
        throw new Error(
          "JAWS started and the page was opened, but Speech History text could not be captured. Enable JAWS Speech History/Speech Viewer or use JAWS Inspect for a reliable production capture.",
        );
      }

      let closeWarning = "";
      if (!keepBrowserOpen) {
        closeWarning = await this.closeBrowserSessionSafely(browserSession);
      } else {
        await this.detachBrowserSession(browserSession);
      }

      const notes = [
        "Generated with actual JAWS running in Windows demo/free session mode.",
        "Capture uses JAWS virtual-cursor traversal plus Speech History extraction and is intended for POC use.",
        "For production-grade repeatability, use a licensed JAWS setup with JAWS Inspect or an approved capture API.",
      ];

      if (keepBrowserOpen) {
        notes.push(
          "The browser was left open after capture because JAWS_KEEP_BROWSER_OPEN is enabled.",
        );
      }

      if (closeWarning) {
        notes.push(closeWarning);
      }

      return this.createResult({
        url,
        pageTitle: title,
        checkPoints,
        transcript,
        mode: "actual-jaws-demo",
        notes,
      });
    } catch (error) {
      if (browserSession && !keepBrowserOpen) {
        await this.closeBrowserSession(browserSession).catch(() => {});
      }

      throw error;
    }
  }

  static async findExecutable() {
    const envPath = process.env.JAWS_EXE_PATH;

    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    const script = `
$roots = @(
  "$env:ProgramFiles\\Freedom Scientific",
  "\${env:ProgramFiles(x86)}\\Freedom Scientific",
  "$env:LOCALAPPDATA\\Freedom Scientific"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($root in $roots) {
  $match = Get-ChildItem -Path $root -Recurse -Filter jfw.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName

  if ($match) {
    Write-Output $match
    exit 0
  }
}
`;

    const output = await this.runPowerShell(script).catch(() => "");
    const exePath = normalize(output).split("\n").map(normalize).find(Boolean);

    return exePath && fs.existsSync(exePath) ? exePath : null;
  }

  static async startJaws(exePath) {
    const running = await this.isJawsRunning();

    if (running) {
      return;
    }

    const escapedPath = exePath.replace(/'/g, "''");
    await this.runPowerShell(`Start-Process -FilePath '${escapedPath}'`, 20000);

    await wait(Number(process.env.JAWS_START_WAIT_MS) || 10000);
  }

  static async isJawsRunning() {
    const output = await this.runPowerShell(
      "Get-Process -Name jfw -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Id",
    ).catch(() => "");

    return Boolean(normalize(output));
  }

  static async launchBrowser() {
    const channel = process.env.JAWS_BROWSER_CHANNEL || "msedge";
    const profileDir = this.getBrowserProfileDir(channel);
    const launchOptions = {
      channel: channel === "chromium" ? undefined : channel,
      headless: false,
      viewport: null,
      ignoreHTTPSErrors: true,
      acceptDownloads: true,
      args: [
        "--start-maximized",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-session-crashed-bubble",
        "--disable-infobars",
      ],
    };

    try {
      fs.mkdirSync(profileDir, { recursive: true });
      const context = await chromium.launchPersistentContext(
        profileDir,
        launchOptions,
      );
      return { browser: context.browser(), context, persistent: true };
    } catch (error) {
      if (channel === "chromium") {
        throw error;
      }

      const fallbackProfileDir = this.getBrowserProfileDir("chromium");
      fs.mkdirSync(fallbackProfileDir, { recursive: true });
      const context = await chromium.launchPersistentContext(fallbackProfileDir, {
        ...launchOptions,
        channel: undefined,
      });
      return { browser: context.browser(), context, persistent: true };
    }
  }

  static getBrowserProfileDir(channel) {
    if (process.env.JAWS_BROWSER_PROFILE_DIR) {
      return process.env.JAWS_BROWSER_PROFILE_DIR;
    }

    return path.resolve(
      __dirname,
      "..",
      "..",
      ".jaws-browser-profile",
      channel || "chromium",
    );
  }

  static async closeBrowserSession(browserSession) {
    await this.prepareContextForBrowserClose(browserSession.context);
    await browserSession.context.close();

    if (!browserSession.persistent && browserSession.browser) {
      await browserSession.browser.close();
    }
  }

  static async closeBrowserSessionSafely(browserSession) {
    try {
      await Promise.race([
        this.closeBrowserSession(browserSession),
        wait(Number(process.env.JAWS_BROWSER_CLOSE_TIMEOUT_MS) || 5000).then(
          () => {
            throw new Error("Browser close timed out after transcript capture");
          },
        ),
      ]);
      return "";
    } catch (error) {
      return `Browser cleanup warning after transcript capture: ${error.message}`;
    }
  }

  static async detachBrowserSession(browserSession) {
    const browser = browserSession.browser || browserSession.context.browser();
    if (browser?.isConnected?.() && typeof browser.disconnect === "function") {
      browser.disconnect();
    }
  }

  static shouldKeepBrowserOpen() {
    return String(process.env.JAWS_KEEP_BROWSER_OPEN || "").toLowerCase() === "true";
  }

  static async prepareContextForBrowserClose(context) {
    await Promise.all(
      context.pages().map(async (page) => {
        await page
          .evaluate(() => {
            window.onbeforeunload = null;
            window.addEventListener(
              "beforeunload",
              (event) => {
                event.preventDefault = () => {};
                event.returnValue = undefined;
                event.stopImmediatePropagation();
              },
              true,
            );
          })
          .catch(() => {});

        await page.close({ runBeforeUnload: false }).catch(() => {});
      }),
    );
  }

  static async activateBrowserWindow(pageTitle) {
    const escapedTitle = String(pageTitle || "").replace(/'/g, "''");
    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WindowFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
$needle = '${escapedTitle}'
$matches = New-Object System.Collections.Generic.List[object]
$callback = [WindowFocus+EnumWindowsProc]{
  param($hWnd, $lParam)
  if ([WindowFocus]::IsWindowVisible($hWnd)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][WindowFocus]::GetWindowText($hWnd, $sb, $sb.Capacity)
    $title = $sb.ToString()
    if ($title -and (($needle -and $title.Contains($needle)) -or $title -match 'Microsoft Edge|Google Chrome|Chromium')) {
      $matches.Add([pscustomobject]@{ Handle = $hWnd; Title = $title })
    }
  }
  return $true
}
[void][WindowFocus]::EnumWindows($callback, [IntPtr]::Zero)
$target = $matches | Where-Object { $needle -and $_.Title.Contains($needle) } | Select-Object -First 1
if (-not $target) {
  $target = $matches | Select-Object -First 1
}
if ($target) {
  [void][WindowFocus]::ShowWindow($target.Handle, 3)
  Start-Sleep -Milliseconds 150
  [void][WindowFocus]::SetForegroundWindow($target.Handle)
  Write-Output $target.Title
}
`;

    return this.runPowerShell(script, 15000).catch(() => "");
  }

  static async triggerSayAll() {
    await this.sendVirtualKeys([
      ["down", 45],
      ["tap", 40],
      ["up", 45],
    ]);
  }

  static async captureTraversalTranscript({ page, title, url }) {
    const traversalMode = String(process.env.JAWS_TRAVERSAL_MODE || "step")
      .trim()
      .toLowerCase();

    if (traversalMode === "say-all") {
      return this.captureSayAllTranscript({ title, url });
    }

    return this.captureStepTraversalTranscript({ page, title, url });
  }

  static async captureSayAllTranscript({ title, url }) {
    await this.triggerSayAll();
    await wait(Number(process.env.JAWS_SAY_ALL_CAPTURE_WAIT_MS) || DEFAULT_CAPTURE_WAIT_MS);
    const capturedText = await this.copySpeechHistoryText();

    return this.cleanTranscript(capturedText, { pageTitle: title, url });
  }

  static async captureStepTraversalTranscript({ page, title, url }) {
    const maxSteps =
      Number(process.env.JAWS_TRAVERSAL_MAX_STEPS) || DEFAULT_TRAVERSAL_MAX_STEPS;
    const idleLimit =
      Number(process.env.JAWS_TRAVERSAL_IDLE_LIMIT) || DEFAULT_TRAVERSAL_IDLE_LIMIT;
    const stepWaitMs =
      Number(process.env.JAWS_TRAVERSAL_STEP_WAIT_MS) || DEFAULT_TRAVERSAL_STEP_WAIT_MS;
    const collectedLines = [];
    let idleSteps = 0;

    await this.clearSpeechHistory();
    await page.bringToFront().catch(() => {});
    await this.activateBrowserWindow(title);
    await wait(300);
    await page.keyboard.press("Control+Home").catch(() => {});
    await wait(stepWaitMs * 2);

    const initialSnapshot = this.cleanTranscriptLines(
      await this.copySpeechHistoryText({ openHistoryFallback: false }),
      { pageTitle: title, url },
    );
    collectedLines.push(...initialSnapshot);

    for (let step = 0; step < maxSteps; step += 1) {
      await page.bringToFront().catch(() => {});
      if (step % 25 === 0) {
        await this.activateBrowserWindow(title);
      }
      await this.sendVirtualKeys([["tap", 40]]);
      await wait(stepWaitMs);

      const snapshot = this.cleanTranscriptLines(
        await this.copySpeechHistoryText({ openHistoryFallback: false }),
        { pageTitle: title, url },
      );
      const mergedLines = this.mergeLineSequences(collectedLines, snapshot);
      const grew = mergedLines.length > collectedLines.length;

      collectedLines.splice(0, collectedLines.length, ...mergedLines);
      idleSteps = grew ? 0 : idleSteps + 1;

      if (this.hasReachedDocumentEnd(snapshot) && idleSteps >= 1) {
        break;
      }

      if (step >= 20 && idleSteps >= idleLimit) {
        break;
      }
    }

    return collectedLines.join("\n").trim();
  }

  static mergeLineSequences(existingLines, snapshotLines) {
    if (!snapshotLines.length) {
      return existingLines;
    }

    if (!existingLines.length) {
      return snapshotLines;
    }

    const maxOverlap = Math.min(existingLines.length, snapshotLines.length);

    for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
      let matches = true;

      for (let index = 0; index < overlap; index += 1) {
        if (
          existingLines[existingLines.length - overlap + index] !==
          snapshotLines[index]
        ) {
          matches = false;
          break;
        }
      }

      if (matches) {
        return [...existingLines, ...snapshotLines.slice(overlap)];
      }
    }

    return [...existingLines, ...snapshotLines];
  }

  static hasReachedDocumentEnd(lines) {
    return lines
      .slice(-5)
      .some((line) => /\b(bottom|end of document|end of page)\b/i.test(line));
  }

  static async clearSpeechHistory() {
    await this.sendJawsLayerCommand([
      ["down", 16],
      ["tap", 72],
      ["up", 16],
    ]);
    await wait(500);
  }

  static async copySpeechHistoryText({ openHistoryFallback = true } = {}) {
    await this.setClipboardText("");
    await this.sendJawsLayerCommand([
      ["down", 17],
      ["tap", 72],
      ["up", 17],
    ]);
    await wait(700);

    const clipboardText = await this.getClipboardText().catch(() => "");

    if (normalize(clipboardText)) {
      return clipboardText;
    }

    if (!openHistoryFallback) {
      return "";
    }

    await this.openSpeechHistory();
    return this.captureSpeechHistoryText();
  }

  static async sendJawsLayerCommand(commandActions) {
    await this.sendVirtualKeys([
      ["down", 45],
      ["tap", 32],
      ["up", 45],
      ["sleep", 300],
      ...commandActions,
    ]);
  }

  static async openSpeechHistory() {
    await this.sendJawsLayerCommand([["tap", 72]]);
    await wait(1500);
  }

  static async captureSpeechHistoryText() {
    const uiText = await this.readForegroundWindowText().catch(() => "");

    if (normalize(uiText)) {
      return uiText;
    }

    await this.sendVirtualKeys([
      ["down", 17],
      ["tap", 65],
      ["up", 17],
      ["down", 17],
      ["tap", 67],
      ["up", 17],
    ]);
    await wait(400);

    return this.getClipboardText().catch(() => "");
  }

  static getClipboardText() {
    return this.runPowerShell(
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::GetText()",
    );
  }

  static setClipboardText(value) {
    const encoded = Buffer.from(String(value || ""), "utf16le").toString("base64");

    return this.runPowerShell(
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([System.Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encoded}')))`,
    ).catch(() => "");
  }

  static async readForegroundWindowText() {
    const script = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class ForegroundWindow {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
"@

$handle = [ForegroundWindow]::GetForegroundWindow()
if ($handle -eq [IntPtr]::Zero) { exit 0 }

$root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
if ($null -eq $root) { exit 0 }

$items = New-Object System.Collections.Generic.List[string]
if ($root.Current.Name) { $items.Add($root.Current.Name) }

$descendants = $root.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  [System.Windows.Automation.Condition]::TrueCondition
)

foreach ($item in $descendants) {
  if ($item.Current.Name) {
    $items.Add($item.Current.Name)
  }

  $valuePattern = $null
  if ($item.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
    if ($valuePattern.Current.Value) {
      $items.Add($valuePattern.Current.Value)
    }
  }

  $textPattern = $null
  if ($item.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)) {
    $text = $textPattern.DocumentRange.GetText(-1)
    if ($text) {
      $items.Add($text)
    }
  }
}

$items | Where-Object { $_ } | Select-Object -Unique
`;

    return this.runPowerShell(script, 20000);
  }

  static async sendVirtualKeys(actions) {
    const actionScript = actions
      .map(([action, value]) => {
        if (action === "sleep") {
          return `Start-Sleep -Milliseconds ${Number(value) || 0}`;
        }

        if (action === "down") {
          return `[KeyboardInput]::Down(${Number(value)})`;
        }

        if (action === "up") {
          return `[KeyboardInput]::Up(${Number(value)})`;
        }

        return `[KeyboardInput]::Tap(${Number(value)})`;
      })
      .join("\n");

    const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class KeyboardInput {
  [DllImport("user32.dll")]
  private static extern void keybd_event(byte bVk, byte bScan, int dwFlags, UIntPtr dwExtraInfo);
  private const int KEYEVENTF_KEYUP = 0x0002;
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); System.Threading.Thread.Sleep(80); Up(vk); }
}
"@
${actionScript}
`;

    await this.runPowerShell(script, 10000);
  }

  static runPowerShell(script, timeout = 15000) {
    return new Promise((resolve, reject) => {
      execFile(
        "powershell.exe",
        ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
        {
          timeout,
          windowsHide: false,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
            return;
          }

          resolve(stdout || "");
        },
      );
    });
  }

  static cleanTranscript(value, context = {}) {
    return this.cleanTranscriptLines(value, context).join("\n").trim();
  }

  static cleanTranscriptLines(value, context = {}) {
    const blockedPatterns = [
      /^speech history$/i,
      /^speech history cleared$/i,
      /^copy speech history to clipboard$/i,
      /^jaws$/i,
      /^[\uFFFC]+$/i,
      /^app bar$/i,
      /^view site information$/i,
      /^address and search bar$/i,
      /^add this page to favorites/i,
      /^favorites$/i,
      /^settings and more/i,
      /^for quick access, place your favorites here/i,
      /^manage favorites now$/i,
      /^tab bar$/i,
      /^search tabs$/i,
      /^close tab$/i,
      /^new tab$/i,
    ];

    const lines = String(value || "")
      .split(/\r?\n/)
      .map(normalize)
      .filter((line) => line && !blockedPatterns.some((pattern) => pattern.test(line)))
      .filter((line) => {
        if (/\s-\s.*(Microsoft.*Edge|Google Chrome|Chromium)$/i.test(line)) {
          return false;
        }

        return true;
      })
      .filter(Boolean);

    return this.extractPageSpeechLines(lines, context);
  }

  static extractPageSpeechLines(lines, { pageTitle, url } = {}) {
    if (!lines.length) {
      return lines;
    }

    const normalizedTitle = normalize(pageTitle);
    const normalizedUrl = normalize(url).replace(/\/$/, "");
    const urlIndex = lines.findIndex((line) => {
      const normalizedLine = normalize(line).replace(/\/$/, "");
      return (
        normalizedUrl &&
        (normalizedLine === normalizedUrl || normalizedLine.startsWith(normalizedUrl))
      );
    });

    let startIndex = 0;

    if (urlIndex > 0) {
      startIndex =
        normalizedTitle &&
        lines[urlIndex - 1].toLowerCase() === normalizedTitle.toLowerCase()
          ? urlIndex - 1
          : urlIndex + 1;
    } else if (normalizedTitle) {
      const titleIndex = lines.findIndex(
        (line) => line.toLowerCase() === normalizedTitle.toLowerCase(),
      );

      if (titleIndex >= 0) {
        startIndex = titleIndex;
      }
    }

    const endPatterns = [
      /^tab bar$/i,
      /^search tabs$/i,
      /^close tab$/i,
      /^new tab$/i,
      /^app bar$/i,
      /^address and search bar$/i,
    ];
    const endOffset = lines
      .slice(startIndex + 1)
      .findIndex((line) => endPatterns.some((pattern) => pattern.test(line)));
    const endIndex = endOffset >= 0 ? startIndex + 1 + endOffset : lines.length;

    return lines.slice(startIndex, endIndex);
  }

  static createResult({
    url,
    pageTitle,
    checkPoints,
    transcript,
    mode,
    notes,
  }) {
    const lines = transcript ? transcript.split(/\n/).filter(Boolean) : [];

    return {
      screenReader: "JAWS",
      mode,
      url,
      pageTitle,
      generatedAt: new Date().toISOString(),
      selectedCheckPoints: checkPoints,
      actualContent: transcript,
      sections: [
        {
          checkpoint: "JAWS Speech Output",
          lines: lines.slice(0, 250),
        },
      ],
      stats: this.createStats(transcript),
      notes,
    };
  }

  static createStats(actualContent = "") {
    const trimmed = actualContent.trim();

    return {
      characters: trimmed.length,
      lines: trimmed ? trimmed.split(/\n/).length : 0,
      words: trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0,
    };
  }
}

module.exports = JawsDesktopTranscriber;
