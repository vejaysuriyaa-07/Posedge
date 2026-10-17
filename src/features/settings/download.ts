import { backupFileName, exportBackupJson } from '../../db/backup';

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exports all data as posedge-backup-YYYY-MM-DD.json and records lastBackupAt. */
export async function exportAndDownload(now: Date = new Date()): Promise<void> {
  const json = await exportBackupJson(now);
  downloadText(backupFileName(now), json);
}
