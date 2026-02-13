import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ExportService {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}

  exportMarkdown(sessionId: string): string {
    const session = this.db.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const lines: string[] = [];

    // Title
    lines.push(`# ${session.title}`);
    lines.push('');
    lines.push(`*Date: ${new Date(session.createdAt).toLocaleDateString('fr-FR')}*`);
    if (session.durationMs > 0) {
      const min = Math.floor(session.durationMs / 60000);
      lines.push(`*Duree: ${min} min*`);
    }
    lines.push('');

    // User notes
    if (session.userNotes) {
      lines.push('## Notes');
      lines.push('');
      lines.push(session.userNotes);
      lines.push('');
    }

    // AI Notes
    if (session.aiNotes.length > 0) {
      lines.push('## Resume IA');
      lines.push('');

      const grouped: Record<string, string[]> = {};
      for (const note of session.aiNotes) {
        const label = NOTE_TYPE_LABELS[note.type] || note.type;
        if (!grouped[label]) grouped[label] = [];
        grouped[label].push(note.text);
      }

      for (const [label, texts] of Object.entries(grouped)) {
        lines.push(`### ${label}`);
        lines.push('');
        for (const text of texts) {
          lines.push(`- ${text}`);
        }
        lines.push('');
      }
    }

    // Transcript
    if (session.segments.length > 0) {
      lines.push('## Transcription');
      lines.push('');
      for (const seg of session.segments) {
        const time = formatTimestamp(seg.startTimeMs);
        lines.push(`**[${time}]** ${seg.text}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  exportJson(sessionId: string): string {
    const session = this.db.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return JSON.stringify(session, null, 2);
  }
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  summary: 'Resume',
  decision: 'Decisions',
  'action-item': 'Actions',
  'key-point': 'Points cles',
};

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}
