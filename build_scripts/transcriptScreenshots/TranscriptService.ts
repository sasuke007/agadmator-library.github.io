import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_DIR = path.join(__dirname, '../../temp_transcripts');

export interface TranscriptEntry {
    startTime: number; // in seconds
    endTime: number;   // in seconds
    text: string;
}

function ensureTempDir(): void {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

function cleanupTempFiles(videoId: string): void {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
        if (file.startsWith(videoId)) {
            fs.unlinkSync(path.join(TEMP_DIR, file));
        }
    }
}

function parseVttTimestamp(timestamp: string): number {
    // Format: HH:MM:SS.mmm or MM:SS.mmm
    const parts = timestamp.split(':');
    let hours = 0, minutes = 0, seconds = 0;
    
    if (parts.length === 3) {
        hours = parseInt(parts[0], 10);
        minutes = parseInt(parts[1], 10);
        seconds = parseFloat(parts[2]);
    } else if (parts.length === 2) {
        minutes = parseInt(parts[0], 10);
        seconds = parseFloat(parts[1]);
    }
    
    return hours * 3600 + minutes * 60 + seconds;
}

function parseVttContent(vttContent: string): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];
    const lines = vttContent.split('\n');
    
    let i = 0;
    // Skip header
    while (i < lines.length && !lines[i].includes('-->')) {
        i++;
    }
    
    while (i < lines.length) {
        const line = lines[i].trim();
        
        // Look for timestamp line (e.g., "00:00:01.000 --> 00:00:04.000")
        if (line.includes('-->')) {
            const [startStr, endStr] = line.split('-->').map(s => s.trim().split(' ')[0]);
            const startTime = parseVttTimestamp(startStr);
            const endTime = parseVttTimestamp(endStr);
            
            // Collect text lines until empty line or next timestamp
            const textLines: string[] = [];
            i++;
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
                // Remove VTT tags like <c> and timestamps in text
                let text = lines[i].trim();
                text = text.replace(/<[^>]+>/g, '');
                text = text.replace(/&nbsp;/g, ' ');
                if (text) {
                    textLines.push(text);
                }
                i++;
            }
            
            if (textLines.length > 0) {
                entries.push({
                    startTime,
                    endTime,
                    text: textLines.join(' ')
                });
            }
        } else {
            i++;
        }
    }
    
    return entries;
}

export async function downloadTranscript(videoId: string): Promise<TranscriptEntry[] | null> {
    ensureTempDir();
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const outputTemplate = path.join(TEMP_DIR, `${videoId}`);
    
    try {
        console.log(`Downloading transcript for video: ${videoId}`);
        
        // Try to download auto-generated subtitles first, then manual
        const command = `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format vtt -o "${outputTemplate}" "${videoUrl}" 2>&1`;
        
        execSync(command, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        
        // Find the downloaded VTT file
        const files = fs.readdirSync(TEMP_DIR);
        const vttFile = files.find(f => f.startsWith(videoId) && f.endsWith('.vtt'));
        
        if (!vttFile) {
            console.log(`No transcript found for video: ${videoId}`);
            cleanupTempFiles(videoId);
            return null;
        }
        
        const vttPath = path.join(TEMP_DIR, vttFile);
        const vttContent = fs.readFileSync(vttPath, 'utf8');
        const entries = parseVttContent(vttContent);
        
        // Cleanup
        cleanupTempFiles(videoId);
        
        console.log(`Successfully parsed ${entries.length} transcript entries for video: ${videoId}`);
        return entries;
        
    } catch (error) {
        console.error(`Error downloading transcript for ${videoId}:`, error);
        cleanupTempFiles(videoId);
        return null;
    }
}

export function cleanupAllTempFiles(): void {
    if (fs.existsSync(TEMP_DIR)) {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
}
