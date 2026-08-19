import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS S3 is not configured (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing)");
  }

  client = new S3Client({ region, credentials: { accessKeyId, secretAccessKey } });
  return client;
}

// Uploads a file to the public-read S3 bucket and returns its public URL.
// `key` is the object's path within the bucket, e.g. "patient-photos/abc-123.jpg".
export async function uploadToS3(key: string, buffer: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("AWS S3 is not configured (S3_BUCKET_NAME missing)");
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const region = process.env.AWS_REGION;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// Deletes an object previously uploaded via `uploadToS3`, given its public URL.
export async function deleteFromS3ByUrl(url: string): Promise<void> {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) {
    throw new Error("AWS S3 is not configured (S3_BUCKET_NAME missing)");
  }

  const marker = `.amazonaws.com/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const key = url.slice(idx + marker.length);

  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
