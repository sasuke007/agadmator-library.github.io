import { extractScreenshots } from '../transcriptScreenshots/ScreenshotExtractor.js';
import { loadConfig } from '../transcriptScreenshots/PhraseDetector.js';

/**
 * Main entry point for extracting screenshots from all videos.
 * 
 * This script:
 * 1. Reads all video IDs from the db/ folder
 * 2. Downloads transcripts for each video using yt-dlp (in parallel)
 * 3. Searches for configured trigger phrases
 * 4. Captures screenshots at matching timestamps using ffmpeg streaming
 * 5. Saves screenshots and copies JSON files to screenshots/{videoId}/{timestamp}/
 * 
 * Configuration (build_scripts/transcriptScreenshots/config.json):
 * - triggerPhrases: Array of phrases to search for
 * - concurrency: Number of parallel workers (default: 20)
 * 
 * Prerequisites:
 * - yt-dlp must be installed (brew install yt-dlp or pip install yt-dlp)
 * - ffmpeg must be installed (brew install ffmpeg)
 */

async function main() {
    const config = loadConfig();
    
    console.log('Starting full screenshot extraction...');
    console.log(`Using concurrency: ${config.concurrency} (from config.json)\n`);
    
    const stats = await extractScreenshots({
        concurrency: config.concurrency
    });
    
    // Exit with error code if there were failures
    if (stats.errors > 0) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
