import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription, Subject, debounceTime } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionService } from '../../services/session.service';
import { sanitizeExcerpt } from '@voxtape/shared-types';

interface SessionItem {
  id: string;
  title: string;
  durationMs: number;
  hasSummary: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SessionGroup {
  label: string;
  sessions: SessionItem[];
}

interface SearchResult {
  sessionId: string;
  title: string;
  excerpt: string;
}

@Component({
  selector: 'sdn-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent implements OnInit, OnDestroy {
  activeSessionId = '';
  recordingSessionId: string | null = null;
  sessionGroups: SessionGroup[] = [];
  searchQuery = '';
  searchResults: SearchResult[] = [];
  showDeleteModal = false;
  private pendingDeleteId = '';

  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly translate = inject(TranslateService);
  private searchSubject = new Subject<string>();
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.session.id$.subscribe((id) => { this.activeSessionId = id; this.cdr.markForCheck(); }),
      this.session.recordingSessionId$.subscribe((id) => { this.recordingSessionId = id; this.cdr.markForCheck(); }),
      this.session.sessions$.subscribe((sessions) => {
        this.sessionGroups = this.groupByDate(sessions);
        this.cdr.markForCheck();
      }),
      this.searchSubject.pipe(debounceTime(300)).subscribe((term) => {
        this.performSearch(term);
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  onNewSession(): void {
    this.session.newSession();
  }

  openSession(id: string): void {
    this.session.loadSession(id);
    this.searchQuery = '';
    this.searchResults = [];
  }

  onDeleteSession(event: Event, id: string): void {
    event.stopPropagation();
    this.pendingDeleteId = id;
    this.showDeleteModal = true;
    this.cdr.markForCheck();
  }

  confirmDelete(): void {
    if (this.pendingDeleteId) {
      this.session.deleteSession(this.pendingDeleteId);
    }
    this.cancelDelete();
  }

  cancelDelete(): void {
    this.showDeleteModal = false;
    this.pendingDeleteId = '';
    this.cdr.markForCheck();
  }

  async onExportSession(event: Event, id: string): Promise<void> {
    event.stopPropagation();
    const api = (window as Window & { voxtape?: { export?: { markdown: (id: string) => Promise<void> } } }).voxtape?.export;
    if (api) {
      await api.markdown(id);
    }
  }

  onSearchInput(): void {
    if (this.searchQuery.trim()) {
      this.searchSubject.next(this.searchQuery.trim());
    } else {
      this.searchResults = [];
    }
  }

  formatDuration(ms: number): string {
    if (!ms) return '0:00';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  private async performSearch(term: string): Promise<void> {
    const api = (window as Window & { voxtape?: { search?: { query: (term: string) => Promise<SearchResult[]> } } }).voxtape?.search;
    if (!api) return;
    const results = await api.query(term);
    // Sanitize excerpts to prevent XSS while preserving <mark> tags
    this.searchResults = results.map((r) => ({
      ...r,
      excerpt: sanitizeExcerpt(r.excerpt),
    }));
  }

  private groupByDate(sessions: SessionItem[]): SessionGroup[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const yesterdayMs = todayMs - 86400000;
    const weekMs = todayMs - 7 * 86400000;

    const todayLabel = this.translate.instant('sidebar.today');
    const yesterdayLabel = this.translate.instant('sidebar.yesterday');
    const thisWeekLabel = this.translate.instant('sidebar.thisWeek');
    const olderLabel = this.translate.instant('sidebar.older');

    const groups: Record<string, SessionItem[]> = {
      [todayLabel]: [],
      [yesterdayLabel]: [],
      [thisWeekLabel]: [],
      [olderLabel]: [],
    };

    for (const s of sessions) {
      const t = s.createdAt || 0;
      if (t >= todayMs) groups[todayLabel].push(s);
      else if (t >= yesterdayMs) groups[yesterdayLabel].push(s);
      else if (t >= weekMs) groups[thisWeekLabel].push(s);
      else groups[olderLabel].push(s);
    }

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, sessions]) => ({ label, sessions }));
  }
}
