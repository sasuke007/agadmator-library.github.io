import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PhraseMatch, formatTimestamp, formatTimestampForFFmpeg } from './PhraseDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');
const DB_DIR = path.join(__dirname, '../../db');

function ensureTimestampDir(videoId: string, timestamp: number): string {
    const formattedTime = formatTimestamp(timestamp);
    const outputDir = path.join(SCREENSHOTS_DIR, videoId, formattedTime);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    return outputDir;
}

function getStreamUrl(videoId: string): string | null {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    try {
        // Get the direct stream URL using yt-dlp
        const result = execSync(`yt-dlp -g "${videoUrl}" 2>/dev/null | head -1`, {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });
        return result.trim();
    } catch (error) {
        console.error(`Error getting stream URL for ${videoId}:`, error);
        return null;
    }
}

function copyJsonToTimestampDir(videoId: string, timestampDir: string): void {
    const sourcePath = path.join(DB_DIR, `${videoId}.json`);
    const destPath = path.join(timestampDir, `${videoId}.json`);
    
    if (!fs.existsSync(sourcePath)) {
        console.error(`Source JSON file not found: ${sourcePath}`);
        return;
    }
    
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied JSON file to: ${destPath}`);
}

export async function captureScreenshot(
    videoId: string,
    timestamp: number,
    streamUrl: string
): Promise<string | null> {
    const formattedTime = formatTimestamp(timestamp);
    const ffmpegTimestamp = formatTimestampForFFmpeg(timestamp);
    const timestampDir = ensureTimestampDir(videoId, timestamp);
    const outputPath = path.join(timestampDir, 'screenshot.png');
    
    // Skip if screenshot already exists
    if (fs.existsSync(outputPath)) {
        console.log(`Screenshot already exists: ${outputPath}`);
        return outputPath;
    }
    
    try {
        console.log(`Capturing screenshot at ${formattedTime} for video ${videoId}...`);
        
        // Use ffmpeg to capture a single frame at the specified timestamp
        // -ss before -i seeks in the stream (faster)
        // -frames:v 1 captures only one frame
        // -q:v 2 sets quality (lower is better, 2 is high quality)
        const command = `ffmpeg -ss ${ffmpegTimestamp} -i "${streamUrl}" -frames:v 1 -q:v 2 "${outputPath}" -y 2>/dev/null`;
        
        execSync(command, { 
            encoding: 'utf8', 
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60000 // 60 second timeout
        });
        
        if (fs.existsSync(outputPath)) {
            console.log(`Successfully captured screenshot: ${outputPath}`);
            // Copy JSON file to the same timestamp directory
            copyJsonToTimestampDir(videoId, timestampDir);
            return outputPath;
        } else {
            console.error(`Screenshot file was not created: ${outputPath}`);
            return null;
        }
        
    } catch (error) {
        console.error(`Error capturing screenshot at ${formattedTime} for ${videoId}:`, error);
        return null;
    }
}

export async function captureScreenshotsForMatches(
    videoId: string,
    matches: PhraseMatch[]
): Promise<string[]> {
    if (matches.length === 0) {
        console.log(`No matches found for video ${videoId}, skipping screenshots`);
        return [];
    }
    
    const capturedPaths: string[] = [];
    
    // Get stream URL once for all screenshots
    console.log(`Getting stream URL for video ${videoId}...`);
    const streamUrl = getStreamUrl(videoId);
    
    if (!streamUrl) {
        console.error(`Could not get stream URL for video: ${videoId}`);
        return [];
    }
    
    console.log(`Processing ${matches.length} screenshot(s) for video ${videoId}...`);
    
    for (const match of matches) {
        const screenshotPath = await captureScreenshot(videoId, match.timestamp, streamUrl);
        if (screenshotPath) {
            capturedPaths.push(screenshotPath);
        }
    }
    
    return capturedPaths;
}

export function getScreenshotsDir(): string {
    return SCREENSHOTS_DIR;
}
