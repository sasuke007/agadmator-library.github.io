import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { downloadTranscript, cleanupAllTempFiles } from './TranscriptService.js';
import { detectPhrases, getTriggerPhrases, loadConfig } from './PhraseDetector.js';
import { captureScreenshotsForMatches, getScreenshotsDir } from './ScreenshotService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '../../db');
const SCREENSHOTS_DIR = getScreenshotsDir();

export interface ProcessingResult {
    videoId: string;
    success: boolean;
    screenshotCount: number;
    skipped?: boolean;
    error?: string;
}

export interface ProcessingStats {
    totalVideos: number;
    processedVideos: number;
    skippedVideos: number;
    videosWithScreenshots: number;
    totalScreenshots: number;
    errors: number;
}

// ============== Marker File Functions ==============

function isVideoProcessed(videoId: string): boolean {
    const markerPath = path.join(SCREENSHOTS_DIR, videoId, '.completed');
    return fs.existsSync(markerPath);
}

function markVideoProcessed(videoId: string): void {
    const videoDir = path.join(SCREENSHOTS_DIR, videoId);
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(path.join(videoDir, '.completed'), '');
}

// ============== Parallel Processing ==============

async function runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    processor: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];
    
    for (const item of items) {
        const promise = processor(item).then(result => {
            results.push(result);
        });
        
        executing.push(promise);
        
        if (executing.length >= concurrency) {
            await Promise.race(executing);
            // Remove completed promises
            for (let i = executing.length - 1; i >= 0; i--) {
                const p = executing[i];
                // Check if promise is settled by racing with an immediate resolve
                const settled = await Promise.race([
                    p.then(() => true).catch(() => true),
                    Promise.resolve(false)
                ]);
                if (settled) {
                    executing.splice(i, 1);
                }
            }
        }
    }
    
    // Wait for remaining promises
    await Promise.all(executing);
    
    return results;
}

// ============== Video Processing ==============

function getAllVideoIds(): string[] {
    if (!fs.existsSync(DB_DIR)) {
        throw new Error(`Database directory not found: ${DB_DIR}`);
    }
    
    return fs.readdirSync(DB_DIR)
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
}

export async function processVideo(videoId: string): Promise<ProcessingResult> {
    // Check if already processed
    if (isVideoProcessed(videoId)) {
        console.log(`[SKIP] Video ${videoId} already processed`);
        return {
            videoId,
            success: true,
            screenshotCount: 0,
            skipped: true
        };
    }
    
    console.log(`[START] Processing video: ${videoId}`);
    
    try {
        // Step 1: Download transcript
        const transcript = await downloadTranscript(videoId);
        
        if (!transcript || transcript.length === 0) {
            console.log(`[DONE] No transcript for: ${videoId}`);
            markVideoProcessed(videoId); // Mark as processed (no transcript)
            return {
                videoId,
                success: true,
                screenshotCount: 0
            };
        }
        
        // Step 2: Detect trigger phrases
        const matches = detectPhrases(transcript);
        
        if (matches.length === 0) {
            console.log(`[DONE] No trigger phrases in: ${videoId}`);
            markVideoProcessed(videoId); // Mark as processed (no matches)
            return {
                videoId,
                success: true,
                screenshotCount: 0
            };
        }
        
        console.log(`[FOUND] ${matches.length} phrase(s) in: ${videoId}`);
        
        // Step 3: Capture screenshots
        const capturedPaths = await captureScreenshotsForMatches(videoId, matches);
        
        // Mark as processed only if successful
        markVideoProcessed(videoId);
        
        console.log(`[DONE] ${videoId}: ${capturedPaths.length} screenshot(s)`);
        
        return {
            videoId,
            success: true,
            screenshotCount: capturedPaths.length
        };
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[ERROR] ${videoId}: ${errorMessage}`);
        
        return {
            videoId,
            success: false,
            screenshotCount: 0,
            error: errorMessage
        };
    }
}

// ============== Main Extraction Function ==============

export async function extractScreenshots(options: {
    limit?: number;
    concurrency?: number;
} = {}): Promise<ProcessingStats> {
    const config = loadConfig();
    const { 
        limit, 
        concurrency = config.concurrency 
    } = options;
    
    console.log('\n' + '='.repeat(60));
    console.log('TRANSCRIPT SCREENSHOT EXTRACTOR');
    console.log('='.repeat(60));
    
    // Show configured trigger phrases
    const phrases = getTriggerPhrases();
    console.log('\nConfigured trigger phrases:');
    phrases.forEach(p => console.log(`  - "${p}"`));
    console.log(`\nConcurrency: ${concurrency} parallel workers`);
    
    // Get all video IDs
    let videoIds = getAllVideoIds();
    console.log(`\nFound ${videoIds.length} videos in database`);
    
    // Filter out already processed videos
    const originalCount = videoIds.length;
    videoIds = videoIds.filter(id => !isVideoProcessed(id));
    const skippedCount = originalCount - videoIds.length;
    if (skippedCount > 0) {
        console.log(`Skipping ${skippedCount} already processed videos`);
    }
    
    // Apply limit if specified
    if (limit && limit > 0) {
        videoIds = videoIds.slice(0, limit);
        console.log(`Limiting to ${limit} videos (dry run mode)`);
    }
    
    console.log(`\nProcessing ${videoIds.length} videos with ${concurrency} workers...`);
    console.log('='.repeat(60) + '\n');
    
    const stats: ProcessingStats = {
        totalVideos: videoIds.length,
        processedVideos: 0,
        skippedVideos: skippedCount,
        videosWithScreenshots: 0,
        totalScreenshots: 0,
        errors: 0
    };
    
    // Process videos in parallel
    const results = await runWithConcurrency(
        videoIds,
        concurrency,
        async (videoId) => {
            const result = await processVideo(videoId);
            
            // Update stats (atomic operations)
            stats.processedVideos++;
            
            if (result.success) {
                if (result.screenshotCount > 0) {
                    stats.videosWithScreenshots++;
                    stats.totalScreenshots += result.screenshotCount;
                }
            } else {
                stats.errors++;
            }
            
            // Progress update
            const progress = Math.round((stats.processedVideos / stats.totalVideos) * 100);
            console.log(`\n[PROGRESS] ${stats.processedVideos}/${stats.totalVideos} (${progress}%) - Errors: ${stats.errors}`);
            
            return result;
        }
    );
    
    // Cleanup temp files
    cleanupAllTempFiles();
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('PROCESSING COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total videos in queue: ${stats.totalVideos}`);
    console.log(`Previously processed (skipped): ${stats.skippedVideos}`);
    console.log(`Successfully processed: ${stats.processedVideos - stats.errors}`);
    console.log(`Videos with screenshots: ${stats.videosWithScreenshots}`);
    console.log(`Total screenshots captured: ${stats.totalScreenshots}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Output directory: ${SCREENSHOTS_DIR}`);
    
    return stats;
}
