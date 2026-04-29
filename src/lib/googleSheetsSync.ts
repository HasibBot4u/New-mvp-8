export interface VideoSheetRow {
  video_id: string;
  title_en: string;
  title_bn: string;
  description_en: string;
  description_bn: string;
  subject: string;
  cycle_number: number;
  chapter_number: number;
  video_number: number;
  source_type: string;
  source_url: string;
  youtube_video_id: string;
  drive_file_id: string;
  telegram_channel_id: string;
  telegram_message_id: string;
  display_order: number;
  is_active: boolean;
}

export async function exportToGoogleSheets(videos: any[]): Promise<string> {
  const scriptUrl = 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'createSheet',
      videos: videos.map(v => ({
        video_id: v.id,
        title_en: v.title || '',
        title_bn: v.title_bn || '',
        description_en: '',
        description_bn: '',
        subject: v.subject || '',
        cycle_number: v.cycle_number || 0,
        chapter_number: v.chapter_number || 0,
        video_number: 0,
        source_type: v.source_type || 'telegram',
        source_url: '',
        youtube_video_id: v.youtube_video_id || '',
        drive_file_id: v.drive_file_id || '',
        telegram_channel_id: v.telegram_channel_id || '',
        telegram_message_id: v.telegram_message_id || '',
        display_order: v.display_order || 0,
        is_active: v.is_active || false,
      })),
    }),
  });
  const result = await response.json();
  return result.sheetUrl;
}

export async function importFromGoogleSheets(sheetUrl: string): Promise<VideoSheetRow[]> {
  const encodedUrl = encodeURIComponent(sheetUrl);
  // Example implementation. In reality, you'd pass the sheetUrl to an Apps Script or similar
  const scriptUrl = `https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?action=getData&url=${encodedUrl}`;
  const response = await fetch(scriptUrl, {
    method: 'GET',
  });
  const data = await response.json();
  return data.rows;
}

export async function syncFromSheetsToDatabase(rows: VideoSheetRow[]): Promise<void> {
  const { supabase } = await import('@/integrations/supabase/client');
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const updates = batch.map(row => ({
      id: row.video_id,
      title: row.title_en,
      title_bn: row.title_bn,
      source_type: row.source_type,
      youtube_video_id: row.youtube_video_id,
      drive_file_id: row.drive_file_id,
      telegram_channel_id: row.telegram_channel_id,
      telegram_message_id: row.telegram_message_id,
      display_order: row.display_order,
      is_active: row.is_active,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from('videos')
      .upsert(updates as any, { onConflict: 'id' });
    if (error) {
      throw new Error(`Batch ${i} failed: ${error.message}`);
    }
  }
}
