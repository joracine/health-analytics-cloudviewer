/**
 * Integration tests for the presign API: POST /uploaded success and validation.
 */

const UPLOAD_PREFIX = 'uploads/userdata/pdftestresults/';

export async function testPresignSuccess(baseUrl: string): Promise<void> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}uploaded` : `${baseUrl}/uploaded`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'integration-test.pdf' }),
  });
  if (res.status !== 200) {
    throw new Error(`Expected 200, got ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { url?: string; key?: string };
  if (typeof body.url !== 'string' || !body.url) {
    throw new Error(`Response missing "url": ${JSON.stringify(body)}`);
  }
  if (typeof body.key !== 'string' || !body.key) {
    throw new Error(`Response missing "key": ${JSON.stringify(body)}`);
  }
  if (!body.key.startsWith(UPLOAD_PREFIX)) {
    throw new Error(`Key should start with ${UPLOAD_PREFIX}, got: ${body.key}`);
  }
  if (!body.key.includes('integration-test') && !body.key.includes('integration_test')) {
    throw new Error(`Key should contain filename substring, got: ${body.key}`);
  }
}

export async function testPresignValidationMissingFilename(baseUrl: string): Promise<void> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}uploaded` : `${baseUrl}/uploaded`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (res.status !== 400) {
    throw new Error(`Expected 400 for missing filename, got ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as { error?: string };
  if (typeof body.error !== 'string') {
    throw new Error(`Expected error message in body: ${JSON.stringify(body)}`);
  }
}

export async function testPresignValidationEmptyFilename(baseUrl: string): Promise<void> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}uploaded` : `${baseUrl}/uploaded`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: '' }),
  });
  if (res.status !== 400) {
    throw new Error(`Expected 400 for empty filename, got ${res.status}: ${await res.text()}`);
  }
}

export async function testPresignValidationInvalidJson(baseUrl: string): Promise<void> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}uploaded` : `${baseUrl}/uploaded`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  if (res.status !== 400) {
    throw new Error(`Expected 400 for invalid JSON, got ${res.status}: ${await res.text()}`);
  }
}
