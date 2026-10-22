import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

// The first `bytes` bytes of a file we uploaded under `folder` (for sniffing
// what it really is — src/lib/fileSniff.ts), via a ranged GetObject with our
// own credentials, so it works whether or not the bucket is public.
// "foreign" when the URL isn't one of our uploads in that folder, "missing"
// when the object isn't there. Other failures (S3 unreachable, bad
// credentials) throw — callers decide how to fail.
export async function readUploadHead(url: string, folder: string, bytes = 16): Promise<Uint8Array | "foreign" | "missing"> {
  if (!isOwnUploadUrl(url, folder)) return "foreign";
  const bucket = process.env.S3_BUCKET_NAME!;
  const key = decodeURIComponent(new URL(url).pathname.slice(1));
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return res.Body ? await res.Body.transformToByteArray() : "missing";
  } catch (err) {
    const name = (err as { name?: string })?.name;
    // Without s3:ListBucket, S3 answers a missing key with 403 AccessDenied
    // rather than 404 — our credentials can read every object we wrote.
    if (name === "NoSuchKey" || name === "NotFound" || name === "AccessDenied") return "missing";
    throw err;
  }
}

// Deletes a file we uploaded under `folder` — e.g. to undo uploads when the
// database write they belonged to failed. Best effort: never throws.
export async function deleteFromS3(url: string, folder: string): Promise<void> {
  if (!isOwnUploadUrl(url, folder)) return;
  try {
    const key = decodeURIComponent(new URL(url).pathname.slice(1));
    await getClient().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET_NAME!, Key: key }));
  } catch (err) {
    console.error("Could not delete", url, err);
  }
}
