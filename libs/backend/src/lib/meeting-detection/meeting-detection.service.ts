import { Injectable, OnModuleDestroy, Inject, Optional } from '@nestjs/common';
import { EventEmitter } from 'events';
import type {
  MeetingApp,
  MeetingDetectionEvent,
  MeetingDetectionConfig,
} from '@voxtape/shared-types';
import {
  DEFAULT_MEETING_DETECTION_CONFIG,
  MEETING_APP_BUNDLE_IDS,
} from '@voxtape/shared-types';
import { BrowserUrlService } from './browser-url.service.js';

/**
 * Service for detecting running meeting applications.
 * Polls for meeting apps and emits events when meetings are detected/ended.
 */
@Injectable()
export class MeetingDetectionService extends EventEmitter implements OnModuleDestroy {
  private _config: MeetingDetectionConfig = { ...DEFAULT_MEETING_DETECTION_CONFIG };
  private _detectedApps: MeetingApp[] = [];
  private _pollInterval: ReturnType<typeof setInterval> | null = null;
  private _isMonitoring = false;

  constructor(
    @Optional() @Inject(BrowserUrlService)
    private readonly browserUrlService?: BrowserUrlService
  ) {
    super();

    // Listen to browser URL service events if available
    if (this.browserUrlService) {
      this.browserUrlService.on('meeting-detected', (app: MeetingApp) => {
        this.handleBrowserMeetingDetected(app);
      });
      this.browserUrlService.on('meeting-ended', () => {
        this.handleBrowserMeetingEnded();
      });
    }
  }

  /**
   * Get currently detected meeting apps
   */
  get detectedApps(): MeetingApp[] {
    return [...this._detectedApps];
  }

  /**
   * Check if monitoring is active
   */
  get isMonitoring(): boolean {
    return this._isMonitoring;
  }

  /**
   * Get current configuration
   */
  get config(): MeetingDetectionConfig {
    return { ...this._config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MeetingDetectionConfig>): void {
    this._config = { ...this._config, ...config };

    // If monitoring and enabled state changed, update accordingly
    if (this._isMonitoring && !this._config.enabled) {
      this.stopMonitoring();
    } else if (!this._isMonitoring && this._config.enabled) {
      this.startMonitoring();
    }

    // Update browser URL detection
    if (this.browserUrlService) {
      this.browserUrlService.setEnabled(this._config.detectWebMeetings);
      if (this._isMonitoring && this._config.detectWebMeetings) {
        this.browserUrlService.startPolling(this._config.pollIntervalMs);
      } else {
        this.browserUrlService.stopPolling();
      }
    }
  }

  /**
   * Start monitoring for meeting applications
   */
  startMonitoring(): void {
    if (this._isMonitoring || !this._config.enabled) return;

    console.log('[MeetingDetection] Starting monitoring...');
    this._isMonitoring = true;

    // Initial check
    this.checkForMeetingApps();

    // Set up polling
    this._pollInterval = setInterval(() => {
      this.checkForMeetingApps();
    }, this._config.pollIntervalMs);

    // Start browser URL monitoring if enabled
    if (this.browserUrlService && this._config.detectWebMeetings) {
      this.browserUrlService.setEnabled(true);
      this.browserUrlService.startPolling(this._config.pollIntervalMs);
    }
  }

  /**
   * Stop monitoring for meeting applications
   */
  stopMonitoring(): void {
    if (!this._isMonitoring) return;

    console.log('[MeetingDetection] Stopping monitoring...');

    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }

    // Stop browser URL monitoring
    if (this.browserUrlService) {
      this.browserUrlService.stopPolling();
    }

    this._isMonitoring = false;
    this._detectedApps = [];
  }

  /**
   * Check for running meeting apps using native module
   */
  private checkForMeetingApps(): void {
    let nativeApps: Array<{
      bundleId: string;
      name: string;
      pid: number;
      isActive: boolean;
    }> = [];

    try {
      const nativeAudio = require('@voxtape/native-audio-capture');
      nativeApps = nativeAudio.getRunningMeetingApps() || [];
    } catch (err) {
      // Native module not available - continue without native detection
      console.warn('[MeetingDetection] Native module not available:', err);
      return;
    }

    // Convert native apps to MeetingApp format
    const currentApps: MeetingApp[] = nativeApps.map((app) => ({
      bundleId: app.bundleId,
      name: MEETING_APP_BUNDLE_IDS[app.bundleId] || app.name,
      pid: app.pid,
      isActive: app.isActive,
      source: 'process' as const,
    }));

    // Check for changes
    const previousIds = new Set(this._detectedApps.map((a) => a.bundleId));
    const currentIds = new Set(currentApps.map((a) => a.bundleId));

    const newApps = currentApps.filter((a) => !previousIds.has(a.bundleId));
    const endedApps = this._detectedApps.filter((a) => !currentIds.has(a.bundleId));

    // Update state
    this._detectedApps = currentApps;

    // Emit events
    if (newApps.length > 0) {
      const event: MeetingDetectionEvent = {
        type: 'detected',
        apps: currentApps,
        timestamp: Date.now(),
      };
      console.log(
        '[MeetingDetection] Meeting detected:',
        newApps.map((a) => a.name).join(', '),
      );
      this.emit('detected', event);
      this.emit('change', event);
    }

    if (endedApps.length > 0 && currentApps.length === 0) {
      const event: MeetingDetectionEvent = {
        type: 'ended',
        apps: [],
        timestamp: Date.now(),
      };
      console.log(
        '[MeetingDetection] Meeting ended:',
        endedApps.map((a) => a.name).join(', '),
      );
      this.emit('ended', event);
      this.emit('change', event);
    } else if (endedApps.length > 0 || newApps.length > 0) {
      // Some apps changed but still have meetings
      const event: MeetingDetectionEvent = {
        type: 'changed',
        apps: currentApps,
        timestamp: Date.now(),
      };
      this.emit('change', event);
    }
  }

  /**
   * Force an immediate check for meeting apps
   */
  forceCheck(): MeetingApp[] {
    this.checkForMeetingApps();
    return this.detectedApps;
  }

  /**
   * Handle browser meeting detected event
   */
  private handleBrowserMeetingDetected(app: MeetingApp): void {
    // Check if we already have this browser meeting
    const existingIndex = this._detectedApps.findIndex(
      (a) => a.source === 'browser' && a.meetingUrl === app.meetingUrl
    );

    if (existingIndex === -1) {
      // New browser meeting
      const previousApps = [...this._detectedApps];
      this._detectedApps = [...previousApps, app];

      const event: MeetingDetectionEvent = {
        type: 'detected',
        apps: this._detectedApps,
        timestamp: Date.now(),
      };

      console.log('[MeetingDetection] Browser meeting detected:', app.name);
      this.emit('detected', event);
      this.emit('change', event);
    }
  }

  /**
   * Handle browser meeting ended event
   */
  private handleBrowserMeetingEnded(): void {
    // Remove all browser-detected meetings
    const hadBrowserMeetings = this._detectedApps.some((a) => a.source === 'browser');
    if (!hadBrowserMeetings) return;

    this._detectedApps = this._detectedApps.filter((a) => a.source !== 'browser');

    const event: MeetingDetectionEvent = {
      type: this._detectedApps.length === 0 ? 'ended' : 'changed',
      apps: this._detectedApps,
      timestamp: Date.now(),
    };

    console.log('[MeetingDetection] Browser meeting ended');
    if (event.type === 'ended') {
      this.emit('ended', event);
    }
    this.emit('change', event);
  }

  onModuleDestroy(): void {
    this.stopMonitoring();
  }
}
