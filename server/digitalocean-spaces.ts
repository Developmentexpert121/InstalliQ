import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com";
const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET || "productionstorage";
const DO_SPACES_CDN_URL = process.env.DO_SPACES_CDN_URL || "https://productionstorage.nyc3.digitaloceanspaces.com";

let _s3Client: S3Client | null = null;
let _lastKeyUsed: string = "";

function getS3Client(): S3Client {
  const currentKey = process.env.DO_SPACES_KEY || "";
  if (!_s3Client || _lastKeyUsed !== currentKey) {
    _lastKeyUsed = currentKey;
    const accessKeyId = process.env.DO_SPACES_KEY || "";
    const secretAccessKey = process.env.DO_SPACES_SECRET || "";
    
    if (!accessKeyId || !secretAccessKey) {
      console.warn("WARNING: DO_SPACES_KEY or DO_SPACES_SECRET not set. File uploads to DigitalOcean Spaces will fail.");
    }
    
    _s3Client = new S3Client({
      endpoint: DO_SPACES_ENDPOINT,
      region: "nyc3",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: false,
    });
  }
  return _s3Client;
}

export async function uploadToSpaces(
  filePath: string,
  fileName: string,
  contentType: string
): Promise<string> {
  try {
    const fileContent = fs.readFileSync(filePath);
    const key = `uploads/${fileName}`;

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        ACL: "public-read",
      })
    );

    try {
      fs.unlinkSync(filePath);
    } catch (e) {
    }

    return `${DO_SPACES_CDN_URL}/${key}`;
  } catch (error) {
    console.error("Error uploading to DigitalOcean Spaces:", error);
    throw error;
  }
}

export async function uploadBufferToSpaces(
  buffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  try {
    const key = `uploads/${fileName}`;

    await getS3Client().send(
      new PutObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
      })
    );

    return `${DO_SPACES_CDN_URL}/${key}`;
  } catch (error) {
    console.error("Error uploading buffer to DigitalOcean Spaces:", error);
    throw error;
  }
}

export function getSpacesUrl(key: string): string {
  return `${DO_SPACES_CDN_URL}/${key}`;
}

export async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
  });
  return getSignedUrl(getS3Client(), command, { expiresIn: 3600 });
}

export function isSpacesUrl(url: string): boolean {
  return url.startsWith(DO_SPACES_CDN_URL) || url.startsWith("https://productionstorage.");
}

export function isOldObjectStorageUrl(url: string): boolean {
  return url.startsWith("/objects/");
}

export async function uploadBufferWithKeyToSpaces(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: DO_SPACES_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    })
  );
  return `${DO_SPACES_CDN_URL}/${key}`;
}

export function extractSpacesKey(fileUrl: string): string | null {
  if (!fileUrl) return null;
  const candidates = [
    `${DO_SPACES_CDN_URL}/`,
    "https://productionstorage.nyc3.digitaloceanspaces.com/",
    "https://installiq.nyc3.digitaloceanspaces.com/",
    `https://${DO_SPACES_BUCKET}.nyc3.digitaloceanspaces.com/`,
  ];
  for (const prefix of candidates) {
    if (fileUrl.startsWith(prefix)) return fileUrl.slice(prefix.length);
  }
  if (fileUrl.startsWith("/objects/uploads/")) return fileUrl.slice("/objects/".length);
  if (fileUrl.startsWith("/uploads/")) return fileUrl.slice(1);
  return null;
}

export async function getSpacesObject(key: string): Promise<{
  body: NodeJS.ReadableStream;
  contentType?: string;
  contentLength?: number;
}> {
  const result = await getS3Client().send(
    new GetObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: key })
  );
  return {
    body: result.Body as NodeJS.ReadableStream,
    contentType: result.ContentType,
    contentLength: result.ContentLength,
  };
}

export async function deleteFromSpaces(fileUrl: string): Promise<void> {
  try {
    const prefix = `${DO_SPACES_CDN_URL}/`;
    if (!fileUrl.startsWith(prefix)) return;
    const key = fileUrl.slice(prefix.length);
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: DO_SPACES_BUCKET,
        Key: key,
      })
    );
  } catch (error) {
    console.error("Error deleting from DigitalOcean Spaces:", error);
    throw error;
  }
}

export { DO_SPACES_BUCKET, DO_SPACES_CDN_URL, getS3Client };
