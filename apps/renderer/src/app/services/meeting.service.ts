import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type { MeetingApp, MeetingDetectionEvent } from '@sourdine/shared-types';

interface SourdineApi {
  meeting: {
    getDetected(): Promise<MeetingApp[]>;
    isMonitoring(): Promise<boolean>;
    startMonitoring(): void;
    stopMonitoring(): void;
    forceCheck(): Promise<MeetingApp[]>;
    onDetected(cb: (event: MeetingDetectionEvent) => void): () => void;
    onEnded(cb: (event: MeetingDetectionEvent) => void): () => void;
    onChange(cb: (event: MeetingDetectionEvent) => void): () => void;
    onStartRecordingRequested(cb: (data: { meetingName?: string }) => void): () => void;
  };
}

/**
 * Service for managing meeting detection in the renderer process.
 * Listens to IPC events and provides observables for meeting state.
 */
@Injectable({ providedIn: 'root' })
export class MeetingService implements OnDestroy {
  private readonly api: SourdineApi['meeting'] | undefined;
  private cleanups: (() => void)[] = [];

  private readonly _detectedApps$ = new BehaviorSubject<MeetingApp[]>([]);
  private readonly _detected$ = new Subject<MeetingDetectionEvent>();
  private readonly _ended$ = new Subject<MeetingDetectionEvent>();
  private readonly _change$ = new Subject<MeetingDetectionEvent>();
  private readonly _startRecordingRequested$ = new Subject<{ meetingName?: string }>();

  /** Currently detected meeting apps */
  readonly detectedApps$: Observable<MeetingApp[]> = this._detectedApps$.asObservable();
  /** Emits when a new meeting is detected */
  readonly detected$: Observable<MeetingDetectionEvent> = this._detected$.asObservable();
  /** Emits when all meetings have ended */
  readonly ended$: Observable<MeetingDetectionEvent> = this._ended$.asObservable();
  /** Emits on any meeting state change */
  readonly change$: Observable<MeetingDetectionEvent> = this._change$.asObservable();
  /** Emits when user clicks system notification to start recording */
  readonly startRecordingRequested$: Observable<{ meetingName?: string }> = this._startRecordingRequested$.asObservable();

  private readonly ngZone = inject(NgZone);

  /** Track if notification has been dismissed for current meeting session */
  private _notificationDismissed = false;
  /** Track which meeting apps the user has been notified about */
  private _notifiedBundleIds = new Set<string>();

  constructor() {
    this.api = (window as Window & { sourdine?: { meeting?: SourdineApi['meeting'] } }).sourdine?.meeting;
    if (!this.api) {
      console.warn('[MeetingService] Meeting API not available');
      return;
    }

    // Subscribe to IPC events
    this.cleanups.push(
      this.api.onDetected((event) => {
        this.ngZone.run(() => {
          this._detectedApps$.next(event.apps);
          this._detected$.next(event);
        });
      }),
      this.api.onEnded((event) => {
        this.ngZone.run(() => {
          this._detectedApps$.next([]);
          this._ended$.next(event);
          // Reset notification state when all meetings end
          this._notificationDismissed = false;
          this._notifiedBundleIds.clear();
        });
      }),
      this.api.onChange((event) => {
        this.ngZone.run(() => {
          this._detectedApps$.next(event.apps);
          this._change$.next(event);
        });
      }),
      this.api.onStartRecordingRequested((data) => {
        this.ngZone.run(() => {
          this._startRecordingRequested$.next(data);
        });
      })
    );

    // Get initial state
    this.api.getDetected().then((apps) => {
      this.ngZone.run(() => this._detectedApps$.next(apps));
    });
  }

  /** Check if meeting API is available (running in Electron) */
  get isAvailable(): boolean {
    return !!this.api;
  }

  /** Get current detected apps synchronously */
  get detectedApps(): MeetingApp[] {
    return this._detectedApps$.value;
  }

  /** Check if any meeting app is currently detected */
  get hasMeeting(): boolean {
    return this._detectedApps$.value.length > 0;
  }

  /** Check if notification was dismissed for current session */
  get notificationDismissed(): boolean {
    return this._notificationDismissed;
  }

  /** Mark notification as dismissed */
  dismissNotification(): void {
    this._notificationDismissed = true;
  }

  /**
   * Check if we should show notification for a specific app.
   * Returns true only if we haven't notified about this app yet.
   */
  shouldNotifyForApp(bundleId: string): boolean {
    if (this._notifiedBundleIds.has(bundleId)) {
      return false;
    }
    return true;
  }

  /** Mark that we've notified for a specific app */
  markNotified(bundleId: string): void {
    this._notifiedBundleIds.add(bundleId);
  }

  /** Force an immediate check for meeting apps */
  async forceCheck(): Promise<MeetingApp[]> {
    if (!this.api) return [];
    const apps = await this.api.forceCheck();
    this.ngZone.run(() => this._detectedApps$.next(apps));
    return apps;
  }

  /** Start monitoring for meetings */
  startMonitoring(): void {
    this.api?.startMonitoring();
  }

  /** Stop monitoring for meetings */
  stopMonitoring(): void {
    this.api?.stopMonitoring();
  }

  ngOnDestroy(): void {
    this.cleanups.forEach((fn) => fn());
  }
}
