import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription, Subject, debounceTime } from 'rxjs';
import { SessionService } from '../../services/session.service';
import { sanitizeExcerpt } from '@sourdine/shared-types';

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
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <img class="logo-icon" src="assets/logo.svg" alt="Sourdine" width="24" height="24" />
          <span class="logo-text">Sourdine</span>
        </div>
      </div>

      <!-- New session button -->
      <button class="new-session-btn" (click)="onNewSession()">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a1 1 0 011 1v4h4a1 1 0 110 2H9v4a1 1 0 11-2 0V9H3a1 1 0 010-2h4V3a1 1 0 011-1z"/>
        </svg>
        <span>Nouvelle session</span>
      </button>

      <div class="sidebar-body">
        <!-- Search -->
        <div class="search-box">
          <svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="7" cy="7" r="5"/>
            <line x1="11" y1="11" x2="14" y2="14"/>
          </svg>
          <input
            class="search-input"
            type="text"
            [(ngModel)]="searchQuery"
            (input)="onSearchInput()"
            placeholder="Rechercher..."
          />
        </div>

        <!-- Search results -->
        @if (searchResults.length > 0) {
          <div class="search-results">
            <div class="nav-section-title">Resultats</div>
            @for (result of searchResults; track result.sessionId) {
              <div
                class="session-item"
                tabindex="0"
                role="button"
                (click)="openSession(result.sessionId)"
                (keydown.enter)="openSession(result.sessionId)"
              >
                <span class="session-title">{{ result.title }}</span>
                <span class="session-excerpt" [innerHTML]="result.excerpt"></span>
              </div>
            }
          </div>
        }

        <!-- Session list (grouped by date) -->
        @if (searchResults.length === 0) {
          <nav class="session-list">
            @for (group of sessionGroups; track group.label) {
              <div class="nav-section">
                <div class="nav-section-title">{{ group.label }}</div>
                @for (s of group.sessions; track s.id) {
                  <div
                    class="session-item"
                    tabindex="0"
                    role="button"
                    [class.active]="s.id === activeSessionId"
                    (click)="openSession(s.id)"
                    (keydown.enter)="openSession(s.id)"
                  >
                    <div class="session-row">
                      <span class="session-title">{{ s.title }}</span>
                      <button
                        class="action-btn export-btn"
                        (click)="onExportSession($event, s.id)"
                        title="Exporter en Markdown"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </button>
                      <button
                        class="action-btn delete-btn"
                        (click)="onDeleteSession($event, s.id)"
                        title="Supprimer"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                          <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM7 2h2v1H7V2z"/>
                        </svg>
                      </button>
                    </div>
                    <span class="session-meta">
                      {{ formatDuration(s.durationMs) }}
                      @if (s.hasSummary) {
                        <span class="summary-badge">Résumé</span>
                      }
                    </span>
                  </div>
                }
              </div>
            }

            @if (sessionGroups.length === 0) {
              <div class="empty-sessions">
                <p>Aucune session</p>
              </div>
            }
          </nav>
        }
      </div>

      <div class="sidebar-footer">
        <a class="nav-item" routerLink="/settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          <span>Paramètres</span>
        </a>
      </div>
    </aside>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .sidebar {
      width: 240px;
      height: 100%;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      padding-top: 42px;
      -webkit-app-region: drag;
    }

    .logo { display: flex; align-items: center; gap: 8px; }
    .logo-icon { width: 24px; height: 24px; border-radius: 4px; }
    .logo-text {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .sidebar-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0 8px;
    }

    .new-session-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 12px;
      margin: 0 8px 8px;
      border-radius: 8px;
      border: 1px dashed var(--border-subtle);
      background: none;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .new-session-btn:hover {
      background: var(--accent-hover);
      color: var(--accent-primary);
      border-color: var(--accent-primary);
    }
    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 6px 10px;
      margin-bottom: 12px;
    }
    .search-icon { color: var(--text-secondary); flex-shrink: 0; }
    .search-input {
      flex: 1;
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 12px;
      outline: none;
    }
    .search-input::placeholder {
      color: var(--text-secondary);
      opacity: 0.5;
    }

    .session-list {
      flex: 1;
      overflow-y: auto;
    }

    .nav-section { margin-bottom: 12px; }

    .nav-section-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 4px 12px;
      margin-bottom: 4px;
    }

    .session-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .session-item:hover { background: var(--accent-hover); }
    .session-item.active {
      background: var(--accent-hover);
      border-left: 2px solid var(--accent-primary);
    }

    .session-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .session-title {
      font-size: 13px;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .action-btn {
      opacity: 0;
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      transition: opacity 0.15s, color 0.15s;
    }
    .session-item:hover .action-btn { opacity: 1; }
    .export-btn:hover {
      color: var(--accent-primary);
      background: rgba(74, 222, 128, 0.15);
    }
    .delete-btn:hover {
      color: var(--accent-recording);
      background: rgba(239, 68, 68, 0.15);
    }
    .session-meta {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .summary-badge {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 2px 5px;
      border-radius: 4px;
      background: var(--accent-primary-tint);
      color: var(--accent-primary);
    }
    .session-excerpt {
      font-size: 11px;
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    :host ::ng-deep .session-excerpt mark {
      background: rgba(74, 222, 128, 0.3);
      color: var(--text-primary);
      border-radius: 2px;
      padding: 0 2px;
    }

    .search-results {
      flex: 1;
      overflow-y: auto;
    }

    .empty-sessions {
      padding: 24px 12px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .sidebar-footer {
      padding: 0 8px;
      border-top: 1px solid var(--border-subtle);
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: auto;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: 8px;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      transition: background 0.15s;
      width: 100%;
    }
    .nav-item:hover {
      background: var(--accent-hover);
      color: var(--text-primary);
    }
  `],
})
export class SidebarComponent implements OnInit, OnDestroy {
  activeSessionId = '';
  sessionGroups: SessionGroup[] = [];
  searchQuery = '';
  searchResults: SearchResult[] = [];

  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);
  private searchSubject = new Subject<string>();
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.session.id$.subscribe((id) => { this.activeSessionId = id; this.cdr.markForCheck(); }),
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
    this.session.deleteSession(id);
  }

  async onExportSession(event: Event, id: string): Promise<void> {
    event.stopPropagation();
    const api = (window as Window & { sourdine?: { export?: { markdown: (id: string) => Promise<void> } } }).sourdine?.export;
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
    const api = (window as Window & { sourdine?: { search?: { query: (term: string) => Promise<SearchResult[]> } } }).sourdine?.search;
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

    const groups: Record<string, SessionItem[]> = {
      "Aujourd'hui": [],
      'Hier': [],
      'Cette semaine': [],
      'Plus ancien': [],
    };

    for (const s of sessions) {
      const t = s.updatedAt || s.createdAt || 0;
      if (t >= todayMs) groups["Aujourd'hui"].push(s);
      else if (t >= yesterdayMs) groups['Hier'].push(s);
      else if (t >= weekMs) groups['Cette semaine'].push(s);
      else groups['Plus ancien'].push(s);
    }

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, sessions]) => ({ label, sessions }));
  }
}
