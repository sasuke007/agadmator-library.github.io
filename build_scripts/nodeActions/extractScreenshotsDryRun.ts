import { extractScreenshots } from '../transcriptScreenshots/ScreenshotExtractor.js';
import { loadConfig } from '../transcriptScreenshots/PhraseDetector.js';

/**
 * Dry run entry point - processes limited videos for testing.
 * 
 * Use this to verify the screenshot extraction works correctly
 * before running the full extraction on all videos.
 * 
 * Configuration (build_scripts/transcriptScreenshots/config.json):
 * - triggerPhrases: Array of phrases to search for
 * - dryRunLimit: Number of videos to process (default: 10)
 * - dryRunConcurrency: Number of parallel workers for dry run (default: 5)
 * 
 * Prerequisites:
 * - yt-dlp must be installed (brew install yt-dlp or pip install yt-dlp)
 * - ffmpeg must be installed (brew install ffmpeg)
 */

async function main() {
    const config = loadConfig();
    
    console.log(`Starting DRY RUN screenshot extraction...`);
    console.log(`Limit: ${config.dryRunLimit} videos`);
    console.log(`Concurrency: ${config.dryRunConcurrency} (from config.json)\n`);
    
    const stats = await extractScreenshots({
        limit: config.dryRunLimit,
        concurrency: config.dryRunConcurrency
    });
    
    console.log('\n[DRY RUN COMPLETE]');
    console.log('To process all videos, run: npm run extractScreenshots');
    
    // Exit with error code if there were failures
    if (stats.errors > 0) {
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
