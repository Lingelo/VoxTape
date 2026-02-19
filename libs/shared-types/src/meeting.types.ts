/**
 * Meeting detection types for VoxTape
 */

/**
 * Information about a detected meeting application
 */
export interface MeetingApp {
  /** Bundle identifier (e.g., "us.zoom.xos") */
  bundleId: string;
  /** Human-readable app name (e.g., "Zoom") */
  name: string;
  /** Process ID */
  pid: number;
  /** Whether the app window is currently active/frontmost */
  isActive: boolean;
  /** Source of detection: 'process' for native apps, 'browser' for web meetings */
  source: 'process' | 'browser';
  /** For browser-detected meetings: the URL pattern matched */
  meetingUrl?: string;
}

/**
 * Event emitted when meeting detection state changes
 */
export interface MeetingDetectionEvent {
  /** Type of change */
  type: 'detected' | 'ended' | 'changed';
  /** Currently detected meeting apps */
  apps: MeetingApp[];
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Configuration for meeting detection
 */
export interface MeetingDetectionConfig {
  /** Whether meeting detection is enabled */
  enabled: boolean;
  /** Whether to detect web meetings in browsers (requires Automation permission) */
  detectWebMeetings: boolean;
  /** Whether to show notification when meeting is detected */
  showNotification: boolean;
  /** Duration before notification auto-dismisses (ms) */
  notificationDurationMs: number;
  /** Polling interval for process checking (ms) */
  pollIntervalMs: number;
}

/**
 * Default meeting detection configuration
 */
export const DEFAULT_MEETING_DETECTION_CONFIG: MeetingDetectionConfig = {
  enabled: true,
  detectWebMeetings: false, // Disabled by default as it requires permissions
  showNotification: true,
  notificationDurationMs: 10000,
  pollIntervalMs: 3000,
};

/**
 * Known meeting application bundle identifiers
 */
export const MEETING_APP_BUNDLE_IDS: Record<string, string> = {
  'us.zoom.xos': 'Zoom',
  'com.microsoft.teams': 'Microsoft Teams',
  'com.microsoft.teams2': 'Microsoft Teams',
  'com.tinyspeck.slackmacgap': 'Slack',
  'com.hnc.Discord': 'Discord',
  'com.cisco.webexmeetingsapp': 'Webex',
  'com.skype.skype': 'Skype',
  'com.apple.FaceTime': 'FaceTime',
};

/**
 * URL patterns for detecting web meetings
 */
export const MEETING_URL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /meet\.google\.com\/[a-z\-]+/i, name: 'Google Meet' },
  { pattern: /teams\.microsoft\.com\/.*meeting/i, name: 'Microsoft Teams' },
  { pattern: /teams\.live\.com\/meet/i, name: 'Microsoft Teams' },
  { pattern: /zoom\.us\/(j|wc|my)\//i, name: 'Zoom' },
  { pattern: /app\.slack\.com\/huddle/i, name: 'Slack Huddle' },
  { pattern: /whereby\.com\//i, name: 'Whereby' },
  { pattern: /webex\.com\/meet/i, name: 'Webex' },
];
