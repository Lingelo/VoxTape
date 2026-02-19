import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { MeetingApp } from '@sourdine/shared-types';
import { MEETING_URL_PATTERNS } from '@sourdine/shared-types';

const execAsync = promisify(exec);

/**
 * Browser URL detection scripts for various browsers.
 * Uses AppleScript/JXA to read the active tab URL.
 */
const BROWSER_SCRIPTS: Record<string, string> = {
  'Google Chrome': `
    tell application "Google Chrome"
      if (count of windows) > 0 then
        get URL of active tab of front window
      end if
    end tell
  `,
  Safari: `
    tell application "Safari"
      if (count of windows) > 0 then
        get URL of current tab of front window
      end if
    end tell
  `,
  Arc: `
    tell application "Arc"
      if (count of windows) > 0 then
        get URL of active tab of front window
      end if
    end tell
  `,
  'Brave Browser': `
    tell application "Brave Browser"
      if (count of windows) > 0 then
        get URL of active tab of front window
      end if
    end tell
  `,
  Firefox: `
    -- Firefox doesn't support AppleScript for URL access
    -- This script returns empty
    return ""
  `,
};

/**
 * Browser bundle IDs for checking if the browser is running.
 */
const BROWSER_BUNDLE_IDS: Record<string, string> = {
  'Google Chrome': 'com.google.Chrome',
  Safari: 'com.apple.Safari',
  Arc: 'company.thebrowser.Browser',
  'Brave Browser': 'com.brave.Browser',
  Firefox: 'org.mozilla.firefox',
};

interface BrowserMeetingInfo {
  browser: string;
  url: string;
  meetingName: string;
}

/**
 * Service for detecting web meetings in browser tabs.
 * Uses AppleScript to read the active tab URL of supported browsers.
 */
@Injectable()
export class BrowserUrlService extends EventEmitter implements OnModuleDestroy {
  private _enabled = false;
  private _pollInterval: ReturnType<typeof setInterval> | null = null;
  private _lastDetected: BrowserMeetingInfo | null = null;
  private _automationPermissionDenied = false;
  private _missedPollCount = 0;
  // Number of consecutive missed polls before considering meeting ended
  private readonly MISSED_POLL_THRESHOLD = 3;

  /**
   * Whether browser URL detection is enabled
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * Whether automation permission was denied
   */
  get automationPermissionDenied(): boolean {
    return this._automationPermissionDenied;
  }

  /**
   * Enable or disable browser URL detection.
   * When disabled, stops polling.
   */
  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (!enabled && this._pollInterval) {
      this.stopPolling();
    }
  }

  /**
   * Start polling browser URLs for meeting detection.
   * @param intervalMs Polling interval in milliseconds (default: 5000)
   */
  startPolling(intervalMs = 5000): void {
    if (this._pollInterval || !this._enabled) return;

    console.log('[BrowserUrl] Starting browser URL polling...');
    this.checkBrowserUrls();

    this._pollInterval = setInterval(() => {
      this.checkBrowserUrls();
    }, intervalMs);
  }

  /**
   * Stop polling browser URLs.
   */
  stopPolling(): void {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
      console.log('[BrowserUrl] Stopped browser URL polling');
    }
  }

  /**
   * Check all supported browsers for meeting URLs.
   */
  async checkBrowserUrls(): Promise<MeetingApp | null> {
    if (!this._enabled) return null;

    for (const [browser, script] of Object.entries(BROWSER_SCRIPTS)) {
      try {
        // First check if the browser is running
        const bundleId = BROWSER_BUNDLE_IDS[browser];
        if (bundleId) {
          const isRunning = await this.isAppRunning(bundleId);
          if (!isRunning) continue;
        }

        // Get the active tab URL
        const url = await this.executeAppleScript(script);
        if (!url || url.trim() === '') continue;

        // Check if the URL matches a meeting pattern
        const meetingInfo = this.matchMeetingUrl(url.trim(), browser);
        if (meetingInfo) {
          const wasNew = !this._lastDetected || this._lastDetected.url !== meetingInfo.url;
          this._lastDetected = meetingInfo;

          const app: MeetingApp = {
            bundleId: `browser.${browser.toLowerCase().replace(/\s+/g, '-')}`,
            name: meetingInfo.meetingName,
            pid: 0, // Browser PID not available via AppleScript
            isActive: true,
            source: 'browser',
            meetingUrl: meetingInfo.url,
          };

          if (wasNew) {
            this.emit('meeting-detected', app);
          }

          // Reset missed poll count when meeting is found
          this._missedPollCount = 0;
          return app;
        }
      } catch (err: any) {
        // Check for automation permission denied error
        if (err.message?.includes('not allowed to send keystrokes') ||
            err.message?.includes('assistive access') ||
            err.code === -1743) {
          this._automationPermissionDenied = true;
          console.warn(
            `[BrowserUrl] Automation permission denied for ${browser}. ` +
            'User needs to grant permission in System Settings > Privacy & Security > Automation'
          );
        }
        // Ignore other errors (browser not running, etc.)
      }
    }

    // No meeting found - increment miss counter
    if (this._lastDetected) {
      this._missedPollCount++;
      // Only emit 'ended' after several consecutive misses (grace period)
      // This prevents false endings when user switches tabs temporarily
      if (this._missedPollCount >= this.MISSED_POLL_THRESHOLD) {
        console.log('[BrowserUrl] Meeting ended after', this.MISSED_POLL_THRESHOLD, 'missed polls');
        this._lastDetected = null;
        this._missedPollCount = 0;
        this.emit('meeting-ended');
      }
    }

    return null;
  }

  /**
   * Check if an application is running by bundle ID.
   */
  private async isAppRunning(bundleId: string): Promise<boolean> {
    try {
      const script = `
        tell application "System Events"
          set appRunning to (count of (every process whose bundle identifier is "${bundleId}")) > 0
        end tell
        return appRunning
      `;
      const result = await this.executeAppleScript(script);
      return result.trim().toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Execute an AppleScript and return the result.
   */
  private async executeAppleScript(script: string): Promise<string> {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, {
      timeout: 5000,
    });
    return stdout.trim();
  }

  /**
   * Match a URL against known meeting URL patterns.
   */
  private matchMeetingUrl(url: string, browser: string): BrowserMeetingInfo | null {
    for (const { pattern, name } of MEETING_URL_PATTERNS) {
      if (pattern.test(url)) {
        return {
          browser,
          url,
          meetingName: `${name} (${browser})`,
        };
      }
    }
    return null;
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }
}
