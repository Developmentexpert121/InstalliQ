import OpenAI from "openai";
import sharp from "sharp";
import { listGlobalTags, updateAsset, type AssetRow } from "./storage";
import { pool } from "../db";
import { storage } from "../storage";

const BATCH_SIZE = 5;
const MAX_LONG_EDGE = 1024;
const JPEG_QUALITY = 80;
const DEFAULT_MODEL = "gpt-4o";
// 30 000 TPM limit; ~1 040 tokens/image × 5 concurrent = ~5 200 tokens/batch
// Keep one batch per ~11 s to stay safely under the limit
const MIN_BATCH_INTERVAL_MS = 11_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey });
}

function buildPrompt(allowedTags: string[]): string {
  if (allowedTags.length > 0) {
    return `You are analyzing a photo from a signage installation job.

Task 1 — Tags: Select 1-10 tags from the approved list below that best describe this image. Use ONLY tags from this list; do not invent new ones.
Approved tags: ${allowedTags.join(", ")}.

Task 2 — Description: Write a single descriptive sentence about this sign or installation (e.g. material, colour, location, sign type). The description field is required and must not be empty.

Respond with ONLY a raw JSON object (no markdown fences, no extra text):
{"tags": ["tag1", "tag2"], "description": "A concise sentence describing the sign."}`;
  }
  return `You are analyzing a photo from a signage installation job.

Task 1 — Tags: Suggest 5-10 concise keyword tags (e.g. signage type, colour, location, materials).
Task 2 — Description: Write a single descriptive sentence about what is shown. The description field is required and must not be empty.

Respond with ONLY a raw JSON object (no markdown fences, no extra text):
{"tags": ["tag1", "tag2"], "description": "A concise sentence describing the sign."}`;
}

async function downloadAndPrepareImage(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const resized = await sharp(buffer)
    .resize(MAX_LONG_EDGE, MAX_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

async function logActivity(opts: {
  action: string;
  category: string;
  description: string;
  userId?: number | null;
  resourceId?: string | number | null;
  resourceType?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    let userName: string | null = null;
    let userEmail: string | null = null;
    let userRole: string | null = null;
    if (opts.userId) {
      try {
        const u = await storage.getUser(opts.userId);
        if (u) { userName = u.name; userEmail = u.email ?? null; userRole = u.role; }
      } catch {}
    }
    await pool.query(
      `INSERT INTO activity_logs (user_id, user_name, user_email, user_role, action, category, description, resource_id, resource_type, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        opts.userId ?? null, userName, userEmail, userRole,
        opts.action, opts.category, opts.description,
        opts.resourceId != null ? String(opts.resourceId) : null,
        opts.resourceType ?? null,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        null,
      ]
    );
  } catch (err) {
    console.error("[Asset Tagger Activity Log Error]", err);
  }
}

export async function tagAssetWithOpenAI(
  asset: AssetRow,
  _adminId: number,
  prefetchedAllowedTags?: string[]
): Promise<AssetRow> {
  const client = getClient();

  let allowedTags: string[];
  if (prefetchedAllowedTags !== undefined) {
    allowedTags = prefetchedAllowedTags;
  } else {
    const globalTags = await listGlobalTags();
    allowedTags = globalTags.map(t => t.name);
  }

  const prompt = buildPrompt(allowedTags);
  const model = process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;

  const downloadStart = Date.now();
  const imageDataUrl = await downloadAndPrepareImage(asset.fileUrl);
  const downloadMs = Date.now() - downloadStart;

  const inferenceStart = Date.now();
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
        ],
      },
    ],
    max_tokens: 300,
  });
  const inferenceMs = Date.now() - inferenceStart;

  console.log(`[OpenAI Tagger] asset ${asset.id} — download: ${downloadMs}ms, inference: ${inferenceMs}ms, model: ${model}`);

  const rawText = (completion.choices[0]?.message?.content ?? "").trim();
  let parsed: { tags?: string[]; description?: string } = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    console.warn("[OpenAI Tagger] Failed to parse JSON response:", rawText.slice(0, 300));
  }

  let tags: string[] = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
  const description: string = typeof parsed.description === "string" ? parsed.description.trim() : "";

  if (!description) {
    console.warn(`[OpenAI Tagger] No description returned for asset ${asset.id}. Raw: ${rawText.slice(0, 200)}`);
  }

  if (allowedTags.length > 0) {
    const allowedSet = new Set(allowedTags);
    tags = tags.filter(t => allowedSet.has(t));
  }

  const updated = await updateAsset(asset.id, {
    tags,
    ...(description ? { description } : {}),
    aiTaggedAt: new Date(),
  });

  return updated ?? asset;
}

export type TagProgressCallback = (progress: { done: number; total: number; failed: number }) => void;

export async function tagAllUntaggedAssets(
  untaggedAssets: AssetRow[],
  adminId: number,
  onProgress?: TagProgressCallback,
  signal?: AbortSignal
): Promise<{ tagged: number; failed: number; stopped?: boolean }> {
  let tagged = 0;
  let failed = 0;
  const total = untaggedAssets.length;

  const globalTags = await listGlobalTags();
  const allowedTags = globalTags.map(t => t.name);

  const totalBatches = Math.ceil(total / BATCH_SIZE);
  const model = process.env.OPENAI_VISION_MODEL || DEFAULT_MODEL;
  console.log(`[OpenAI Tagger] Starting batch tagging — ${total} assets in ${totalBatches} batch(es) of ${BATCH_SIZE}, model: ${model}`);

  await logActivity({
    action: "LLM_IMAGE_ANALYSIS",
    category: "AI",
    description: `AI asset tagging started — ${total} untagged asset(s) queued`,
    userId: adminId,
    resourceType: "asset_batch",
    metadata: { total, model, adminId },
  });

  for (let i = 0; i < untaggedAssets.length; i += BATCH_SIZE) {
    if (signal?.aborted) {
      await logActivity({
        action: "LLM_IMAGE_ANALYSIS",
        category: "AI",
        description: `AI asset tagging stopped — tagged: ${tagged}, failed: ${failed}, remaining: ${total - tagged - failed}`,
        userId: adminId,
        resourceType: "asset_batch",
        metadata: { tagged, failed, total, stopped: true, model },
      });
      return { tagged, failed, stopped: true };
    }

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = untaggedAssets.slice(i, i + BATCH_SIZE);
    console.log(`[OpenAI Tagger] Batch ${batchNum}/${totalBatches} — processing assets ${i + 1}–${Math.min(i + BATCH_SIZE, total)} of ${total}`);

    const batchStart = Date.now();
    const results = await Promise.allSettled(
      batch.map(asset => tagAssetWithOpenAI(asset, adminId, allowedTags))
    );
    const batchMs = Date.now() - batchStart;

    for (const result of results) {
      if (result.status === "fulfilled") {
        tagged++;
      } else {
        console.error(`[OpenAI Tagger] Failed to tag asset:`, result.reason);
        failed++;
      }
    }

    console.log(`[OpenAI Tagger] Batch ${batchNum}/${totalBatches} complete in ${batchMs}ms — tagged: ${tagged}, failed: ${failed}, remaining: ${total - tagged - failed}`);
    onProgress?.({ done: tagged + failed, total, failed });

    // Throttle to stay under OpenAI TPM limits
    const remaining = total - tagged - failed;
    if (remaining > 0 && !signal?.aborted) {
      const wait = Math.max(0, MIN_BATCH_INTERVAL_MS - batchMs);
      if (wait > 0) {
        console.log(`[OpenAI Tagger] Rate-limit throttle: waiting ${wait}ms before next batch`);
        await sleep(wait);
      }
    }
  }

  await logActivity({
    action: "LLM_IMAGE_ANALYSIS",
    category: "AI",
    description: `AI asset tagging complete — tagged: ${tagged}, failed: ${failed} of ${total} total`,
    userId: adminId,
    resourceType: "asset_batch",
    metadata: { tagged, failed, total, model },
  });

  return { tagged, failed };
}
