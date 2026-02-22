#!/usr/bin/env node
/**
 * Integration test entry: reads env, clears upload prefix, runs tests, exits 0 or 1.
 * Env: UPLOAD_API_URL, TEST_BUCKET; optional UPLOAD_PREFIX, AWS_REGION.
 */
import { clearUploadPrefix } from './cleanup';
import {
  testPresignSuccess,
  testPresignValidationEmptyFilename,
  testPresignValidationInvalidJson,
  testPresignValidationMissingFilename,
} from './api-tests';
import { testUploadRoundTrip } from './upload-roundtrip';

function env(name: string): string {
  const v = process.env[name];
  if (v == null || v === '') {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

async function run(): Promise<void> {
  const baseUrl = env('UPLOAD_API_URL').replace(/\/$/, '');
  const bucket = env('TEST_BUCKET');
  const region = process.env.AWS_REGION;

  console.log('Clearing upload prefix for clean state...');
  await clearUploadPrefix(bucket, region);
  console.log('Running integration tests...');

  const steps: { name: string; fn: () => Promise<void> }[] = [
    { name: 'Presign API success', fn: () => testPresignSuccess(baseUrl) },
    { name: 'Presign validation (missing filename)', fn: () => testPresignValidationMissingFilename(baseUrl) },
    { name: 'Presign validation (empty filename)', fn: () => testPresignValidationEmptyFilename(baseUrl) },
    { name: 'Presign validation (invalid JSON)', fn: () => testPresignValidationInvalidJson(baseUrl) },
    { name: 'Upload round-trip', fn: () => testUploadRoundTrip(baseUrl, bucket, region) },
  ];

  for (const { name, fn } of steps) {
    try {
      await fn();
      console.log(`  OK: ${name}`);
    } catch (e) {
      console.error(`  FAIL: ${name}`);
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  console.log('All integration tests passed.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
