import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

// Whether `url` is a file we uploaded to our own bucket under `folder` —
// for fields a client sends back after an upload (e.g. a clinic photo), so
// they can't point at an arbitrary site or a javascript:/data: URL.
export function isOwnUploadUrl(url: string, folder: string): boolean {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return false;
  const prefix = `https://${bucket}.s3.${region}.amazonaws.com/${folder}/`;
  return url.startsWith(prefix) && !url.slice(prefix.length).includes("..");
}
