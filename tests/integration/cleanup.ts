/**
 * Clears all objects under the upload prefix in the Test bucket so each integration run starts clean.
 */
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

const UPLOAD_PREFIX = 'uploads/userdata/pdftestresults/';

export async function clearUploadPrefix(bucket: string, region?: string): Promise<void> {
  const client = new S3Client(region ? { region } : {});
  let continuationToken: string | undefined;
  do {
    const list = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: UPLOAD_PREFIX,
        ContinuationToken: continuationToken,
      })
    );
    const keys = (list.Contents ?? []).map((o) => o.Key).filter((k): k is string => !!k);
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
    }
    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);
}
