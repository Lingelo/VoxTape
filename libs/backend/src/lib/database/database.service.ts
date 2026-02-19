import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';
import type {
  SessionState,
  TranscriptSegment,
  EnhancedNote,
  ChatMessage,
  Folder,
  SessionSummary,
  SearchResult,
} from '@voxtape/shared-types';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private db!: Database.Database;
  private _dbPath = '';

  /** Must be called once from main.ts with app.getPath('userData') */
  open(userDataPath: string): void {
    this._dbPath = join(userDataPath, 'voxtape.db');
    this.db = new Database(this._dbPath);

    // Pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'Nouvelle session',
        user_notes TEXT NOT NULL DEFAULT '',
        ai_summary TEXT NOT NULL DEFAULT '',
        folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS segments (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        start_time_ms INTEGER NOT NULL,
        end_time_ms INTEGER NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 1,
        language TEXT,
        speaker INTEGER,
        PRIMARY KEY (session_id, id)
      );

      CREATE TABLE IF NOT EXISTS ai_notes (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        text TEXT NOT NULL,
        segment_ids TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (session_id, id)
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
        PRIMARY KEY (session_id, id)
      );

      -- FTS5 for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        title, user_notes, content=sessions, content_rowid=rowid
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
        text, content=segments, content_rowid=rowid
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
        INSERT INTO sessions_fts(rowid, title, user_notes) VALUES (new.rowid, new.title, new.user_notes);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, title, user_notes) VALUES('delete', old.rowid, old.title, old.user_notes);
        INSERT INTO sessions_fts(rowid, title, user_notes) VALUES (new.rowid, new.title, new.user_notes);
      END;

      CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
        INSERT INTO sessions_fts(sessions_fts, rowid, title, user_notes) VALUES('delete', old.rowid, old.title, old.user_notes);
      END;

      CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
        INSERT INTO segments_fts(rowid, text) VALUES (new.rowid, new.text);
      END;

      CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
        INSERT INTO segments_fts(segments_fts, rowid, text) VALUES('delete', old.rowid, old.text);
      END;
    `);

    // Migration for existing databases: add ai_summary column if missing
    try {
      this.db.exec(`ALTER TABLE sessions ADD COLUMN ai_summary TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — expected
    }

    // Migration: add speaker column to segments
    try {
      this.db.exec(`ALTER TABLE segments ADD COLUMN speaker INTEGER`);
    } catch {
      // Column already exists — expected
    }

    // Performance indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_segments_session_id ON segments(session_id);
      CREATE INDEX IF NOT EXISTS idx_ai_notes_session_id ON ai_notes(session_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);
    `);
  }

  // ── Sessions ──────────────────────────────────────────────────────

  saveSession(data: {
    id: string;
    title: string;
    userNotes: string;
    aiSummary?: string;
    segments: TranscriptSegment[];
    aiNotes: EnhancedNote[];
    chatMessages?: ChatMessage[];
    durationMs: number;
    folderId?: string | null;
    createdAt: number;
    updatedAt: number;
  }): void {
    const saveSessionStmt = this.db.prepare(`
      INSERT INTO sessions (id, title, user_notes, ai_summary, folder_id, duration_ms, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        user_notes = excluded.user_notes,
        ai_summary = excluded.ai_summary,
        folder_id = excluded.folder_id,
        duration_ms = excluded.duration_ms,
        updated_at = excluded.updated_at
    `);

    const deleteSegmentsStmt = this.db.prepare('DELETE FROM segments WHERE session_id = ?');
    const insertSegmentStmt = this.db.prepare(`
      INSERT OR REPLACE INTO segments (id, session_id, text, start_time_ms, end_time_ms, is_final, language, speaker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const deleteAiNotesStmt = this.db.prepare('DELETE FROM ai_notes WHERE session_id = ?');
    const insertAiNoteStmt = this.db.prepare(`
      INSERT OR REPLACE INTO ai_notes (id, session_id, type, text, segment_ids)
      VALUES (?, ?, ?, ?, ?)
    `);

    const deleteChatMessagesStmt = this.db.prepare('DELETE FROM chat_messages WHERE session_id = ?');
    const insertChatMessageStmt = this.db.prepare(`
      INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      saveSessionStmt.run(
        data.id,
        data.title,
        data.userNotes,
        data.aiSummary ?? '',
        data.folderId ?? null,
        data.durationMs,
        data.createdAt,
        data.updatedAt
      );

      // Replace segments
      deleteSegmentsStmt.run(data.id);
      for (const seg of data.segments) {
        insertSegmentStmt.run(
          seg.id,
          data.id,
          seg.text,
          seg.startTimeMs,
          seg.endTimeMs,
          seg.isFinal ? 1 : 0,
          seg.language ?? null,
          seg.speaker ?? null
        );
      }

      // Replace AI notes
      deleteAiNotesStmt.run(data.id);
      for (const note of data.aiNotes) {
        insertAiNoteStmt.run(
          note.id,
          data.id,
          note.type,
          note.text,
          JSON.stringify(note.segmentIds)
        );
      }

      // Replace chat messages
      deleteChatMessagesStmt.run(data.id);
      for (const msg of data.chatMessages || []) {
        insertChatMessageStmt.run(
          msg.id,
          data.id,
          msg.role,
          msg.content,
          msg.createdAt
        );
      }
    });

    transaction();
  }

  getSession(id: string): SessionState | null {
    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
    if (!session) return null;

    const segments = this.db
      .prepare('SELECT * FROM segments WHERE session_id = ? ORDER BY start_time_ms')
      .all(id) as any[];

    const aiNotes = this.db
      .prepare('SELECT * FROM ai_notes WHERE session_id = ?')
      .all(id) as any[];

    const chatMessages = this.db
      .prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at')
      .all(id) as any[];

    return {
      id: session.id,
      title: session.title,
      status: 'done',
      startedAt: session.created_at,
      segments: segments.map((s) => ({
        id: s.id,
        text: s.text,
        startTimeMs: s.start_time_ms,
        endTimeMs: s.end_time_ms,
        isFinal: !!s.is_final,
        language: s.language,
        speaker: s.speaker ?? undefined,
      })),
      userNotes: session.user_notes,
      aiNotes: aiNotes.map((n) => ({
        id: n.id,
        type: n.type,
        text: n.text,
        segmentIds: JSON.parse(n.segment_ids),
      })),
      chatMessages: chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
      })),
      aiSummary: session.ai_summary || '',
      folderId: session.folder_id,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      durationMs: session.duration_ms,
    };
  }

  listSessions(): SessionSummary[] {
    const rows = this.db
      .prepare(`
        SELECT s.id, s.title, s.folder_id, s.created_at, s.updated_at, s.duration_ms,
               (SELECT COUNT(*) FROM segments WHERE session_id = s.id) as segment_count,
               (s.ai_summary IS NOT NULL AND s.ai_summary != '') as has_summary
        FROM sessions s
        ORDER BY s.created_at DESC
      `)
      .all() as any[];

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      folderId: r.folder_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      durationMs: r.duration_ms,
      segmentCount: r.segment_count,
      hasSummary: !!r.has_summary,
    }));
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  // ── Folders ───────────────────────────────────────────────────────

  createFolder(name: string, parentId?: string | null): Folder {
    const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    this.db
      .prepare('INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name, parentId ?? null, now);
    return { id, name, parentId: parentId ?? null, createdAt: now };
  }

  listFolders(): Folder[] {
    return (this.db.prepare('SELECT * FROM folders ORDER BY name').all() as any[]).map(
      (r) => ({
        id: r.id,
        name: r.name,
        parentId: r.parent_id,
        createdAt: r.created_at,
      })
    );
  }

  deleteFolder(id: string): void {
    this.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
  }

  moveSession(sessionId: string, folderId: string | null): void {
    this.db
      .prepare('UPDATE sessions SET folder_id = ? WHERE id = ?')
      .run(folderId, sessionId);
  }

  // ── Search ────────────────────────────────────────────────────────

  search(query: string): SearchResult[] {
    const results: SearchResult[] = [];
    const ftsQuery = query
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w}"*`)
      .join(' ');

    if (!ftsQuery) return results;

    // Search sessions (title + notes)
    const sessionHits = this.db
      .prepare(`
        SELECT s.id, s.title, s.created_at,
               snippet(sessions_fts, 1, '<mark>', '</mark>', '...', 32) as excerpt
        FROM sessions_fts
        JOIN sessions s ON s.rowid = sessions_fts.rowid
        WHERE sessions_fts MATCH ?
        LIMIT 20
      `)
      .all(ftsQuery) as any[];

    for (const hit of sessionHits) {
      results.push({
        sessionId: hit.id,
        title: hit.title,
        excerpt: hit.excerpt || '',
        matchType: hit.excerpt?.includes('<mark>') ? 'notes' : 'title',
        createdAt: hit.created_at,
      });
    }

    // Search segments
    const segmentHits = this.db
      .prepare(`
        SELECT seg.session_id, s.title, s.created_at,
               snippet(segments_fts, 0, '<mark>', '</mark>', '...', 32) as excerpt
        FROM segments_fts
        JOIN segments seg ON seg.rowid = segments_fts.rowid
        JOIN sessions s ON s.id = seg.session_id
        WHERE segments_fts MATCH ?
        GROUP BY seg.session_id
        LIMIT 20
      `)
      .all(ftsQuery) as any[];

    for (const hit of segmentHits) {
      // Avoid duplicates
      if (!results.some((r) => r.sessionId === hit.session_id)) {
        results.push({
          sessionId: hit.session_id,
          title: hit.title,
          excerpt: hit.excerpt || '',
          matchType: 'transcript',
          createdAt: hit.created_at,
        });
      }
    }

    return results;
  }

  clearAll(): void {
    this.db.exec('DELETE FROM chat_messages');
    this.db.exec('DELETE FROM ai_notes');
    this.db.exec('DELETE FROM segments');
    this.db.exec('DELETE FROM sessions');
    this.db.exec('DELETE FROM folders');
    this.db.exec('VACUUM');
  }

  onModuleDestroy(): void {
    this.db?.close();
  }
}
