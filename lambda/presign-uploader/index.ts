import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

/** Key prefix for upload keys (e.g. uploads/userdata/pdftestresults/). Set by CDK. */
const DEFAULT_KEY_PREFIX = 'uploads/userdata/pdftestresults/';
/** Hardcoded user ID until we add auth (per proposal). */
const HARDCODED_USER_ID = '00000000-0000-0000-0000-000000000001';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Sanitize filename: basename only (no path traversal), safe chars for S3 key.
 */
function sanitizeFilename(filename: string): string {
  const basename = filename.replace(/^.*[/\\]/, '') || 'upload';
  return basename.replace(/[^\w.\-]/g, '_').slice(0, 200);
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const bucketName = process.env.BUCKET_NAME;
  const region = process.env.REGION;
  if (!bucketName || !region) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  let body: { filename?: string };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const filename = body.filename;
  if (!filename || typeof filename !== 'string') {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Missing or invalid "filename" in body' }),
    };
  }

  const keyPrefix = process.env.KEY_PREFIX ?? DEFAULT_KEY_PREFIX;
  const safeName = sanitizeFilename(filename);
  const key = `${keyPrefix}${HARDCODED_USER_ID}-${crypto.randomUUID()}-${safeName}`;

  const client = new S3Client({ region });
  const command = new PutObjectCommand({ Bucket: bucketName, Key: key });
  const url = await getSignedUrl(client, command, { expiresIn: 3600 });

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ url, key }),
  };
}
