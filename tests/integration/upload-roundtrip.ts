/**
 * Integration test: get presigned URL, PUT file to S3, verify object exists via SDK.
 */
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

const UPLOAD_PREFIX = 'uploads/userdata/pdftestresults/';
const TEST_BODY = 'integration test content';

export async function testUploadRoundTrip(
  baseUrl: string,
  bucket: string,
  region?: string
): Promise<void> {
  const url = baseUrl.endsWith('/') ? `${baseUrl}uploaded` : `${baseUrl}/uploaded`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: 'roundtrip.txt' }),
  });
  if (res.status !== 200) {
    throw new Error(`Presign failed: ${res.status} ${await res.text()}`);
  }
  const { url: putUrl, key } = (await res.json()) as { url: string; key: string };
  if (!putUrl || !key) {
    throw new Error(`Missing url or key: ${JSON.stringify({ putUrl, key })}`);
  }
  if (!key.startsWith(UPLOAD_PREFIX)) {
    throw new Error(`Key should start with ${UPLOAD_PREFIX}: ${key}`);
  }

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    body: TEST_BODY,
  });
  if (!putRes.ok) {
    throw new Error(`PUT to presigned URL failed: ${putRes.status} ${await putRes.text()}`);
  }

  const s3 = new S3Client(region ? { region } : {});
  await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  const getRes = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const body = await getRes.Body?.transformToString();
  if (body !== TEST_BODY) {
    throw new Error(`Object content mismatch: expected "${TEST_BODY}", got "${body}"`);
  }
}
