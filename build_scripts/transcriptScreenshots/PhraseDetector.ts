import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TranscriptEntry } from './TranscriptService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PhraseMatch {
    phrase: string;
    timestamp: number; // in seconds
    text: string;      // the full text where phrase was found
}

export interface Config {
    triggerPhrases: string[];
    concurrency: number;
    dryRunLimit: number;
    dryRunConcurrency: number;
}

export function loadConfig(): Config {
    const configPath = path.join(__dirname, 'config.json');
    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent) as Config;
}

export function getTriggerPhrases(): string[] {
    const config = loadConfig();
    return config.triggerPhrases;
}

// Minimum time gap (in seconds) between screenshots to avoid duplicates
const MIN_TIME_GAP_SECONDS = 10;

function isWithinTimeGap(newTimestamp: number, existingTimestamps: number[]): boolean {
    for (const existing of existingTimestamps) {
        if (Math.abs(newTimestamp - existing) < MIN_TIME_GAP_SECONDS) {
            return true;
        }
    }
    return false;
}

export function detectPhrases(transcript: TranscriptEntry[]): PhraseMatch[] {
    const config = loadConfig();
    const matches: PhraseMatch[] = [];
    const capturedTimestamps: number[] = [];
    
    for (const entry of transcript) {
        const textLower = entry.text.toLowerCase();
        
        for (const phrase of config.triggerPhrases) {
            const phraseLower = phrase.toLowerCase();
            
            if (textLower.includes(phraseLower)) {
                // Check if this timestamp is too close to an already captured one
                if (!isWithinTimeGap(entry.startTime, capturedTimestamps)) {
                    capturedTimestamps.push(entry.startTime);
                    matches.push({
                        phrase,
                        timestamp: entry.startTime,
                        text: entry.text
                    });
                    console.log(`Found phrase "${phrase}" at ${formatTimestamp(entry.startTime)}: "${entry.text}"`);
                } else {
                    console.log(`Skipping duplicate at ${formatTimestamp(entry.startTime)} (too close to existing screenshot)`);
                }
            }
        }
    }
    
    return matches;
}

export function formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s`;
}

export function formatTimestampForFFmpeg(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}
