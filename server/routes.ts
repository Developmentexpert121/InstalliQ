import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { razorpay, verifyRazorpaySignature } from "./razorpay";
const execAsync = promisify(exec);
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";
import { format } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const EST_TIMEZONE = "America/New_York";
function formatEST(date: Date | string, formatStr: string): string {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, EST_TIMEZONE, formatStr);
}
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";
import { storage } from "./storage";
import { db, pool } from "./db";
import { eq, sql, desc, and, ilike, or, inArray } from "drizzle-orm";
import { installEvents as installEventsTable, jobs as jobsTable, onboardingForms, users, assistantFiles, businessDetails, activityLogs, subscriptionPlans, adminSubscriptions, onboardingQuestions, surveys, surveyPhotos, calendarEvents } from "@shared/schema";
import { createTransporter, getFromAddress, getAdminFromAddress, emailTemplates, EMAIL_TYPE_LABELS, EMAIL_TYPE_DESCRIPTIONS, DEFAULT_EMAIL_SUBJECTS, DEFAULT_EMAIL_BODIES, replaceVariables, buildCustomEmail, resolveEmailTemplate, resolveAdminId } from "./email-templates";
import { syncProjectToAssets, getAdminIdForUserId, bulkUpdateInstalliqAssetMeta } from "./asset-manager/storage";
import { EMAIL_TEMPLATE_TYPES } from "@shared/schema";
import { loginSchema, createUserSchema, TAG_OPTIONS, type User, type CalendarEvent, AVAILABILITY_CATEGORIES, type InsertAvailabilityBlock } from "@shared/schema";
import { z } from "zod";
// Google Calendar integration removed - using local database calendar only
import { getWeatherForLocation, geocodeAddress, get5DayForecast } from "./weather";
import { extractWorkOrderData, extractProofData, calculateInstallTime, parseUserPrompt, generateScheduleWithAssistant, OwnerSettings } from "./pdf-processor";
import { uploadToSpaces, uploadBufferToSpaces, isSpacesUrl, isOldObjectStorageUrl, getPresignedUrl, getS3Client, DO_SPACES_BUCKET, DO_SPACES_CDN_URL, extractSpacesKey, getSpacesObject } from "./digitalocean-spaces";
import { createSenderVerification, checkSenderVerificationStatus, checkSenderVerificationById, resendVerificationEmail, deleteSender, updateSenderVerification, sendEmailViaSendGrid, isSendGridConfigured, getAllVerifiedSenders } from "./sendgrid";

const LLM_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gpt-4o": { inputPer1M: 2.50, outputPer1M: 10.00 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gpt-4-turbo": { inputPer1M: 10.00, outputPer1M: 30.00 },
  "gpt-4": { inputPer1M: 30.00, outputPer1M: 60.00 },
  "gpt-3.5-turbo": { inputPer1M: 0.50, outputPer1M: 1.50 },
};

function calculateLlmCost(model: string, promptTokens?: number, completionTokens?: number): { estimatedCostUSD: number; inputCostUSD: number; outputCostUSD: number } | null {
  if (!promptTokens && !completionTokens) return null;
  const pricing = LLM_PRICING[model] || LLM_PRICING["gpt-4o"];
  const inputCostUSD = ((promptTokens || 0) / 1_000_000) * pricing.inputPer1M;
  const outputCostUSD = ((completionTokens || 0) / 1_000_000) * pricing.outputPer1M;
  return {
    inputCostUSD: Math.round(inputCostUSD * 1_000_000) / 1_000_000,
    outputCostUSD: Math.round(outputCostUSD * 1_000_000) / 1_000_000,
    estimatedCostUSD: Math.round((inputCostUSD + outputCostUSD) * 1_000_000) / 1_000_000,
  };
}

let objectStorageService: any = null;
let objectStorageClient: any = null;
const isReplitEnv = !!(process.env.REPL_ID || process.env.REPL_SLUG);
if (isReplitEnv) {
  try {
    const objStorage = require("./replit_integrations/object_storage");
    objectStorageService = new objStorage.ObjectStorageService();
    objectStorageClient = objStorage.objectStorageClient;
  } catch (e) {
    console.log("Replit Object Storage not available, using DigitalOcean Spaces only");
  }
} else {
  console.log("Non-Replit environment detected, skipping Replit Object Storage initialization");
}

const SENSITIVE_USER_FIELDS = [
  "password",
  "tempPassword",
  "temp_password",
  "faceDescriptor",
  "face_descriptor",
  "facePhoto",
  "face_photo",
  "openaiAssistantId",
  "openai_assistant_id",
  "googleId",
  "google_id",
];

async function fetchOwnerSettings(userId: number): Promise<OwnerSettings | undefined> {
  try {
    const result = await pool.query(
      `SELECT business_address, installation_range, charge_travel_time, setup_cleanup_time,
              install_time_standards, additional_notes, has_bucket_truck, ladder_max_height, sign_types
       FROM onboarding_forms WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        businessAddress: row.business_address,
        installationRange: row.installation_range,
        chargeTravelTime: row.charge_travel_time,
        setupCleanupTime: row.setup_cleanup_time,
        installTimeStandards: row.install_time_standards,
        additionalNotes: row.additional_notes,
        hasBucketTruck: row.has_bucket_truck,
        ladderMaxHeight: row.ladder_max_height,
        signTypes: row.sign_types,
      };
    }
  } catch (err) {
    console.error("Error fetching owner settings for AI:", err);
  }
  return undefined;
}

function sanitizeUser(user: any) {
  if (!user) return user;
  const sanitized = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) {
    delete sanitized[field];
  }
  return sanitized;
}

async function findAdminForUser(userId: number): Promise<number> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return userId;
  if (user.role === "admin") return userId;
  if (user.createdBy) return user.createdBy;
  return userId;
}

function formatEmailAddress(email: string, name?: string | null): string {
  if (name && !name.includes("@")) {
    return `"${name.replace(/"/g, "")}" <${email}>`;
  }
  return email;
}

async function sendEmailForAdmin(adminId: number, options: { to: string; toName?: string | null; subject: string; html: string; bcc?: string; attachments?: any[] }) {
  const resolvedAdminId = await findAdminForUser(adminId);
  const [admin] = await db.select().from(users).where(eq(users.id, resolvedAdminId));

  const senderInfo = admin ? getAdminFromAddress(admin) : { email: getFromAddress(), name: "InstalliQ", replyTo: undefined, useSendGrid: false };

  const transporter = createTransporter();
  const fromStr = senderInfo.name ? `"${senderInfo.name}" <${senderInfo.email}>` : senderInfo.email;
  const toStr = formatEmailAddress(options.to, options.toName);
  console.log(`Sending email via SMTP from: ${fromStr} to: ${toStr}`);
  const startTime = Date.now();
  try {
    await transporter.sendMail({
      from: fromStr,
      to: toStr,
      replyTo: senderInfo.replyTo || undefined,
      subject: options.subject,
      html: options.html,
      bcc: options.bcc,
      attachments: options.attachments,
    });
    console.log(`Email sent successfully via SMTP from ${senderInfo.email}`);
    logSystemActivity({
      action: "EMAIL_SENT",
      category: "Email",
      description: `Email sent to ${options.to}: ${options.subject}`,
      userId: resolvedAdminId,
      resourceType: "email",
      metadata: { from: senderInfo.email, to: options.to, subject: options.subject, bcc: options.bcc || null, provider: "SMTP", durationMs: Date.now() - startTime },
    });
  } catch (emailErr) {
    logSystemActivity({
      action: "EMAIL_FAILED",
      category: "Email",
      description: `Email failed to ${options.to}: ${options.subject}`,
      userId: resolvedAdminId,
      resourceType: "email",
      metadata: { from: senderInfo.email, to: options.to, subject: options.subject, provider: "SMTP", error: String(emailErr), durationMs: Date.now() - startTime },
    });
    throw emailErr;
  }
}

// Helper function to migrate all images to DigitalOcean Spaces
async function migrateAllToSpaces() {
  console.log("Starting migration of all images to DigitalOcean Spaces...");
  
  try {
    const allProjects = await storage.getAllProjects();
    for (const project of allProjects) {
      if (project.imageUrls && project.imageUrls.length > 0) {
        const updatedUrls = [...project.imageUrls];
        let changed = false;

        for (let i = 0; i < updatedUrls.length; i++) {
          const url = updatedUrls[i];
          if (url && !isSpacesUrl(url)) {
            console.log(`Migrating project image: ${url}`);
            try {
              if (isOldObjectStorageUrl(url)) {
                if (!objectStorageService) continue;
                const objectFile = await objectStorageService.getObjectEntityFile(url);
                const [buffer] = await objectFile.download();
                const fileName = url.split('/').pop() || `project-${project.id}-${i}.jpg`;
                const newUrl = await uploadBufferToSpaces(buffer, fileName, "image/jpeg");
                updatedUrls[i] = newUrl;
                changed = true;
              } else if (url.startsWith('/uploads/')) {
                const localPath = path.join(process.cwd(), url);
                if (fs.existsSync(localPath)) {
                  const fileName = path.basename(localPath);
                  const newUrl = await uploadToSpaces(localPath, fileName, "image/jpeg");
                  updatedUrls[i] = newUrl;
                  changed = true;
                }
              }
            } catch (err) {
              console.error(`Failed to migrate project ${project.id} image ${url}:`, err);
            }
          }
        }

        if (changed) {
          await storage.updateProject(project.id, { imageUrls: updatedUrls });
        }
      }
    }

    const allAttachments = await storage.getAllAttachments();
    for (const attachment of allAttachments) {
      if (attachment.fileUrl && !isSpacesUrl(attachment.fileUrl)) {
        console.log(`Migrating attachment: ${attachment.fileUrl}`);
        try {
          if (isOldObjectStorageUrl(attachment.fileUrl)) {
            if (!objectStorageService) continue;
            const objectFile = await objectStorageService.getObjectEntityFile(attachment.fileUrl);
            const [buffer] = await objectFile.download();
            const fileName = attachment.fileUrl.split('/').pop() || `attach-${attachment.id}`;
            const newUrl = await uploadBufferToSpaces(buffer, fileName, attachment.fileType || "application/octet-stream");
            await storage.updateAttachment(attachment.id, { fileUrl: newUrl });
          } else if (attachment.fileUrl.startsWith('/uploads/')) {
            const localPath = path.join(process.cwd(), attachment.fileUrl);
            if (fs.existsSync(localPath)) {
              const fileName = path.basename(localPath);
              const newUrl = await uploadToSpaces(localPath, fileName, attachment.fileType || "application/octet-stream");
              await storage.updateAttachment(attachment.id, { fileUrl: newUrl });
            }
          }
        } catch (err) {
          console.error(`Failed to migrate attachment ${attachment.id}:`, err);
        }
      }
    }
    console.log("Migration to DigitalOcean Spaces completed.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

// Migration has been completed - all images are now on DigitalOcean Spaces
// To re-run migration manually, use the POST /api/admin/migrate-images-to-cloud endpoint

async function uploadFileToObjectStorage(filePath: string, fileName: string, contentType: string, userId?: number): Promise<string> {
  const startTime = Date.now();
  try {
    const url = await uploadToSpaces(filePath, fileName, contentType);
    logSystemActivity({
      action: "STORAGE_UPLOAD",
      category: "Storage",
      description: `File uploaded: ${fileName} (${contentType})`,
      userId: userId || null,
      resourceType: "file",
      metadata: { fileName, contentType, provider: "DO_Spaces", bucket: "productionstorage", durationMs: Date.now() - startTime },
    });
    return url;
  } catch (err) {
    logSystemActivity({
      action: "STORAGE_UPLOAD_FAILED",
      category: "Storage",
      description: `File upload failed: ${fileName} (${contentType})`,
      userId: userId || null,
      resourceType: "file",
      metadata: { fileName, contentType, provider: "DO_Spaces", bucket: "productionstorage", error: String(err), durationMs: Date.now() - startTime },
    });
    throw err;
  }
}

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer for image uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = /image\/(jpeg|jpg|png|gif|webp|heic|heif|avif|tiff|bmp)/;
    const allowedExts = /\.(jpeg|jpg|png|gif|webp|heic|heif|avif|tiff|bmp)$/i;
    const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.test(file.mimetype) || file.mimetype === "application/octet-stream";
    if (extname || mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed"));
  },
});

// Temp directory for PDF processing
const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Multer for PDF uploads (separate config)
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for PDFs
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      return cb(null, true);
    }
    cb(new Error("Only PDF files are allowed"));
  },
});

// Multer for mixed file uploads (PDFs and images)
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /pdf|txt|csv|json|md|docx|doc/;
    const extMatch = allowedExts.test(path.extname(file.originalname).toLowerCase());
    if (extMatch) {
      return cb(null, true);
    }
    cb(new Error("Only document files (PDF, TXT, CSV, JSON, MD, DOCX) are allowed"));
  },
});

const mixedUpload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = /jpeg|jpg|png|gif|webp/;
    const isImage = allowedImageTypes.test(file.mimetype) || allowedImageTypes.test(path.extname(file.originalname).toLowerCase());
    const isPdf = file.mimetype === "application/pdf";
    if (isImage || isPdf) {
      return cb(null, true);
    }
    cb(new Error("Only PDF and image files are allowed"));
  },
});

const onboardingDocUpload = multer({
  storage: multer.diskStorage({
    destination: tempDir,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = /pdf|doc|docx|xls|xlsx|csv|txt/;
    const allowedMimes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "text/plain",
    ];
    const extMatch = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimeMatch = allowedMimes.includes(file.mimetype);
    if (extMatch && mimeMatch) {
      return cb(null, true);
    }
    cb(new Error("Only PDF, DOC, DOCX, XLS, XLSX, CSV, and TXT files are allowed"));
  },
});

// OpenAI client for image analysis and AI features
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to analyze image with AI and return tags
async function analyzeImageWithAI(imageUrl: string, availableTags?: string[]): Promise<{ tags: string[] }> {
  if (!availableTags || availableTags.length === 0) {
    try {
      const dbTags = await storage.getGlobalTags();
      availableTags = dbTags.map(t => t.name);
    } catch {
      availableTags = TAG_OPTIONS as unknown as string[];
    }
  }
  try {
    // For local files, read and convert to base64
    let imageContent: any;
    
    if (isSpacesUrl(imageUrl)) {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl }
      };
    } else if (imageUrl.startsWith('/objects/') && objectStorageService) {
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(imageUrl);
        const [buffer] = await objectFile.download();
        const base64Image = buffer.toString("base64");
        const ext = path.extname(imageUrl).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        imageContent = {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        };
      } catch {
        return { tags: [] };
      }
    } else if (imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(uploadDir, imageUrl.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) {
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString("base64");
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        imageContent = {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        };
      } else {
        return { tags: [] };
      }
    } else {
      imageContent = {
        type: "image_url",
        image_url: { url: imageUrl }
      };
    }
    
    const llmStart = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are analyzing a photo from a FASTSIGNS signage installation job. Based on what you see in the image, select which of the following tags apply. Return ONLY a JSON array of matching tag strings — no explanation, no extra text.

Available tags and what they mean:
- "ADA": ADA-compliant signs with braille, tactile text, or accessibility-required mounting
- "Channel Letters": Three-dimensional individual illuminated or non-illuminated letter signs mounted on a building
- "Dimensional Letters": Raised or cut-out 3D letters or logos mounted on a wall or surface (not necessarily lit)
- "Door Lettering": Text, logos, or graphics applied directly to glass or solid doors
- "Drop Offs": Photo shows sign materials, panels, or hardware being delivered or dropped off at a location
- "Exterior Signs": Any signage installed outdoors on a building façade, storefront, or exterior wall
- "Light Box": Illuminated cabinet sign with a translucent face panel (backlit box sign)
- "Parking Signs": Parking lot signs including reserved, handicap, no-parking, or directional parking signage
- "Post and Panel Signs": Signs mounted on one or two vertical posts driven into the ground
- "Site Signs": Temporary or permanent identification signs at a construction site, job site, or business location
- "Site Survey": Photo taken to document an existing location before installation — showing measurements, existing conditions, or survey markers
- "Trade Show Graphics": Banners, pop-up displays, booth graphics, or exhibition signage
- "Traffic Signs": Road signs including stop, speed limit, yield, or directional traffic control signs
- "Vehicle Graphics": Vinyl wraps, decals, or lettering applied to cars, trucks, vans, or other vehicles
- "Wall Graphics": Large-format graphics, murals, or vinyl applied to interior or exterior walls
- "Window Graphics": Graphics, lettering, frosted film, or perforated vinyl applied to windows or glass surfaces

Be generous in your selection — if a tag is plausibly applicable based on the sign type, materials, or installation context visible in the image, include it. Err on the side of selecting more tags rather than fewer. If the available tags from the system differ from the list above, use: ${availableTags.join(", ")}.`,
            },
            imageContent,
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content || "[]";
    const tokensUsed = response.usage;
    
    let suggestedTags: string[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        suggestedTags = JSON.parse(jsonMatch[0]);
      }
    } catch {
      suggestedTags = availableTags.filter(tag => 
        content.toLowerCase().includes(tag.toLowerCase())
      );
    }

    // Case-insensitive match: normalize AI tags to exact DB tag names
    suggestedTags = suggestedTags
      .map(aiTag => availableTags!.find(t => t.toLowerCase() === aiTag.toLowerCase()) || null)
      .filter((t): t is string => t !== null);

    logSystemActivity({
      action: "LLM_IMAGE_ANALYSIS",
      category: "AI",
      description: `Image analyzed for tag suggestions (${suggestedTags.length} tags found)`,
      resourceType: "llm_call",
      metadata: { model: "gpt-4o", purpose: "image_tag_analysis", tagsFound: suggestedTags, promptTokens: tokensUsed?.prompt_tokens, completionTokens: tokensUsed?.completion_tokens, totalTokens: tokensUsed?.total_tokens, ...calculateLlmCost("gpt-4o", tokensUsed?.prompt_tokens, tokensUsed?.completion_tokens), durationMs: Date.now() - llmStart },
    });

    return { tags: suggestedTags };
  } catch (error) {
    console.error("Error analyzing image with AI:", error);
    return { tags: [] };
  }
}

// Session store
const PgStore = connectPgSimple(session);

// Extend session type
declare module "express-session" {
  interface SessionData {
    userId: number;
    googleOAuthState: string;
    googleOAuthMode: string;
    // SignSuiteIQ app-switcher widget — issued during /sso/callback. Sent down
    // to the browser via /api/auth/me so the cross-app launcher can render.
    signsuiteiqWidgetToken?: string;
    signsuiteiqWidgetTokenExpiresAt?: number; // epoch ms
  }
}

// ===== Activity Logging Helper =====
async function logSystemActivity(opts: {
  action: string;
  category: string;
  description: string;
  userId?: number | null;
  resourceId?: string | number | null;
  resourceType?: string;
  metadata?: Record<string, any>;
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
    console.error("[System Activity Log Error]", err);
  }
}

function safeParseJson(raw: string | null | undefined): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function normalizeDateValue(v: any): any {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return v;
}

const BOOKING_DIFF_FIELDS = [
  "title", "description", "date", "startTime", "endTime", "status",
  "projectId", "address", "hasIssue", "issueDescription",
  "customerName", "customerPhone", "customerEmail",
  "secondaryPocName", "secondaryPocPhone", "secondaryPocEmail",
];
const BOOKING_DATE_FIELDS = new Set(["date", "startTime", "endTime"]);

// Compare the persisted DB values before vs after an update so we only record
// changes that actually landed (avoids logging falsy patch values that the
// storage layer ignores, e.g. empty date strings).
function computeBookingChanges(
  before: any,
  after: any,
  touchedFields: string[],
): Array<{ field: string; before: any; after: any }> {
  const changes: Array<{ field: string; before: any; after: any }> = [];
  if (!before || !after) return changes;
  const touched = new Set(touchedFields);
  for (const f of BOOKING_DIFF_FIELDS) {
    if (!touched.has(f)) continue;
    let aRaw = (after as any)[f];
    let bRaw = (before as any)[f];
    let a: any = aRaw;
    let b: any = bRaw;
    if (BOOKING_DATE_FIELDS.has(f)) {
      a = normalizeDateValue(aRaw);
      b = normalizeDateValue(bRaw);
    } else {
      if (a === undefined) a = null;
      if (b === undefined) b = null;
    }
    if (a === b) continue;
    if (a == null && b == null) continue;
    if (typeof a === "string" && typeof b === "string" && a === b) continue;
    changes.push({ field: f, before: b ?? null, after: a ?? null });
  }
  return changes;
}

// Profile fields that we surface in the User Management Logs diff. Excluded
// on purpose: password (sensitive), username (auto-derived from email/phone),
// internal fields (createdBy, isMaster, etc.).
const USER_DIFF_FIELDS = [
  "name",
  "email",
  "phone",
  "role",
  "jobTitle",
  "location",
];

function computeUserChanges(
  before: any,
  after: any,
  touchedFields: string[],
): Array<{ field: string; before: any; after: any }> {
  const changes: Array<{ field: string; before: any; after: any }> = [];
  if (!before || !after) return changes;
  const touched = new Set(touchedFields);
  for (const f of USER_DIFF_FIELDS) {
    if (!touched.has(f)) continue;
    let a = (after as any)[f];
    let b = (before as any)[f];
    if (a === undefined) a = null;
    if (b === undefined) b = null;
    if (a === b) continue;
    if (a == null && b == null) continue;
    if (typeof a === "string" && typeof b === "string" && a === b) continue;
    changes.push({ field: f, before: b ?? null, after: a ?? null });
  }
  return changes;
}

// Returns the set of user ids that share the caller's team. super_admin gets
// `null` meaning unrestricted. Used to scope read access to per-resource
// activity history so we don't leak update history across tenants.
//
// Important: For non-admin users (install_manager, user, etc.), we only widen
// the scope to the parent admin's team if that parent actually has the
// "admin" role. Otherwise the scope collapses to the caller alone — this
// prevents a child of a super_admin from seeing every admin/team's data.
async function getTeamUserIdsForUser(user: any): Promise<number[] | null> {
  if (!user) return [];
  if (user.role === "super_admin") return null;
  if (user.role === "admin") {
    const teamUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.id, user.id), eq(users.createdBy, user.id)));
    return teamUsers.map((u) => u.id);
  }
  if (user.createdBy) {
    const parent = await storage.getUser(user.createdBy);
    if (parent && parent.role === "admin") {
      const teamUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.id, parent.id), eq(users.createdBy, parent.id)));
      return teamUsers.map((u) => u.id);
    }
  }
  return [user.id];
}

async function logActivity(req: Request, opts: {
  action: string;
  category: string;
  description: string;
  resourceId?: string | number | null;
  resourceType?: string;
  metadata?: Record<string, any>;
  overrideUserId?: number;
  overrideName?: string;
  overrideEmail?: string;
  overrideRole?: string;
}) {
  try {
    const userId: number | null = opts.overrideUserId ?? (req.session?.userId ?? null);
    let userName: string | null = opts.overrideName ?? null;
    let userEmail: string | null = opts.overrideEmail ?? null;
    let userRole: string | null = opts.overrideRole ?? null;

    if (userId && !userName) {
      try {
        const u = await storage.getUser(userId);
        if (u) { userName = u.name; userEmail = u.email ?? null; userRole = u.role; }
      } catch {}
    }

    const forwardedFor = req.headers["x-forwarded-for"];
    const ip: string | null = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || null;

    const insertValues = {
      userId,
      userName,
      userEmail,
      userRole,
      action: opts.action,
      category: opts.category,
      description: opts.description,
      resourceId: opts.resourceId != null ? String(opts.resourceId) : null,
      resourceType: opts.resourceType ?? null,
      metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      ipAddress: ip,
    };

    await pool.query(
      `INSERT INTO activity_logs (user_id, user_name, user_email, user_role, action, category, description, resource_id, resource_type, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        insertValues.userId,
        insertValues.userName,
        insertValues.userEmail,
        insertValues.userRole,
        insertValues.action,
        insertValues.category,
        insertValues.description,
        insertValues.resourceId,
        insertValues.resourceType,
        insertValues.metadata,
        insertValues.ipAddress,
      ]
    );
  } catch (err) {
    console.error("[Activity Log Error]", err);
  }
}

// Notify the relevant parties when an availability block changes:
// - When a user changes their own availability, notify their team admin.
// - When an admin changes someone else's availability, notify that user.
// Logs an activity entry and sends a best-effort email (never throws).
async function notifyAvailabilityChange(
  req: Request,
  actor: any,
  targetUserId: number,
  block: any,
  action: "created" | "updated" | "deleted",
) {
  try {
    const targetUser = await storage.getUser(targetUserId);
    const fmtRange = () => {
      try {
        const s = formatEST(new Date(block.startAt), "MMM d, yyyy h:mm a");
        const e = formatEST(new Date(block.endAt), "MMM d, yyyy h:mm a");
        return block.allDay
          ? `${formatEST(new Date(block.startAt), "MMM d, yyyy")} (all day)`
          : `${s} – ${e}`;
      } catch {
        return "";
      }
    };
    const range = fmtRange();
    const reason = block.reason || block.category || "unavailable";
    const actorIsTarget = actor.id === targetUserId;

    await logActivity(req, {
      action: `availability_${action}`,
      category: "calendar",
      description: actorIsTarget
        ? `${actor.name || actor.email} ${action} their availability block (${reason}) ${range}`
        : `${actor.name || actor.email} ${action} availability for ${targetUser?.name || targetUser?.email || `user ${targetUserId}`} (${reason}) ${range}`,
      resourceId: block.id,
      resourceType: "availability_block",
      metadata: {
        targetUserId,
        category: block.category,
        reason: block.reason,
        startAt: block.startAt,
        endAt: block.endAt,
        allDay: block.allDay,
        action,
      },
    });

    // Determine the email recipient.
    let recipient: any = null;
    if (actorIsTarget) {
      // User changed their own availability -> notify their managing admin.
      const adminId = await findAdminForUser(targetUserId);
      if (adminId && adminId !== targetUserId) {
        recipient = await storage.getUser(adminId);
      }
    } else {
      // Admin changed someone else's availability -> notify that user.
      recipient = targetUser;
    }

    if (recipient?.email) {
      const subject = `Availability ${action}: ${targetUser?.name || targetUser?.email || "team member"}`;
      const who = actorIsTarget
        ? `${actor.name || actor.email}`
        : `${actor.name || actor.email} (admin)`;
      const whose = actorIsTarget
        ? "their"
        : `${targetUser?.name || targetUser?.email || "your"}'s`;
      const html = `
        <p>Hi ${recipient.name || ""},</p>
        <p>${who} ${action} ${actorIsTarget ? "their" : whose} availability block.</p>
        <ul>
          <li><strong>Type:</strong> ${block.category || "other"}</li>
          ${block.reason ? `<li><strong>Reason:</strong> ${block.reason}</li>` : ""}
          <li><strong>When:</strong> ${range}</li>
        </ul>
        <p>This time is now ${action === "deleted" ? "available again" : "blocked for scheduling"}.</p>
      `;
      await sendEmailForAdmin(targetUserId, {
        to: recipient.email,
        toName: recipient.name,
        subject,
        html,
      }).catch((e) => console.error("[Availability email error]", e));
    }
  } catch (err) {
    console.error("[notifyAvailabilityChange error]", err);
  }
}

// Constant-time comparison of two secrets. Hashing first gives fixed-length
// buffers so we never leak the secret length, and timingSafeEqual prevents
// timing attacks that a plain === comparison would allow.
function timingSafeEqualStr(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Trust proxy for proper cookie handling behind reverse proxy (DigitalOcean, Replit, etc.)
  app.set("trust proxy", true);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "2026-03-19-v3", env: process.env.NODE_ENV, time: new Date().toISOString() });
  });

  // SignSuiteIQ → InstalliQ user provisioning (one-way push from parent admin panel).
  // Auth is a shared secret in X-App-Secret. Do NOT add session/cookie auth here —
  // SignSuiteIQ calls server-to-server. Always returns JSON so caller never gets HTML.
  app.post("/api/internal/provision-user", async (req, res) => {
    try {
      // SSO_SECRET_INSTALLIQ is the spec name; fall back to the existing shared
      // secret so already-configured environments keep working.
      const expectedSecret =
        process.env.SSO_SECRET_INSTALLIQ || process.env.SIGNSUITEIQ_SSO_SECRET;
      const presentedSecret = req.header("X-App-Secret");
      if (!expectedSecret) {
        console.error("[Provision] No app secret configured (set SSO_SECRET_INSTALLIQ)");
        return res.status(401).json({ error: "invalid app secret" });
      }
      if (!presentedSecret || !timingSafeEqualStr(presentedSecret, expectedSecret)) {
        return res.status(401).json({ error: "invalid app secret" });
      }

      const body = req.body || {};
      const action = String(body.action || "").toLowerCase();
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const externalId = typeof body.external_id === "number" ? body.external_id : null;

      if (!email) return res.status(400).json({ error: "email is required" });
      if (action !== "upsert" && action !== "delete") {
        return res.status(400).json({ error: "action must be 'upsert' or 'delete'" });
      }

      const lcEmail = email.toLowerCase();
      let [existing] = await db
        .select()
        .from(users)
        .where(sql`LOWER(${users.email}) = ${lcEmail}`)
        .limit(1);
      // Fallback: if email lookup misses but we already track this external_id on
      // a different row (email changed in SignSuiteIQ), reconcile to that row so
      // we update it instead of inserting a duplicate that fails on the
      // signsuiteiq_user_id unique index.
      if (!existing && externalId != null) {
        const [byExt] = await db
          .select()
          .from(users)
          .where(eq(users.signsuiteiqUserId, externalId))
          .limit(1);
        if (byExt) existing = byExt;
      }

      if (action === "delete") {
        if (!existing) {
          console.log(`[Provision] delete: no user for ${lcEmail}, ignoring`);
          return res.status(200).json({ ok: true, ignored: true });
        }
        await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, existing.id));
        console.log(`[Provision] delete: archived user ${existing.id} (${lcEmail})`);
        return res.status(200).json({ ok: true, user_id: existing.id, action: "delete" });
      }

      // upsert: validate the rest of the required fields
      const username = typeof body.username === "string" && body.username.trim() ? body.username.trim() : null;
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
      const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : null;
      if (!username) return res.status(400).json({ error: "username is required" });
      if (!name) return res.status(400).json({ error: "name is required" });
      if (!role) return res.status(400).json({ error: "role is required" });
      // Whitelist roles SignSuiteIQ is allowed to provision so a malformed or
      // unexpected value can never be stored and break role-based access checks.
      const ALLOWED_PROVISION_ROLES = ["user", "installer", "admin", "super_admin"];
      if (!ALLOWED_PROVISION_ROLES.includes(role)) {
        return res.status(400).json({ error: `invalid role: ${role}` });
      }

      const phone = typeof body.phone === "string" ? body.phone : null;
      const jobTitle = typeof body.job_title === "string" ? body.job_title : null;
      const location = typeof body.location === "string" ? body.location : null;
      const plainPassword = typeof body.password === "string" && body.password.length > 0 ? body.password : null;

      // Resolve the owning admin so this user appears under them in User Management
      // (the app groups team members by created_by === admin.id). Match by the
      // admin's SignSuiteIQ id first (survives email changes), then by email.
      // If no admin matches, create the user unlinked and warn — never fail.
      const adminObj = body.admin && typeof body.admin === "object" ? body.admin : null;
      const adminEmail = adminObj && typeof adminObj.email === "string" ? adminObj.email.trim() : "";
      const adminExternalId = adminObj && typeof adminObj.external_id === "number" ? adminObj.external_id : null;
      let resolvedAdminId: number | null = null;
      if (adminExternalId != null) {
        const [byExt] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            sql`${users.signsuiteiqUserId} = ${adminExternalId} AND ${users.role} IN ('admin', 'super_admin') AND ${users.deletedAt} IS NULL`
          )
          .orderBy(sql`${users.id} ASC`)
          .limit(1);
        if (byExt) resolvedAdminId = byExt.id;
      }
      if (resolvedAdminId == null && adminEmail) {
        const [byEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(
            sql`LOWER(${users.email}) = ${adminEmail.toLowerCase()} AND ${users.role} IN ('admin', 'super_admin') AND ${users.deletedAt} IS NULL`
          )
          .orderBy(sql`${users.id} ASC`)
          .limit(1);
        if (byEmail) resolvedAdminId = byEmail.id;
      }
      // If no local admin exists but we have admin details from SignSuiteIQ,
      // auto-create the admin so the user can be linked immediately instead
      // of being created unlinked.
      if (resolvedAdminId == null && adminEmail) {
        const adminName = adminObj && typeof adminObj.name === "string" ? adminObj.name.trim() : adminEmail.split("@")[0];
        const adminUsername = adminObj && typeof adminObj.username === "string" ? adminObj.username.trim() : adminEmail.split("@")[0].replace(/[^a-z0-9._-]/g, "");

        // Check for username collision before creating
        let finalAdminUsername = adminUsername;
        const [adminCollision] = await db.select({ id: users.id }).from(users).where(ilike(users.username, finalAdminUsername)).limit(1);
        if (adminCollision) {
          finalAdminUsername = `${adminUsername}${Date.now() % 10000}`;
        }

        const unusablePassword = await bcrypt.hash(`!provisioned!${randomBytes(24).toString("hex")}`, 10);
        const [autoCreatedAdmin] = await db
          .insert(users)
          .values({
            username: finalAdminUsername,
            password: unusablePassword,
            name: adminName,
            email: adminEmail,
            role: "admin",
            signsuiteiqUserId: adminExternalId ?? undefined,
          })
          .returning();
        resolvedAdminId = autoCreatedAdmin.id;
        console.log(`[Provision] Auto-created admin ${autoCreatedAdmin.id} (${adminEmail}) from SignSuiteIQ external_id=${adminExternalId ?? "n/a"}`);
      }
      if (resolvedAdminId == null) {
        console.warn(`[Provision] No matching admin for ${lcEmail} (admin email: ${adminEmail || "n/a"}, admin external_id: ${adminExternalId ?? "n/a"}) — creating unlinked`);
      }

      if (existing) {
        const update: Record<string, any> = {
          name,
          role,
          phone,
          jobTitle,
          location,
          deletedAt: null,
        };
        if (externalId != null) update.signsuiteiqUserId = externalId;
        // Never change the admin an existing user already belongs to. Only
        // link to an admin when this user currently has none (createdBy is
        // null) so existing logins and admin assignments stay untouched.
        if (resolvedAdminId != null && existing.createdBy == null) {
          update.createdBy = resolvedAdminId;
          if (adminExternalId != null) update.signsuiteiqAdminId = adminExternalId;
        }
        // Only overwrite username if it isn't already taken by another row
        if (username && username !== existing.username) {
          const [collision] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(ilike(users.username, username), sql`${users.id} <> ${existing.id}`))
            .limit(1);
          if (!collision) update.username = username;
        }
        if (plainPassword) {
          update.password = await bcrypt.hash(plainPassword, 10);
        }
        await db.update(users).set(update).where(eq(users.id, existing.id));
        console.log(`[Provision] upsert: updated user ${existing.id} (${lcEmail})${plainPassword ? " [password reset]" : ""}`);
        return res.status(200).json({ ok: true, user_id: existing.id, action: "upsert" });
      }

      // Insert new user. If no password, store an unusable random hash so login fails
      // until the user goes through Forgot Password (or uses SSO).
      const passwordToHash = plainPassword || `!unusable!${randomBytes(24).toString("hex")}`;
      const hashedPassword = await bcrypt.hash(passwordToHash, 10);

      // Avoid username collisions for incoming usernames already in use by a different email
      let finalUsername = username;
      const [collision] = await db
        .select({ id: users.id })
        .from(users)
        .where(ilike(users.username, finalUsername))
        .limit(1);
      if (collision) {
        const base = finalUsername;
        let i = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const candidate = `${base}${i}`;
          const [c] = await db
            .select({ id: users.id })
            .from(users)
            .where(ilike(users.username, candidate))
            .limit(1);
          if (!c) { finalUsername = candidate; break; }
          i++;
          if (i > 1000) break;
        }
      }

      const [created] = await db
        .insert(users)
        .values({
          username: finalUsername,
          password: hashedPassword,
          name,
          email,
          role,
          phone,
          jobTitle,
          location,
          signsuiteiqUserId: externalId ?? undefined,
          createdBy: resolvedAdminId ?? undefined,
          signsuiteiqAdminId: adminExternalId ?? undefined,
        })
        .returning();
      console.log(`[Provision] upsert: created user ${created.id} (${lcEmail})${plainPassword ? "" : " [unusable password]"}`);
      return res.status(200).json({ ok: true, user_id: created.id, action: "upsert" });
    } catch (err) {
      console.error("[Provision] Error:", err);
      // Return generic 500 (no internal details) so SignSuiteIQ retries with backoff
      // without us leaking DB/schema messages over the wire.
      return res.status(500).json({ error: "internal error" });
    }
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "InstalliQ.ai API Documentation",
  }));
  app.get("/api-docs.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
  
  // Session middleware
  const isProduction = process.env.NODE_ENV === "production";
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "installiq-session-secret-fallback-2026",
      resave: false,
      saveUninitialized: false,
      store: new PgStore({
        pool: pool as any,
        tableName: "session",
        createTableIfMissing: true,
        pruneSessionInterval: 120,
        errorLog: (err: Error) => {
          console.error("Session store error:", err.message);
        },
      }),
      cookie: {
        secure: isProduction ? true : false,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
      proxy: isProduction,
    })
  );

  // Serve uploaded files
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cache-Control", "public, max-age=31536000");
    next();
  });
  
  // Import express to use static middleware
  const express = await import("express");
  app.use("/uploads", express.default.static(uploadDir));

  app.get("/api/image-proxy", async (req: Request, res: Response) => {
    try {
      const fileName = req.query.file as string;
      if (!fileName) {
        return res.status(400).json({ error: "Missing file parameter" });
      }

      const localPath = path.join(uploadDir, fileName);
      if (fs.existsSync(localPath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000");
        return res.sendFile(localPath);
      }

      if (objectStorageService) {
        try {
          const objectPath = `/objects/uploads/${fileName}`;
          const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
          const [buffer] = await objectFile.download();
          if (buffer) {
            res.setHeader("Cache-Control", "public, max-age=31536000");
            const ext = path.extname(fileName).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
              '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
            };
            res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
            return res.send(buffer);
          }
        } catch (e: any) {
        }
      }

      try {
        const signedUrl = await getPresignedUrl(`uploads/${fileName}`);
        const proxyRes = await fetch(signedUrl);
        if (proxyRes.ok) {
          const contentType = proxyRes.headers.get("content-type") || "application/octet-stream";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000");
          const buffer = Buffer.from(await proxyRes.arrayBuffer());
          return res.send(buffer);
        }
      } catch (e: any) {
      }

      res.status(404).json({ error: "File not found" });
    } catch (error: any) {
      console.error("Image proxy error:", error.message);
      res.status(500).json({ error: "Failed to fetch image" });
    }
  });

  if (objectStorageService) {
    const { registerObjectStorageRoutes } = require("./replit_integrations/object_storage");
    registerObjectStorageRoutes(app);
  }

  // Auth middleware
  const requireAuth = async (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // ============ AUTH ROUTES ============

  // Check current user
  app.get("/api/auth/me", async (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "User not found" });
    }
    // Surface the SignSuiteIQ app-switcher widget token to the browser if it
    // was captured on the most recent SSO sign-in and is still valid. We
    // proactively drop expired tokens from the session so the frontend never
    // tries to render the widget with a stale token (which would just show a
    // "session expired" pill).
    let signsuiteiqWidgetToken: string | null = null;
    const tok = req.session.signsuiteiqWidgetToken;
    const exp = req.session.signsuiteiqWidgetTokenExpiresAt;
    if (tok && exp && exp > Date.now()) {
      signsuiteiqWidgetToken = tok;
    } else if (tok || exp) {
      delete req.session.signsuiteiqWidgetToken;
      delete req.session.signsuiteiqWidgetTokenExpiresAt;
    }
    res.json({ user: sanitizeUser(user), signsuiteiqWidgetToken });
  });

  // One-time cleanup: remove broken local image paths that don't exist on disk
  // These occur when files were uploaded to ephemeral local storage instead of cloud storage
  try {
    const allProjects = await storage.getAllProjects();
    let cleanedCount = 0;
    for (const project of allProjects) {
      if (!project.imageUrls || project.imageUrls.length === 0) continue;
      const hasLocalPaths = project.imageUrls.some(url => url.startsWith("/uploads/") && !url.startsWith("/objects/"));
      if (!hasLocalPaths) continue;
      const cleanedUrls = project.imageUrls.filter(url => {
        if (url.startsWith("/uploads/") && !url.startsWith("/objects/")) {
          const filePath = path.join(uploadDir, url.replace("/uploads/", ""));
          if (!fs.existsSync(filePath)) {
            return false;
          }
        }
        return true;
      });
      if (cleanedUrls.length !== project.imageUrls.length) {
        await storage.updateProject(project.id, { imageUrls: cleanedUrls });
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) console.log(`Cleaned broken image paths from ${cleanedCount} project(s)`);
  } catch (err) {
    console.error("Error cleaning up broken local paths:", err);
  }

  // Signup
  const signupSchema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email(),
    phone: z.string().min(10),
    password: z.string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const data = signupSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const newUser = await storage.createUser({
        username: data.username,
        password: hashedPassword,
        name: data.username, // Use username as name initially
        email: data.email,
        phone: data.phone,
        role: "user",
        isMaster: "false",
      });

      res.status(201).json({ user: sanitizeUser(newUser) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Signup error:", error);
      res.status(500).json({ error: "Signup failed" });
    }
  });

  // Login
  const loginWithRememberSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    rememberMe: z.boolean().optional().default(false),
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      console.log("[LOGIN] Step 1: Parsing request body...");
      const data = loginWithRememberSchema.parse(req.body);
      console.log("[LOGIN] Step 2: Looking up user:", data.username);
      
      let user = await storage.getUserByUsername(data.username);
      if (!user) {
        user = await storage.getUserByEmail(data.username);
      }
      if (!user) {
        user = await storage.getUserByPhone(data.username);
      }
      
      if (!user) {
        console.log("[LOGIN] Step 3: User not found, checking if deleted or auto-register...");
        // Check if a soft-deleted user exists with this email/username/phone
        const deletedUser = await db.select().from(users).where(
          and(
            or(
              ilike(users.email, data.username),
              ilike(users.username, data.username),
              ilike(users.phone, data.username),
            ),
            sql`${users.deletedAt} IS NOT NULL`
          )
        );
        if (deletedUser.length > 0) {
          console.log("[LOGIN] User account has been deleted, blocking login");
          return res.status(401).json({ error: "This account has been deactivated. Please contact your administrator." });
        }
        const isEmail = data.username.includes("@");
        if (isEmail && data.password && data.password.length >= 6) {
          const hashedPassword = await bcrypt.hash(data.password, 10);
          const usernamePart = data.username.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
          let newUsername = usernamePart;
          let counter = 1;
          while (await storage.getUserByUsername(newUsername)) {
            newUsername = `${usernamePart}${counter}`;
            counter++;
          }
          user = await storage.createUser({
            username: newUsername,
            password: hashedPassword,
            name: usernamePart.replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
            email: data.username,
            role: "user",
          });
          console.log(`[LOGIN] Auto-registered new account for ${data.username}`);
        } else {
          console.log("[LOGIN] Not an email or password too short, rejecting");
          return res.status(401).json({ error: "Invalid email or password" });
        }
      } else {
        console.log("[LOGIN] Step 3: User found (id:", user.id, "), verifying password...");
        const validPassword = await bcrypt.compare(data.password, user.password);
        if (!validPassword) {
          console.log("[LOGIN] Password mismatch for user:", user.id);
          return res.status(401).json({ error: "Invalid email or password" });
        }
        console.log("[LOGIN] Step 4: Password verified");
      }

      console.log("[LOGIN] Step 5: Setting session for user:", user.id);
      req.session.userId = user.id;
      
      if (data.rememberMe) {
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
      } else {
        req.session.cookie.expires = false as any;
      }
      
      const safeUser = sanitizeUser(user);
      console.log("[LOGIN] Step 6: Saving session...");
      
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[LOGIN] Session save FAILED:", saveErr.message, saveErr.stack);
        } else {
          console.log("[LOGIN] Step 7: Session saved successfully");
        }
        logActivity(req, {
          action: "LOGIN",
          category: "Auth",
          description: `${user!.name} logged in`,
          resourceId: user!.id,
          resourceType: "user",
          overrideUserId: user!.id,
          overrideName: user!.name,
          overrideEmail: user!.email ?? undefined,
          overrideRole: user!.role,
        });
        console.log("[LOGIN] Step 8: Sending response");
        res.json({ user: safeUser });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[LOGIN] Zod validation error:", JSON.stringify(error.errors));
        return res.status(400).json({ error: error.errors[0].message });
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : "";
      console.error("[LOGIN] UNCAUGHT ERROR:", errMsg);
      console.error("[LOGIN] STACK:", errStack);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    logActivity(req, { action: "LOGOUT", category: "Auth", description: "User logged out" });
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // ============ SignSuiteIQ SSO ============
  // Browser is redirected here from SignSuiteIQ after the user clicks the
  // InstalliQ tile on their dashboard. We exchange the one-time code for a
  // user identity (server-to-server), then start a normal login session.
  function ssoErrorPage(message: string): string {
    const safe = String(message).replace(/[<>&"']/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] as string)
    );
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign-in failed — InstalliQ</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; max-width: 480px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 8px 0; color: #475569; line-height: 1.5; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  a { display: inline-block; margin-top: 16px; color: #2563eb; text-decoration: none; font-weight: 500; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="card">
    <h1>We couldn't sign you in</h1>
    <p>${safe}</p>
    <p>Please return to SignSuiteIQ and try clicking the InstalliQ tile again.</p>
    <a href="/login">Use email &amp; password instead</a>
  </div>
</body>
</html>`;
  }

  app.get("/sso/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!code) {
      return res.status(400).send(ssoErrorPage("Missing sign-in code."));
    }

    const clientSecret = process.env.SIGNSUITEIQ_SSO_SECRET;
    if (!clientSecret) {
      console.error("[SSO] SIGNSUITEIQ_SSO_SECRET is not configured");
      return res.status(500).send(ssoErrorPage("SSO is not configured on this server."));
    }

    let exchangeRes: Response;
    try {
      exchangeRes = await fetch("https://www.signsuiteiq.ai/api/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, clientId: "installiq", clientSecret }),
      });
    } catch (err) {
      console.error("[SSO] Network error contacting SignSuiteIQ:", err);
      return res.status(502).send(ssoErrorPage("Could not reach SignSuiteIQ. Please try again."));
    }

    if (!exchangeRes.ok) {
      let message = `Sign-in failed (HTTP ${exchangeRes.status}).`;
      try {
        const body = await exchangeRes.json();
        if (body && typeof body.message === "string") message = body.message;
        else if (body && typeof body.error === "string") message = body.error;
      } catch {
        try {
          const text = await exchangeRes.text();
          if (text) message = text.slice(0, 300);
        } catch {}
      }
      console.warn(`[SSO] Exchange rejected (${exchangeRes.status}): ${message}`);
      return res.status(401).send(ssoErrorPage(message));
    }

    let payload: any;
    try {
      payload = await exchangeRes.json();
    } catch (err) {
      console.error("[SSO] Invalid JSON from SignSuiteIQ:", err);
      return res.status(502).send(ssoErrorPage("Invalid response from SignSuiteIQ."));
    }

    const remote = payload?.user;
    if (!remote || typeof remote.id !== "number") {
      return res.status(502).send(ssoErrorPage("SignSuiteIQ did not return a valid user."));
    }

    try {
      // 1. Try direct match by signsuiteiq_user_id.
      let user = await storage.getUserBySignsuiteiqUserId(remote.id);

      // 2. Fall back to email match (case-insensitive); stamp the SSO id so
      //    future logins go straight through.
      if (!user && typeof remote.email === "string" && remote.email.length > 0) {
        const byEmail = await storage.getUserByEmail(remote.email);
        if (byEmail) {
          user = (await storage.updateUser(byEmail.id, { signsuiteiqUserId: remote.id })) || byEmail;
        }
      }

      // 3. Otherwise create a new SSO-only local user (random unguessable
      //    password — they will only ever sign in via SSO).
      if (!user) {
        const role: "user" | "admin" | "super_admin" =
          remote.role === "admin" || remote.role === "super_admin" ? remote.role : "user";

        const baseUsername =
          (typeof remote.username === "string" && remote.username.trim()) ||
          (typeof remote.email === "string" && remote.email.split("@")[0]) ||
          `sso-user-${remote.id}`;
        const cleaned = baseUsername.replace(/[^a-zA-Z0-9._-]/g, "") || `sso-user-${remote.id}`;
        let username = cleaned;
        let counter = 1;
        while (await storage.getUserByUsername(username)) {
          username = `${cleaned}${counter}`;
          counter++;
        }

        const randomPassword = randomBytes(32).toString("hex");
        const hashedPassword = await bcrypt.hash(randomPassword, 10);

        user = await storage.createUser({
          username,
          password: hashedPassword,
          name: typeof remote.name === "string" && remote.name.trim() ? remote.name : username,
          email: typeof remote.email === "string" ? remote.email : null,
          phone: typeof remote.phone === "string" ? remote.phone : null,
          role,
          signsuiteiqUserId: remote.id,
        });
      }

      // Start the normal session — same cookie used by /api/auth/login.
      req.session.userId = user.id;
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;

      // Capture the SignSuiteIQ app-switcher widget token (if the exchange
      // returned one). We stash it on the session so the React app shell can
      // render the cross-app launcher without us proxying anything. Refreshed
      // on every SSO sign-in.
      if (typeof payload?.widgetToken === "string" && payload.widgetToken.length > 0) {
        const expiresInSec = typeof payload?.widgetTokenExpiresIn === "number"
          ? payload.widgetTokenExpiresIn
          : 86400; // default to 24h per SignSuiteIQ docs
        req.session.signsuiteiqWidgetToken = payload.widgetToken;
        req.session.signsuiteiqWidgetTokenExpiresAt = Date.now() + expiresInSec * 1000;
      }

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[SSO] Session save failed:", saveErr);
          return res.status(500).send(ssoErrorPage("Could not start your session."));
        }
        logActivity(req, {
          action: "LOGIN",
          category: "Auth",
          description: `${user!.name} logged in via SignSuiteIQ SSO`,
          resourceId: user!.id,
          resourceType: "user",
          overrideUserId: user!.id,
          overrideName: user!.name,
          overrideEmail: user!.email ?? undefined,
          overrideRole: user!.role,
        });
        res.redirect("/");
      });
    } catch (err) {
      console.error("[SSO] Unexpected error:", err);
      res.status(500).send(ssoErrorPage("Something went wrong while signing you in."));
    }
  });

  // ============ FACE RECOGNITION ============

  function euclideanDistance(desc1: number[], desc2: number[]): number {
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
      sum += (desc1[i] - desc2[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  const FACE_MATCH_THRESHOLD = 0.6;

  app.post("/api/auth/face-login", async (req, res) => {
    try {
      const { descriptor } = req.body;
      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return res.status(400).json({ error: "Valid face descriptor (128-d) is required" });
      }

      const faceUsers = await storage.getUsersWithFaceEnabled();
      if (faceUsers.length === 0) {
        return res.status(401).json({ error: "No users have face login enabled. Please use email and password to sign in." });
      }

      let bestMatch: { user: User | null; distance: number } = { user: null, distance: Infinity };
      for (const user of faceUsers) {
        if (!user.faceDescriptor) continue;
        const storedDescriptor = JSON.parse(user.faceDescriptor);
        const distance = euclideanDistance(descriptor, storedDescriptor);
        if (distance < bestMatch.distance) {
          bestMatch = { user, distance };
        }
      }

      if (!bestMatch.user || bestMatch.distance > FACE_MATCH_THRESHOLD) {
        return res.status(401).json({ error: "Face not recognized. Please try again or use email and password to sign in." });
      }

      req.session.userId = bestMatch.user.id;
      req.session.cookie.expires = false as any;

      logActivity(req, {
        action: "LOGIN",
        category: "Auth",
        description: `${bestMatch.user.name} logged in via face recognition`,
        resourceId: bestMatch.user.id,
        resourceType: "user",
        overrideUserId: bestMatch.user.id,
        overrideName: bestMatch.user.name,
        overrideEmail: bestMatch.user.email ?? undefined,
        overrideRole: bestMatch.user.role,
        metadata: { method: "face" },
      });

      res.json({ user: sanitizeUser(bestMatch.user) });
    } catch (error) {
      console.error("Face login error:", error);
      res.status(500).json({ error: "Face login failed" });
    }
  });

  app.post("/api/auth/face-register", requireAuth, async (req, res) => {
    try {
      const { descriptor, photo } = req.body;
      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return res.status(400).json({ error: "Valid face descriptor (128-d) is required" });
      }

      const userId = req.session.userId!;
      await storage.updateUserFaceData(userId, JSON.stringify(descriptor), true, photo || undefined);

      logActivity(req, {
        action: "FACE_REGISTERED",
        category: "Auth",
        description: "Registered face for Face ID login",
        resourceType: "user",
      });

      res.json({ success: true, message: "Face registered successfully" });
    } catch (error) {
      console.error("Face register error:", error);
      res.status(500).json({ error: "Failed to register face" });
    }
  });

  app.post("/api/auth/face-disable", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await storage.clearUserFaceData(userId);

      logActivity(req, {
        action: "FACE_DISABLED",
        category: "Auth",
        description: "Disabled Face ID login",
        resourceType: "user",
      });

      res.json({ success: true, message: "Face login disabled" });
    } catch (error) {
      console.error("Face disable error:", error);
      res.status(500).json({ error: "Failed to disable face login" });
    }
  });

  app.get("/api/auth/face-status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        faceEnabled: user.faceEnabled,
        faceRegisteredAt: user.faceRegisteredAt,
        facePhoto: user.facePhoto || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get face status" });
    }
  });

  // ============ GOOGLE OAUTH LOGIN ============

  app.get("/api/auth/google/available", async (_req, res) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/\\n/g, '');
      if (!clientId) return res.json({ available: false });
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.googleEnabled, true));
      const count = Number(result[0]?.count || 0);
      res.json({ available: count > 0 });
    } catch (error) {
      res.json({ available: false });
    }
  });

  app.get("/api/auth/google/status", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        googleEnabled: user.googleEnabled,
        googleEmail: user.googleEmail || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get Google status" });
    }
  });

  app.get("/api/auth/google", (req, res) => {
    const mode = req.query.mode as string || "login";
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/\\n/g, '');
    if (!clientId) return res.status(500).json({ error: "Google OAuth not configured" });

    const state = randomBytes(16).toString("hex");
    req.session.googleOAuthState = state;
    req.session.googleOAuthMode = mode;

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string | undefined>;
      const savedState = req.session.googleOAuthState;
      const mode = req.session.googleOAuthMode || "login";

      delete req.session.googleOAuthState;
      delete req.session.googleOAuthMode;

      // Mode-aware failure redirect helper — Drive failures go to /assets, others to root.
      const failRedirect = (message: string) =>
        mode === "drive"
          ? res.redirect(`/assets?driveError=${encodeURIComponent(message)}`)
          : res.redirect(`/?error=google_auth_failed&message=${encodeURIComponent(message)}`);

      // Google denied the request (user clicked "Deny" or app not approved)
      if (oauthError) {
        return failRedirect(oauthError);
      }

      if (!code || !state || state !== savedState) {
        return failRedirect("Invalid state");
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const redirectUri = `${protocol}://${host}/api/auth/google/callback`;


      const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/\\n/g, '');
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim().replace(/\\n/g, '');
      if (!clientId || !clientSecret) {
        return res.redirect("/?error=google_auth_failed&message=OAuth+not+configured");
      }

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        return res.redirect("/?error=google_auth_failed&message=Token+exchange+failed");
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        return res.redirect("/?error=google_auth_failed&message=Profile+fetch+failed");
      }

      const profile = await profileRes.json();
      const googleId = profile.id;
      const googleEmail = profile.email;

      if (mode === "link") {
        if (!req.session.userId) {
          return res.redirect("/account?error=not_authenticated");
        }

        const existingUser = await storage.getUserByGoogleId(googleId);
        if (existingUser && existingUser.id !== req.session.userId) {
          return res.redirect("/account?error=google_already_linked&message=This+Google+account+is+linked+to+another+user");
        }

        await storage.updateUser(req.session.userId, {
          googleId,
          googleEmail,
          googleEnabled: true,
        });

        return res.redirect("/account?success=google_linked");
      }

      const user = await storage.getUserByGoogleId(googleId);
      if (!user) {
        return res.redirect("/?error=google_auth_failed&message=No+account+linked+to+this+Google+account.+Please+link+your+Google+account+in+Settings+first.");
      }

      req.session.userId = user.id;
      return req.session.save(() => {
        res.redirect("/dashboard");
      });
    } catch (error) {
      console.error("Google OAuth error:", error);
      return res.redirect("/?error=google_auth_failed&message=Authentication+failed");
    }
  });

  app.post("/api/auth/google/unlink", requireAuth, async (req, res) => {
    try {
      await storage.updateUser(req.session.userId!, {
        googleId: null,
        googleEmail: null,
        googleEnabled: false,
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to unlink Google account" });
    }
  });

  // ============ PASSWORD RESET ============

  // Request password reset
  const requestResetSchema = z.object({
    identifier: z.string().min(1, "Please enter your email or username"),
  });

  app.post("/api/auth/request-password-reset", async (req, res) => {
    try {
      const data = requestResetSchema.parse(req.body);
      const identifier = data.identifier.trim();
      
      // Try to find user by email first, then by username
      let user = await storage.getUserByEmail(identifier);
      if (!user) {
        user = await storage.getUserByUsername(identifier);
      }
      
      // Always return success to prevent enumeration
      if (!user) {
        return res.json({ success: true, message: "If an account exists, a reset link has been sent." });
      }

      // User found but has no email to send to
      if (!user.email) {
        return res.status(400).json({ error: "No email address is associated with this account. Please contact your administrator to reset your password." });
      }

      // Generate secure token (32 bytes = 64 hex characters)
      const token = randomBytes(32).toString("hex");
      
      // Token expires in 1 hour
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      await storage.createPasswordResetToken({
        userId: user.id,
        token,
        expiresAt,
        used: false,
      });

      // Build reset URL
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;

      // Send reset email
      const transporter = createTransporter();

      try {
        await transporter.verify();
      } catch (verifyError: any) {
        console.error("SMTP verify failed:", verifyError?.message);
        return res.status(500).json({ error: "Email service is currently unavailable. Please contact your administrator to reset your password." });
      }

      const emailBody = emailTemplates.passwordResetRequest({
        name: user.name || user.username,
        resetUrl,
      });

      try {
        const info = await transporter.sendMail({
          from: `"InstalliQ" <${getFromAddress()}>`,
          to: formatEmailAddress(user.email, user.name || user.username),
          bcc: "info@installiq.ai",
          subject: "InstalliQ.ai - Password Reset Request",
          html: emailBody,
        });
        console.log(`Password reset email sent successfully to ${user.email}, messageId: ${info.messageId}`);
        logSystemActivity({
          action: "EMAIL_SENT",
          category: "Email",
          description: `Password reset email sent to ${user.email}`,
          userId: user.id,
          resourceType: "email",
          metadata: { to: user.email, subject: "Password Reset Request", provider: "SMTP", messageId: info.messageId },
        });
      } catch (emailError: any) {
        console.error("Failed to send password reset email:", emailError?.message || emailError);
        logSystemActivity({
          action: "EMAIL_FAILED",
          category: "Email",
          description: `Password reset email failed to ${user.email}`,
          userId: user.id,
          resourceType: "email",
          metadata: { to: user.email, subject: "Password Reset Request", provider: "SMTP", error: emailError?.message },
        });
        return res.status(500).json({ error: "Unable to send password reset email. Please contact your administrator to reset your password." });
      }

      res.json({ success: true, message: "If an account exists with this email, a reset link has been sent." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Password reset request error:", error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Validate reset token
  app.get("/api/auth/validate-reset-token", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        return res.status(400).json({ valid: false, error: "Token is required" });
      }

      const resetToken = await storage.getPasswordResetToken(token);
      if (!resetToken) {
        return res.json({ valid: false, error: "Invalid or expired reset link" });
      }

      if (resetToken.used) {
        return res.json({ valid: false, error: "This reset link has already been used" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.json({ valid: false, error: "This reset link has expired" });
      }

      res.json({ valid: true });
    } catch (error) {
      console.error("Token validation error:", error);
      res.status(500).json({ valid: false, error: "Failed to validate token" });
    }
  });

  // Reset password
  const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token is required"),
    password: z.string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const data = resetPasswordSchema.parse(req.body);
      
      const resetToken = await storage.getPasswordResetToken(data.token);
      if (!resetToken) {
        return res.status(400).json({ error: "Invalid or expired reset link" });
      }

      if (resetToken.used) {
        return res.status(400).json({ error: "This reset link has already been used" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ error: "This reset link has expired" });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(data.password, 10);
      await storage.updateUserPassword(resetToken.userId, hashedPassword);
      await storage.markPasswordResetTokenUsed(resetToken.id);

      // Get user for confirmation email
      const user = await storage.getUser(resetToken.userId);

      // Send confirmation email
      if (user?.email) {
        const transporter = createTransporter();

        const emailBody = emailTemplates.passwordResetSuccess({
          name: user.name || user.username,
        });

        try {
          await transporter.sendMail({
            from: `"InstalliQ" <${getFromAddress()}>`,
            to: formatEmailAddress(user.email, user.name || user.username),
            bcc: "info@installiq.ai",
            subject: "InstalliQ.ai - Password Updated",
            html: emailBody,
          });
          logSystemActivity({
            action: "EMAIL_SENT",
            category: "Email",
            description: `Password updated confirmation email sent to ${user.email}`,
            userId: user.id,
            resourceType: "email",
            metadata: { to: user.email, subject: "Password Updated", provider: "SMTP" },
          });
        } catch (emailError) {
          console.error("Failed to send password reset confirmation email:", emailError);
          logSystemActivity({
            action: "EMAIL_FAILED",
            category: "Email",
            description: `Password updated confirmation email failed to ${user.email}`,
            userId: user.id,
            resourceType: "email",
            metadata: { to: user.email, subject: "Password Updated", provider: "SMTP", error: String(emailError) },
          });
        }
      }

      logActivity(req, {
        action: "PASSWORD_RESET_COMPLETED",
        category: "Auth",
        description: `Password reset via email link for ${user?.name || "unknown user"}`,
        resourceId: resetToken.userId,
        resourceType: "user",
        overrideUserId: resetToken.userId,
        overrideName: user?.name || undefined,
        overrideEmail: user?.email || undefined,
        overrideRole: user?.role || undefined,
      });

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Change password (for logged-in users)
  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[0-9]/, "Password must contain at least one number")
      .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const data = changePasswordSchema.parse(req.body);
      const user = await storage.getUser(req.session.userId!);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const validPassword = await bcrypt.compare(data.currentPassword, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(data.newPassword, 10);
      await storage.updateUserPassword(user.id, hashedPassword);
      await storage.clearTempPassword(user.id);

      logActivity(req, {
        action: "CHANGE_PASSWORD",
        category: "Auth",
        description: `${user.name} changed their own password`,
        resourceId: user.id,
        resourceType: "user",
        metadata: {
          targetUserId: user.id,
          targetUserName: user.name,
          targetUserRole: user.role,
          isSelfEdit: true,
          passwordReset: true,
          changes: [],
        },
      });

      const updatedUser = await storage.getUser(user.id) as User;
      res.json({ success: true, message: "Password changed successfully", user: sanitizeUser(updatedUser) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // ============ APP SETTINGS (self-delete toggle) ============
  // Public-to-logged-in users: read whether self-delete is enabled
  app.get("/api/app-settings/self-delete-enabled", requireAuth, async (_req, res) => {
    try {
      const value = await storage.getAppSetting("self_delete_account_enabled");
      res.json({ enabled: value === "true" });
    } catch (error) {
      console.error("Get self-delete setting error:", error);
      res.status(500).json({ error: "Failed to load setting" });
    }
  });

  // Super admin only: update the toggle
  app.put("/api/admin/app-settings/self-delete-enabled", requireAuth, async (req, res) => {
    try {
      const me = await storage.getUser(req.session.userId!);
      if (!me || me.role !== "super_admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }
      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "`enabled` must be a boolean" });
      }
      await storage.setAppSetting("self_delete_account_enabled", enabled ? "true" : "false");
      logActivity(req, {
        action: "UPDATE_APP_SETTING",
        category: "Admin",
        description: `${me.name} ${enabled ? "enabled" : "disabled"} self-service account deletion for users`,
        resourceType: "app_setting",
      });
      res.json({ success: true, enabled });
    } catch (error) {
      console.error("Set self-delete setting error:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // ============ DELETE OWN ACCOUNT ============
  app.post("/api/auth/delete-account", requireAuth, async (req, res) => {
    try {
      const { password } = req.body ?? {};
      if (!password || typeof password !== "string") {
        return res.status(400).json({ error: "Password is required" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.role !== "user") {
        return res.status(403).json({
          error: "Admin and Super Admin accounts cannot self-delete. Please contact a Super Admin.",
        });
      }

      const enabledValue = await storage.getAppSetting("self_delete_account_enabled");
      if (enabledValue !== "true") {
        return res.status(403).json({
          error: "Self-service account deletion is currently disabled. Please contact your administrator.",
        });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Password is incorrect" });
      }

      logActivity(req, {
        action: "DELETE_ACCOUNT",
        category: "Auth",
        description: `${user.name} deleted their own account (${user.email})`,
        resourceId: user.id,
        resourceType: "user",
      });

      await storage.deleteUser(user.id);
      await storage.permanentDeleteUsers([user.id]);

      req.session.destroy(() => {
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // ============ PDF BRANDING SETTINGS ============
  app.get("/api/auth/pdf-branding", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        pdfLogoUrl: user.pdfLogoUrl || null,
        pdfTemplateUrl: user.pdfTemplateUrl || null,
        pdfCompanyName: user.pdfCompanyName || null,
        pdfCompanyAddress: user.pdfCompanyAddress || null,
        pdfCompanyPhone: user.pdfCompanyPhone || null,
        pdfCompanyEmail: user.pdfCompanyEmail || null,
      });
    } catch (error) {
      console.error("Error fetching PDF branding:", error);
      res.status(500).json({ error: "Failed to fetch PDF branding" });
    }
  });

  app.patch("/api/auth/pdf-branding", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { pdfCompanyName, pdfCompanyAddress, pdfCompanyPhone, pdfCompanyEmail } = req.body;
      await db.update(users).set({
        pdfCompanyName: pdfCompanyName ?? user.pdfCompanyName,
        pdfCompanyAddress: pdfCompanyAddress ?? user.pdfCompanyAddress,
        pdfCompanyPhone: pdfCompanyPhone ?? user.pdfCompanyPhone,
        pdfCompanyEmail: pdfCompanyEmail ?? user.pdfCompanyEmail,
      }).where(eq(users.id, user.id));
      res.json({ success: true, message: "PDF branding updated" });
    } catch (error) {
      console.error("Error updating PDF branding:", error);
      res.status(500).json({ error: "Failed to update PDF branding" });
    }
  });

  app.post("/api/auth/pdf-branding/logo", requireAuth, upload.single("logo"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No logo file uploaded" });

      const ext = path.extname(file.originalname) || ".png";
      const logoFileName = `logo_${user.id}_${Date.now()}${ext}`;
      const logoUrl = await uploadToSpaces(file.path, logoFileName, file.mimetype);

      await db.update(users).set({ pdfLogoUrl: logoUrl }).where(eq(users.id, user.id));
      res.json({ success: true, logoUrl });
    } catch (error) {
      console.error("Error uploading PDF logo:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  app.post("/api/auth/pdf-branding/template", requireAuth, upload.single("template"), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const file = req.file;
      if (!file) return res.status(400).json({ error: "No template file uploaded" });

      const isPdf = file.mimetype === "application/pdf";
      const isImage = /jpeg|jpg|png|gif|webp/.test(file.mimetype);

      if (!isPdf && !isImage) {
        try { fs.unlinkSync(file.path); } catch {}
        return res.status(400).json({ error: "Template must be a PDF or image file (PNG, JPG)" });
      }

      let templateUrl: string;
      const timestamp = Date.now();

      if (isPdf) {
        const outputPattern = file.path.replace(/\.pdf$/i, "-tmpl");
        let convertedImagePath: string | null = null;
        try {
          await execAsync(`pdftoppm -png -r 200 -f 1 -l 1 "${file.path}" "${outputPattern}"`);
          const dir = path.dirname(file.path);
          const baseName = path.basename(file.path, ".pdf");
          const dirFiles = fs.readdirSync(dir);
          const imgFile = dirFiles.find((f: string) => f.startsWith(baseName.replace(/\.pdf$/i, "") + "-tmpl") && f.endsWith(".png"));
          if (imgFile) convertedImagePath = path.join(dir, imgFile);
        } catch (err) {
          console.error("PDF template conversion failed:", err);
        }

        if (!convertedImagePath) {
          try { fs.unlinkSync(file.path); } catch {}
          return res.status(400).json({ error: "Failed to process PDF template. Please try uploading a PNG or JPG image instead." });
        }

        const templateFileName = `template_${user.id}_${timestamp}.png`;
        const imgBuffer = fs.readFileSync(convertedImagePath);
        templateUrl = await uploadBufferToSpaces(imgBuffer, templateFileName, "image/png");
        try { fs.unlinkSync(file.path); } catch {}
        if (convertedImagePath) try { fs.unlinkSync(convertedImagePath); } catch {}
      } else {
        const tmplExt = path.extname(file.originalname) || ".png";
        const tmplFileName = `template_${user.id}_${timestamp}${tmplExt}`;
        templateUrl = await uploadToSpaces(file.path, tmplFileName, file.mimetype);
      }

      await db.update(users).set({ pdfTemplateUrl: templateUrl }).where(eq(users.id, user.id));
      res.json({ success: true, templateUrl });
    } catch (error) {
      console.error("Error uploading PDF template:", error);
      res.status(500).json({ error: "Failed to upload template" });
    }
  });

  app.delete("/api/auth/pdf-branding/logo", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      await db.update(users).set({ pdfLogoUrl: null }).where(eq(users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing PDF logo:", error);
      res.status(500).json({ error: "Failed to remove logo" });
    }
  });

  app.delete("/api/auth/pdf-branding/template", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      await db.update(users).set({ pdfTemplateUrl: null }).where(eq(users.id, user.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing PDF template:", error);
      res.status(500).json({ error: "Failed to remove template" });
    }
  });

  app.get("/api/auth/pdf-branding/template/blank", requireAuth, async (_req, res) => {
    try {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margin: 0 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => {
        const buf = Buffer.concat(chunks);
        res.set({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="InstalliQ_Blank_Template.pdf"',
          "Content-Length": buf.length.toString(),
        });
        res.send(buf);
      });

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const margin = 50;
      const contentW = pageW - margin * 2;

      doc.rect(0, 0, pageW, pageH).fill("#ffffff");

      doc.save();
      doc.rect(margin, margin, contentW, pageH - margin * 2).dash(3, { space: 4 }).lineWidth(0.75).strokeColor("#c0c0c0").stroke();
      doc.undash();
      doc.restore();

      const bannerH = 56;
      doc.save();
      doc.rect(0, 0, pageW, bannerH).dash(2, { space: 3 }).lineWidth(0.5).strokeColor("#f97316").stroke();
      doc.undash();
      doc.restore();
      doc.fontSize(8).fillColor("#f97316").text("HEADER ZONE — Logo, company name, date (auto-generated if no template)", margin + 8, 20, { width: contentW - 16 });
      doc.fontSize(6).fillColor("#999999").text("Height: 56pt  •  Full width", margin + 8, 34);

      const footerH = 40;
      const footerY = pageH - footerH;
      doc.save();
      doc.rect(0, footerY, pageW, footerH).dash(2, { space: 3 }).lineWidth(0.5).strokeColor("#f97316").stroke();
      doc.undash();
      doc.restore();
      doc.fontSize(8).fillColor("#f97316").text("FOOTER ZONE — Page number (auto-generated if no template)", margin + 8, footerY + 14, { width: contentW - 16 });
      doc.fontSize(6).fillColor("#999999").text("Height: 40pt  •  Full width", margin + 8, footerY + 26);

      doc.save();
      doc.rect(margin, bannerH + 10, contentW, footerY - bannerH - 20).dash(2, { space: 4 }).lineWidth(0.5).strokeColor("#d1d5db").stroke();
      doc.undash();
      doc.restore();
      doc.fontSize(9).fillColor("#6b7280").text("CONTENT AREA", margin + 8, bannerH + 20);
      doc.fontSize(7).fillColor("#9ca3af").text("Report content (project details, photos, tables) will be placed here.", margin + 8, bannerH + 34);
      doc.fontSize(7).fillColor("#9ca3af").text("Text is rendered with 50pt margins on all sides.", margin + 8, bannerH + 48);

      const guideY = pageH / 2 - 80;
      doc.fontSize(11).fillColor("#374151").text("InstalliQ — Blank PDF Template Guide", margin + 8, guideY, { width: contentW - 16, align: "center" });
      doc.moveDown(0.8);
      const instrX = margin + 30;
      const instrW = contentW - 60;
      doc.fontSize(8.5).fillColor("#4b5563");
      const instructions = [
        "1.  Use this page as your design canvas (US Letter: 8.5\" × 11\", 612 × 792 pt).",
        "2.  Add your company branding — logo, colors, header/footer artwork.",
        "3.  Keep the content area (between header & footer) mostly clear for report data.",
        "4.  Text in the report uses 50pt side margins. Avoid placing dark elements there.",
        "5.  Export your finished design as a single-page PDF or PNG image.",
        "6.  Upload it in Account Settings → PDF Branding → Branded PDF Template.",
        "7.  All future Project and Survey reports will use your design as the background.",
      ];
      for (const line of instructions) {
        doc.text(line, instrX, doc.y, { width: instrW });
        doc.moveDown(0.4);
      }

      doc.moveDown(1);
      doc.fontSize(7).fillColor("#9ca3af").text("Tip: Header and footer zones are shown for reference only. When you upload a custom template, the entire page becomes your background — there are no auto-generated header/footer elements.", instrX, doc.y, { width: instrW });

      doc.fontSize(6).fillColor("#d1d5db").text("Page: 612 × 792 pt  (US Letter)  •  Margins: 50pt", margin + 8, pageH - margin - 10, { width: contentW - 16, align: "right" });

      doc.end();
    } catch (error) {
      console.error("Error generating blank template:", error);
      res.status(500).json({ error: "Failed to generate blank template" });
    }
  });

  // Admin middleware - admins and super admins can access these routes
  const requireAdmin = async (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  const requireAdminOrInstallManager = async (req: Request, res: Response, next: Function) => {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const isAdmin = user.role === "admin" || user.role === "super_admin";
    const isInstallManager = user.role === "user" && user.jobTitle === "Install Manager";
    if (!isAdmin && !isInstallManager) {
      return res.status(403).json({ error: "Admin or Install Manager access required" });
    }
    next();
  };

  // ============ ONBOARDING QUESTIONS MANAGEMENT (SUPER ADMIN) ============

  const { DEFAULT_ONBOARDING_QUESTIONS } = await import("./seeders");

  app.get("/api/admin/onboarding-questions", requireAdmin, async (req, res) => {
    try {
      const questions = await storage.getOnboardingQuestions();
      res.json(questions);
    } catch (error) {
      console.error("Error fetching onboarding questions:", error);
      res.status(500).json({ error: "Failed to fetch onboarding questions" });
    }
  });

  app.get("/api/admin/onboarding-form/:userId", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const targetUserId = parseInt(req.params.userId);
      const [form] = await db.select().from(onboardingForms).where(eq(onboardingForms.userId, targetUserId));
      const targetUser = await storage.getUser(targetUserId);
      res.json({ form: form || null, user: targetUser ? { id: targetUser.id, name: targetUser.name, email: targetUser.email } : null });
    } catch (error) {
      console.error("Error fetching owner onboarding form:", error);
      res.status(500).json({ error: "Failed to fetch onboarding form" });
    }
  });

  app.get("/api/onboarding-questions", requireAuth, async (req, res) => {
    try {
      const questions = await storage.getActiveOnboardingQuestions();
      res.json(questions);
    } catch (error) {
      console.error("Error fetching active onboarding questions:", error);
      res.status(500).json({ error: "Failed to fetch onboarding questions" });
    }
  });

  app.post("/api/admin/onboarding-questions", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const questionSchema = z.object({
        stepName: z.string().min(1),
        stepTitle: z.string().min(1),
        stepIcon: z.string().default("HelpCircle"),
        stepDescription: z.string().default(""),
        questionLabel: z.string().min(1),
        questionKey: z.string().min(1),
        questionType: z.string().default("text"),
        options: z.string().default(""),
        placeholder: z.string().default(""),
        required: z.boolean().default(false),
        sortOrder: z.number().default(0),
        stepOrder: z.number().default(0),
        isActive: z.boolean().default(true),
      });
      const data = questionSchema.parse(req.body);
      const question = await storage.createOnboardingQuestion(data);
      res.status(201).json(question);
    } catch (error) {
      console.error("Error creating onboarding question:", error);
      res.status(500).json({ error: "Failed to create question" });
    }
  });

  app.patch("/api/admin/onboarding-questions/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const id = parseInt(req.params.id);
      const updated = await storage.updateOnboardingQuestion(id, req.body);
      if (!updated) return res.status(404).json({ error: "Question not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating onboarding question:", error);
      res.status(500).json({ error: "Failed to update question" });
    }
  });

  app.delete("/api/admin/onboarding-questions/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const id = parseInt(req.params.id);
      await storage.deleteOnboardingQuestion(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting onboarding question:", error);
      res.status(500).json({ error: "Failed to delete question" });
    }
  });

  app.post("/api/admin/onboarding-questions/seed", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const existing = await storage.getOnboardingQuestions();
      if (existing.length > 0) {
        return res.status(400).json({ error: "Questions already exist. Delete all existing questions first to re-seed." });
      }
      for (const q of DEFAULT_ONBOARDING_QUESTIONS) {
        await storage.createOnboardingQuestion(q as any);
      }
      const questions = await storage.getOnboardingQuestions();
      res.json({ seeded: questions.length, questions });
    } catch (error) {
      console.error("Error seeding onboarding questions:", error);
      res.status(500).json({ error: "Failed to seed questions" });
    }
  });

  app.post("/api/onboarding/upload", requireAuth, onboardingDocUpload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const cdnUrl = await uploadFileToObjectStorage(
        file.path,
        `onboarding/${req.session.userId}/${file.filename}`,
        file.mimetype,
        req.session.userId!
      );
      res.json({
        url: cdnUrl,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      });
    } catch (error) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      console.error("Error uploading onboarding file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // ============ ONBOARDING FORM ROUTES ============

  app.get("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const [form] = await db.select().from(onboardingForms).where(eq(onboardingForms.userId, req.session.userId!));
      res.json({ form: form || null });
    } catch (error) {
      console.error("Error fetching onboarding form:", error);
      res.status(500).json({ error: "Failed to fetch onboarding form" });
    }
  });

  app.post("/api/onboarding", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const onboardingSchema = z.object({
        businessAddress: z.string().optional().default(""),
        installationRange: z.string().optional().default(""),
        chargeTravelTime: z.string().optional().default(""),
        setupCleanupTime: z.string().optional().default(""),
        teamSize: z.string().optional().default(""),
        schedulingPOC: z.string().optional().default(""),
        calendarOwner: z.string().optional().default(""),
        subInstallerCount: z.string().optional().default(""),
        subInstallerCoordinator: z.string().optional().default(""),
        customerNotification: z.string().optional().default(""),
        hasBucketTruck: z.string().optional().default(""),
        bucketTruckMinTime: z.string().optional().default(""),
        bucketTruckTwoInstallers: z.string().optional().default(""),
        ladderMaxHeight: z.string().optional().default(""),
        ladderTwoPeople: z.string().optional().default(""),
        vehicleGraphics: z.string().optional().default(""),
        hasGarage: z.string().optional().default(""),
        doesWraps: z.string().optional().default(""),
        installsPosts: z.string().optional().default(""),
        signTypes: z.array(z.string()).optional().default([]),
        pricingProductList: z.string().optional().default(""),
        installTimeStandards: z.string().optional().default(""),
        additionalNotes: z.string().optional().default(""),
        fileUploads: z.record(z.string(), z.array(z.object({
          url: z.string(),
          originalName: z.string(),
          size: z.number(),
          mimeType: z.string(),
        }))).optional(),
        businessDetailsData: z.object({
          businessName: z.string().optional().default(""),
          businessAddress: z.string().optional().default(""),
          businessCity: z.string().optional().default(""),
          businessState: z.string().optional().default(""),
          businessZip: z.string().optional().default(""),
          contactNumber: z.string().optional().default(""),
          businessEmail: z.string().optional().default(""),
          website: z.string().optional().default(""),
          taxId: z.string().optional().default(""),
          businessType: z.string().optional().default(""),
          yearEstablished: z.string().optional().default(""),
          numberOfEmployees: z.string().optional().default(""),
          additionalNotes: z.string().optional().default(""),
        }).optional(),
      }).passthrough();
      const formData = onboardingSchema.parse(req.body);
      const { businessDetailsData, fileUploads: uploadedFiles, ...rawOnboardingData } = formData;

      if (uploadedFiles) {
        for (const [key, files] of Object.entries(uploadedFiles)) {
          const fileList = files.map((f: any) => `[FILE:${f.originalName}](${f.url})`).join("\n");
          const parentKey = key.replace(/Files$/, "");
          const targetKey = (rawOnboardingData as any)[parentKey] !== undefined ? parentKey : key;
          const existingVal = (rawOnboardingData as any)[targetKey] || "";
          (rawOnboardingData as any)[targetKey] = existingVal ? `${existingVal}\n\n--- Uploaded Files ---\n${fileList}` : `--- Uploaded Files ---\n${fileList}`;
        }
      }

      const validColumns = [
        "businessAddress", "installationRange", "chargeTravelTime", "setupCleanupTime",
        "teamSize", "schedulingPOC", "calendarOwner", "subInstallerCount",
        "subInstallerCoordinator", "customerNotification", "hasBucketTruck",
        "bucketTruckMinTime", "bucketTruckTwoInstallers", "ladderMaxHeight",
        "ladderTwoPeople", "vehicleGraphics", "hasGarage", "doesWraps",
        "installsPosts", "signTypes", "pricingProductList", "installTimeStandards",
        "additionalNotes"
      ];
      const onboardingData: Record<string, any> = {};
      for (const col of validColumns) {
        if ((rawOnboardingData as any)[col] !== undefined) {
          onboardingData[col] = (rawOnboardingData as any)[col];
        }
      }

      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const userInfo = {
        userName: currentUser.name || null,
        userEmail: currentUser.email || null,
        userPhone: currentUser.phone || null,
        userLocation: currentUser.location || null,
      };

      const [existing] = await db.select().from(onboardingForms).where(eq(onboardingForms.userId, userId));

      if (existing) {
        await db.update(onboardingForms).set({
          ...onboardingData,
          ...userInfo,
          userId,
          completedAt: new Date(),
        }).where(eq(onboardingForms.userId, userId));
      } else {
        await db.insert(onboardingForms).values({
          ...onboardingData,
          ...userInfo,
          userId,
          completedAt: new Date(),
        });
      }

      if (businessDetailsData && (currentUser.role === "admin" || currentUser.role === "super_admin")) {
        const existingBD = await storage.getBusinessDetailsByAdminId(userId);
        if (existingBD) {
          await storage.updateBusinessDetails(userId, businessDetailsData);
        } else {
          await storage.createBusinessDetails({ ...businessDetailsData, adminId: userId });
        }
      }

      await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));

      // Auto-create personalized OpenAI Assistant for admin users
      const [onboardingUser] = await db.select().from(users).where(eq(users.id, userId));
      if (onboardingUser && (onboardingUser.role === "admin" || onboardingUser.role === "super_admin") && !onboardingUser.openaiAssistantId) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          let baseInstructions = "";
          const masterAssistantId = process.env.OPENAI_ASSISTANT_ID;
          if (masterAssistantId) {
            try {
              const masterAssistant = await openai.beta.assistants.retrieve(masterAssistantId);
              baseInstructions = masterAssistant.instructions || "";
            } catch (e) {
              console.warn("Could not retrieve master assistant for auto-create:", e);
            }
          }

          const [onboardingData] = await db.select().from(onboardingForms).where(eq(onboardingForms.userId, userId));
          let personalizedInstructions = baseInstructions;
          if (onboardingData) {
            const onboardingContext = `
--- Admin-Specific Business Details ---
Admin: ${onboardingUser.name} (${onboardingUser.location || "No location"})
Business Address: ${onboardingData.businessAddress || "N/A"}
Installation Range: ${onboardingData.installationRange || "N/A"}
Travel Time Charges: ${onboardingData.chargeTravelTime || "N/A"}
Setup/Cleanup Time: ${onboardingData.setupCleanupTime || "N/A"}
Team Size: ${onboardingData.teamSize || "N/A"}
Scheduling POC: ${onboardingData.schedulingPOC || "N/A"}
Has Bucket Truck: ${onboardingData.hasBucketTruck || "N/A"}
Bucket Truck Min Time: ${onboardingData.bucketTruckMinTime || "N/A"}
Ladder Max Height: ${onboardingData.ladderMaxHeight || "N/A"}
Does Vehicle Graphics: ${onboardingData.vehicleGraphics || "N/A"}
Has Garage: ${onboardingData.hasGarage || "N/A"}
Does Wraps: ${onboardingData.doesWraps || "N/A"}
Installs Posts: ${onboardingData.installsPosts || "N/A"}
Sign Types: ${onboardingData.signTypes?.join(", ") || "N/A"}
Pricing/Product List: ${onboardingData.pricingProductList || "N/A"}
Install Time Standards: ${onboardingData.installTimeStandards || "N/A"}
Additional Notes: ${onboardingData.additionalNotes || "N/A"}
--- End Admin-Specific Details ---`;
            personalizedInstructions = personalizedInstructions
              ? personalizedInstructions + "\n\n" + onboardingContext
              : onboardingContext;
          }

          let masterVectorStoreIds: string[] = [];
          if (masterAssistantId) {
            try {
              const masterAssistant = await openai.beta.assistants.retrieve(masterAssistantId);
              masterVectorStoreIds = masterAssistant.tool_resources?.file_search?.vector_store_ids || [];
            } catch (e) {
              console.warn("Could not retrieve master assistant vector store:", e);
            }
          }

          const createParams: any = {
            name: `InstalliQ Assistant - ${onboardingUser.name}`,
            instructions: personalizedInstructions || "You are an AI scheduling assistant for FASTSIGNS signage installations.",
            model: "gpt-4o",
            tools: [{ type: "file_search" }],
          };

          if (masterVectorStoreIds.length > 0) {
            createParams.tool_resources = {
              file_search: {
                vector_store_ids: masterVectorStoreIds,
              },
            };
          }

          const assistant = await openai.beta.assistants.create(createParams);

          await db.update(users).set({ openaiAssistantId: assistant.id }).where(eq(users.id, userId));
          console.log(`Auto-created OpenAI Assistant ${assistant.id} for admin ${onboardingUser.name}`);
          logSystemActivity({
            action: "LLM_ASSISTANT_CREATED",
            category: "AI",
            description: `AI Assistant auto-created for ${onboardingUser.name} (${assistant.id})`,
            userId: userId,
            resourceId: assistant.id,
            resourceType: "assistant",
            metadata: { assistantId: assistant.id, assistantName: createParams.name, model: "gpt-4o", hasVectorStore: masterVectorStoreIds.length > 0 },
          });
        } catch (assistantError) {
          console.error("Failed to auto-create assistant on onboarding completion:", assistantError);
        }
      }

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));
      if (updatedUser) {
        res.json({ success: true, user: sanitizeUser(updatedUser) });
      } else {
        res.json({ success: true });
      }
    } catch (error) {
      console.error("Error saving onboarding form:", error);
      res.status(500).json({ error: "Failed to save onboarding form" });
    }
  });

  // ============ SENDGRID SENDER VERIFICATION ROUTES ============

  app.post("/api/sender/setup", requireAdmin, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const senderSchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        fromEmail: z.string().email("Valid email required"),
        replyTo: z.string().email("Valid reply-to email required"),
        companyAddress: z.string().min(1, "Company address is required"),
        city: z.string().min(1, "City is required"),
        country: z.string().min(1, "Country is required"),
        nickname: z.string().min(1, "Nickname is required"),
      });
      const data = senderSchema.parse(req.body);

      if (!isSendGridConfigured()) {
        return res.status(500).json({ error: "SendGrid is not configured" });
      }

      const normalizedEmail = data.fromEmail.toLowerCase().trim();

      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      const oldEmail = currentUser?.senderFromEmail?.toLowerCase().trim();
      const oldSenderId = currentUser?.sendgridSenderId;
      const isEmailChange = oldEmail && oldEmail !== normalizedEmail;

      if (isEmailChange && oldSenderId) {
        try {
          await deleteSender(oldSenderId);
          console.log(`Deleted old SendGrid sender ${oldSenderId} (${oldEmail}) before creating new one`);
        } catch (delErr: any) {
          console.warn("Could not delete old SendGrid sender:", delErr?.message || delErr);
        }
      }

      const existingStatus = await checkSenderVerificationStatus(normalizedEmail);
      let senderId: number;
      let isVerified = false;

      if (existingStatus.id && existingStatus.verified) {
        senderId = existingStatus.id;
        isVerified = true;
      } else if (existingStatus.id && !existingStatus.verified) {
        senderId = existingStatus.id;
        try {
          await resendVerificationEmail(senderId);
        } catch (e) {
          console.warn("Could not resend verification email:", e);
        }
      } else {
        try {
          const result = await createSenderVerification({
            nickname: data.nickname,
            from_email: normalizedEmail,
            from_name: data.firstName,
            reply_to: data.replyTo.toLowerCase().trim(),
            reply_to_name: data.firstName,
            address: data.companyAddress,
            city: data.city,
            country: data.country,
          });
          senderId = result.id;
          isVerified = result.verified;
        } catch (createError: any) {
          const sgErrors = createError?.response?.body?.errors || [];
          const nicknameConflict = sgErrors.some((e: any) => e.field === "nickname" && e.message?.toLowerCase().includes("already exists"));
          if (nicknameConflict) {
            const uniqueNickname = `${data.nickname}-${Date.now()}`;
            const retryResult = await createSenderVerification({
              nickname: uniqueNickname,
              from_email: normalizedEmail,
              from_name: data.firstName,
              reply_to: data.replyTo.toLowerCase().trim(),
              reply_to_name: data.firstName,
              address: data.companyAddress,
              city: data.city,
              country: data.country,
            });
            senderId = retryResult.id;
            isVerified = retryResult.verified;
            data.nickname = uniqueNickname;
          } else {
            const errorMsg = sgErrors[0]?.message || createError?.message || "";
            if (errorMsg.toLowerCase().includes("already exists")) {
              const recheckStatus = await checkSenderVerificationStatus(normalizedEmail);
              if (recheckStatus.id) {
                senderId = recheckStatus.id;
                isVerified = recheckStatus.verified;
                if (!isVerified) {
                  try { await resendVerificationEmail(senderId); } catch (e) { console.warn("Could not resend verification:", e); }
                }
              } else {
                throw createError;
              }
            } else {
              throw createError;
            }
          }
        }
      }

      await db.update(users).set({
        senderFirstName: data.firstName,
        senderFromEmail: normalizedEmail,
        senderReplyTo: data.replyTo.toLowerCase().trim(),
        senderCompanyAddress: data.companyAddress,
        senderCity: data.city,
        senderCountry: data.country,
        senderNickname: data.nickname,
        senderVerified: isVerified,
        sendgridSenderId: senderId,
      }).where(eq(users.id, userId));

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));

      res.json({
        success: true,
        verified: isVerified,
        senderId,
        message: isVerified
          ? "Email is already verified and ready to use."
          : "Verification email sent. Please check your inbox and click the verification link.",
        user: updatedUser ? sanitizeUser(updatedUser) : undefined,
      });
    } catch (error: any) {
      const sgErrors = error?.response?.body?.errors;
      console.error("Error setting up sender:", error);
      if (sgErrors) console.error("SendGrid error details:", JSON.stringify(sgErrors));
      const message = sgErrors?.[0]?.message || error.message || "Failed to set up sender verification";
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/sender/status", requireAdmin, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.senderFromEmail) {
        return res.json({ configured: false, verified: false });
      }

      if (!isSendGridConfigured()) {
        return res.json({ configured: true, verified: user.senderVerified });
      }

      let status = await checkSenderVerificationStatus(user.senderFromEmail);

      if (!status.verified && !status.id && user.sendgridSenderId) {
        const byIdStatus = await checkSenderVerificationById(user.sendgridSenderId);
        if (byIdStatus.id) {
          status = byIdStatus;
          if (byIdStatus.from_email && byIdStatus.from_email.toLowerCase() !== user.senderFromEmail.toLowerCase()) {
            await db.update(users).set({ senderFromEmail: byIdStatus.from_email.toLowerCase() }).where(eq(users.id, userId));
            console.log(`Synced sender email from SendGrid: ${byIdStatus.from_email} for user ${userId}`);
          }
        }
      }

      if (status.verified && !user.senderVerified) {
        await db.update(users).set({ senderVerified: true, sendgridSenderId: status.id || user.sendgridSenderId }).where(eq(users.id, userId));
      }

      res.json({
        configured: true,
        verified: status.verified,
        email: status.from_email || user.senderFromEmail,
        firstName: user.senderFirstName,
        nickname: user.senderNickname,
      });
    } catch (error) {
      console.error("Error checking sender status:", error);
      res.status(500).json({ error: "Failed to check sender status" });
    }
  });

  app.post("/api/sender/resend-verification", requireAdmin, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.sendgridSenderId) {
        return res.status(400).json({ error: "No sender configured" });
      }

      await resendVerificationEmail(user.sendgridSenderId);
      res.json({ success: true, message: "Verification email resent" });
    } catch (error) {
      console.error("Error resending verification:", error);
      res.status(500).json({ error: "Failed to resend verification email" });
    }
  });

  // ============ BUSINESS DETAILS ROUTES ============

  app.get("/api/business-details", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const details = await storage.getBusinessDetailsByAdminId(userId);
      res.json({ businessDetails: details || null });
    } catch (error) {
      console.error("Error fetching business details:", error);
      res.status(500).json({ error: "Failed to fetch business details" });
    }
  });

  app.get("/api/business-details/:adminId", requireAuth, async (req, res) => {
    try {
      const adminId = parseInt(req.params.adminId);
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || (currentUser.role !== "super_admin" && currentUser.id !== adminId)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const details = await storage.getBusinessDetailsByAdminId(adminId);
      res.json({ businessDetails: details || null });
    } catch (error) {
      console.error("Error fetching business details:", error);
      res.status(500).json({ error: "Failed to fetch business details" });
    }
  });

  app.put("/api/business-details", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const schema = z.object({
        businessName: z.string().optional(),
        businessAddress: z.string().optional(),
        businessCity: z.string().optional(),
        businessState: z.string().optional(),
        businessZip: z.string().optional(),
        contactNumber: z.string().optional(),
        businessEmail: z.string().optional(),
        website: z.string().optional(),
        taxId: z.string().optional(),
        businessType: z.string().optional(),
        yearEstablished: z.string().optional(),
        numberOfEmployees: z.string().optional(),
        additionalNotes: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const existing = await storage.getBusinessDetailsByAdminId(userId);

      let result;
      if (existing) {
        result = await storage.updateBusinessDetails(userId, data);
      } else {
        result = await storage.createBusinessDetails({ ...data, adminId: userId });
      }

      res.json({ businessDetails: result });
    } catch (error) {
      console.error("Error saving business details:", error);
      res.status(500).json({ error: "Failed to save business details" });
    }
  });

  // ============ EMAIL TEMPLATES CONFIG ============

  app.get("/api/email-templates", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const templates = await storage.getEmailTemplatesByAdminId(userId);

      const result = EMAIL_TEMPLATE_TYPES.map(type => {
        const custom = templates.find(t => t.emailType === type);
        return {
          emailType: type,
          label: EMAIL_TYPE_LABELS[type] || type,
          description: EMAIL_TYPE_DESCRIPTIONS[type] || "",
          subject: custom?.subject || DEFAULT_EMAIL_SUBJECTS[type] || "",
          bodyHtml: custom?.bodyHtml || DEFAULT_EMAIL_BODIES[type] || "",
          enabled: custom?.enabled ?? true,
          isCustomized: !!custom,
          defaultSubject: DEFAULT_EMAIL_SUBJECTS[type] || "",
          defaultBodyHtml: DEFAULT_EMAIL_BODIES[type] || "",
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching email templates:", error);
      res.status(500).json({ error: "Failed to fetch email templates" });
    }
  });

  app.put("/api/email-templates/:type", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const emailType = req.params.type;
      if (!EMAIL_TEMPLATE_TYPES.includes(emailType as any)) {
        return res.status(400).json({ error: "Invalid email type" });
      }

      const schema = z.object({
        subject: z.string().optional(),
        bodyHtml: z.string().optional(),
        enabled: z.boolean().optional(),
      });

      const data = schema.parse(req.body);

      const result = await storage.upsertEmailTemplate({
        adminId: userId,
        emailType,
        ...data,
      });

      res.json(result);
    } catch (error) {
      console.error("Error saving email template:", error);
      res.status(500).json({ error: "Failed to save email template" });
    }
  });

  app.post("/api/email-templates/reset/:type", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const emailType = req.params.type;
      if (!EMAIL_TEMPLATE_TYPES.includes(emailType as any)) {
        return res.status(400).json({ error: "Invalid email type" });
      }

      await storage.deleteEmailTemplate(userId, emailType);

      res.json({
        emailType,
        subject: DEFAULT_EMAIL_SUBJECTS[emailType] || "",
        bodyHtml: DEFAULT_EMAIL_BODIES[emailType] || "",
        enabled: true,
        isCustomized: false,
      });
    } catch (error) {
      console.error("Error resetting email template:", error);
      res.status(500).json({ error: "Failed to reset email template" });
    }
  });

  app.post("/api/email-templates/:type/preview", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const emailType = req.params.type;
      if (!EMAIL_TEMPLATE_TYPES.includes(emailType as any)) {
        return res.status(400).json({ error: "Invalid email type" });
      }

      const custom = await storage.getEmailTemplate(userId, emailType);
      const signature = await storage.getEmailSignatureByAdminId(userId);

      const subject = custom?.subject || DEFAULT_EMAIL_SUBJECTS[emailType] || "";
      const bodyHtml = custom?.bodyHtml || DEFAULT_EMAIL_BODIES[emailType] || "";

      const sampleVars: Record<string, string> = {
        customerName: "John Smith",
        name: "Jane Doe",
        userName: "Mike Johnson",
        username: "jdoe",
        email: "jane@example.com",
        date: "March 15, 2026",
        time: "10:00 AM",
        address: "123 Main Street, Suite 100, Anytown, ST 12345",
        installerName: "Alex Martinez",
        jobTitle: "Lobby Sign Installation",
        eventTitle: "Channel Letter Install - WJ-00045",
        previousDate: "March 10, 2026",
        previousTime: "9:00 AM",
        newDate: "March 15, 2026",
        newTime: "2:00 PM",
      };

      const renderedBody = replaceVariables(bodyHtml, sampleVars);
      const html = buildCustomEmail({
        subject: replaceVariables(subject, sampleVars),
        bodyHtml: renderedBody,
        signature,
      });

      res.json({ html, subject: replaceVariables(subject, sampleVars) });
    } catch (error) {
      console.error("Error generating preview:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // ============ EMAIL SIGNATURE ============

  app.get("/api/email-signature", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const signature = await storage.getEmailSignatureByAdminId(userId);
      res.json(signature || { adminId: userId, companyName: "", address: "", phone: "", email: "", website: "" });
    } catch (error) {
      console.error("Error fetching email signature:", error);
      res.status(500).json({ error: "Failed to fetch email signature" });
    }
  });

  app.put("/api/email-signature", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const currentUser = await storage.getUser(userId);
      if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const schema = z.object({
        companyName: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        website: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const result = await storage.upsertEmailSignature({ adminId: userId, ...data });
      res.json(result);
    } catch (error) {
      console.error("Error saving email signature:", error);
      res.status(500).json({ error: "Failed to save email signature" });
    }
  });

  // ============ GLOBAL TAGS (Super Admin) ============

  app.get("/api/global-tags", requireAuth, async (req, res) => {
    try {
      const tags = await storage.getGlobalTags();
      res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(tags);
    } catch (error) {
      console.error("Error fetching global tags:", error);
      res.status(500).json({ error: "Failed to fetch global tags" });
    }
  });

  app.post("/api/global-tags", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const schema = z.object({
        name: z.string().min(1).max(100),
        color: z.string().max(20).optional(),
      });
      const data = schema.parse(req.body);
      const existing = await storage.getGlobalTags();
      if (existing.some(t => t.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(409).json({ error: "A global tag with this name already exists" });
      }
      const tag = await storage.createGlobalTag(data);
      logActivity(req, {
        action: "CREATE_GLOBAL_TAG",
        category: "Settings",
        description: `Created global tag: ${data.name}`,
        resourceId: tag.id,
        resourceType: "global_tag",
      });
      res.status(201).json(tag);
    } catch (error) {
      console.error("Error creating global tag:", error);
      res.status(500).json({ error: "Failed to create global tag" });
    }
  });

  app.patch("/api/global-tags/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const id = parseInt(req.params.id);
      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        color: z.string().max(20).optional(),
      });
      const data = schema.parse(req.body);
      if (data.name) {
        const existing = await storage.getGlobalTags();
        if (existing.some(t => t.name.toLowerCase() === data.name!.toLowerCase() && t.id !== id)) {
          return res.status(409).json({ error: "A global tag with this name already exists" });
        }
      }
      const updated = await storage.updateGlobalTag(id, data);
      if (!updated) return res.status(404).json({ error: "Tag not found" });
      logActivity(req, {
        action: "UPDATE_GLOBAL_TAG",
        category: "Settings",
        description: `Updated global tag: ${data.name || updated.name}`,
        resourceId: id,
        resourceType: "global_tag",
      });
      res.json(updated);
    } catch (error) {
      console.error("Error updating global tag:", error);
      res.status(500).json({ error: "Failed to update global tag" });
    }
  });

  app.delete("/api/global-tags/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const id = parseInt(req.params.id);
      const existing = (await storage.getGlobalTags()).find(t => t.id === id);
      if (!existing) return res.status(404).json({ error: "Tag not found" });
      await storage.deleteGlobalTag(id);
      logActivity(req, {
        action: "DELETE_GLOBAL_TAG",
        category: "Settings",
        description: `Deleted global tag: ${existing.name}`,
        resourceId: id,
        resourceType: "global_tag",
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting global tag:", error);
      res.status(500).json({ error: "Failed to delete global tag" });
    }
  });

  // ============ OWNER TAGS ============

  app.get("/api/owner-tags", requireAdminOrInstallManager, async (req, res) => {
    try {
      const ownerId = await resolveAdminId(storage, req.session.userId!);
      const tags = await storage.getOwnerTags(ownerId);
      res.setHeader("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
      res.json(tags);
    } catch (error) {
      console.error("Error fetching owner tags:", error);
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });

  app.post("/api/owner-tags", requireAdminOrInstallManager, async (req, res) => {
    try {
      const schema = z.object({
        name: z.string().min(1).max(100),
        color: z.string().max(20).optional(),
      });
      const data = schema.parse(req.body);
      const ownerId = await resolveAdminId(storage, req.session.userId!);
      const globalTagsList = await storage.getGlobalTags();
      if (globalTagsList.some(t => t.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(409).json({ error: "This tag already exists as a global tag" });
      }
      const existingOwnerTags = await storage.getOwnerTags(ownerId);
      if (existingOwnerTags.some(t => t.name.toLowerCase() === data.name.toLowerCase())) {
        return res.status(409).json({ error: "You already have a tag with this name" });
      }
      const tag = await storage.createOwnerTag({
        ...data,
        ownerId,
      });

      logActivity(req, {
        action: "CREATE_TAG",
        category: "Settings",
        description: `Created tag: ${data.name}`,
        resourceId: tag.id,
        resourceType: "owner_tag",
      });

      res.status(201).json(tag);
    } catch (error) {
      console.error("Error creating owner tag:", error);
      res.status(500).json({ error: "Failed to create tag" });
    }
  });

  app.patch("/api/owner-tags/:id", requireAdminOrInstallManager, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = await resolveAdminId(storage, req.session.userId!);
      const existing = (await storage.getOwnerTags(ownerId)).find(t => t.id === id);
      if (!existing) return res.status(404).json({ error: "Tag not found" });

      const schema = z.object({
        name: z.string().min(1).max(100).optional(),
        color: z.string().max(20).optional(),
      });
      const data = schema.parse(req.body);
      const updated = await storage.updateOwnerTag(id, data, ownerId);

      logActivity(req, {
        action: "UPDATE_TAG",
        category: "Settings",
        description: `Updated tag: ${data.name || existing.name}`,
        resourceId: id,
        resourceType: "owner_tag",
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating owner tag:", error);
      res.status(500).json({ error: "Failed to update tag" });
    }
  });

  app.delete("/api/owner-tags/:id", requireAdminOrInstallManager, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const ownerId = await resolveAdminId(storage, req.session.userId!);
      const existing = (await storage.getOwnerTags(ownerId)).find(t => t.id === id);
      if (!existing) return res.status(404).json({ error: "Tag not found" });

      await storage.deleteOwnerTag(id, ownerId);

      logActivity(req, {
        action: "DELETE_TAG",
        category: "Settings",
        description: `Deleted tag: ${existing.name}`,
        resourceId: id,
        resourceType: "owner_tag",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting owner tag:", error);
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });

  // ============ ADMIN USER MANAGEMENT ============

  app.post("/api/admin/sync-sender-status", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }

      if (!isSendGridConfigured()) {
        return res.json({ synced: 0, message: "SendGrid not configured" });
      }

      const allUsers = await storage.getAllUsers();
      const admins = allUsers.filter(u => u.role === "admin");

      const senders = await getAllVerifiedSenders();

      let synced = 0;
      for (const admin of admins) {
        if (!admin.senderFromEmail && !admin.sendgridSenderId) continue;

        let sender = null;
        if (admin.senderFromEmail) {
          sender = senders.find((s: any) => s.from_email?.toLowerCase().trim() === admin.senderFromEmail!.toLowerCase().trim());
        }
        if (!sender && admin.sendgridSenderId) {
          sender = senders.find((s: any) => s.id === admin.sendgridSenderId);
        }

        if (sender) {
          const updates: any = {};
          if (sender.verified && !admin.senderVerified) {
            updates.senderVerified = true;
          }
          if (!sender.verified && admin.senderVerified) {
            updates.senderVerified = false;
          }
          if (sender.from_email && sender.from_email.toLowerCase() !== admin.senderFromEmail?.toLowerCase()) {
            updates.senderFromEmail = sender.from_email.toLowerCase();
          }
          if (sender.id && sender.id !== admin.sendgridSenderId) {
            updates.sendgridSenderId = sender.id;
          }
          if (Object.keys(updates).length > 0) {
            await db.update(users).set(updates).where(eq(users.id, admin.id));
            synced++;
            console.log(`Synced sender status for admin ${admin.id} (${admin.email}):`, updates);
          }
        }
      }

      res.json({ synced, message: `Synced ${synced} admin(s)` });
    } catch (error) {
      console.error("Error syncing sender status:", error);
      res.status(500).json({ error: "Failed to sync sender status" });
    }
  });

  app.post("/api/admin/update-sender/:userId", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const userId = parseInt(req.params.userId);
      const targetUser = await storage.getUser(userId);
      if (!targetUser || targetUser.role !== "admin") {
        return res.status(404).json({ error: "Admin user not found" });
      }

      const { firstName, fromEmail, replyTo, companyAddress, city, country, nickname } = req.body;
      if (!firstName || !fromEmail || !replyTo || !companyAddress || !city || !country || !nickname) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const emailChanged = fromEmail.toLowerCase() !== (targetUser.senderFromEmail || "").toLowerCase();
      let requiresVerification = false;

      const senderData = {
        nickname,
        from_email: fromEmail.toLowerCase(),
        from_name: firstName,
        reply_to: replyTo.toLowerCase(),
        reply_to_name: firstName,
        address: companyAddress,
        city,
        country,
      };

      const dbUpdates: any = {
        senderFirstName: firstName,
        senderFromEmail: fromEmail.toLowerCase(),
        senderReplyTo: replyTo.toLowerCase(),
        senderCompanyAddress: companyAddress,
        senderCity: city,
        senderCountry: country,
        senderNickname: nickname,
      };

      if (isSendGridConfigured()) {
        const oldSenderId = targetUser.sendgridSenderId;
        try {
          if (oldSenderId && !emailChanged) {
            try {
              const result = await updateSenderVerification(oldSenderId, senderData);
              dbUpdates.sendgridSenderId = result.id;
              dbUpdates.senderVerified = result.verified;
            } catch (patchErr: any) {
              console.warn("PATCH sender failed, recreating:", patchErr.message);
              const result = await createSenderVerification(senderData);
              dbUpdates.sendgridSenderId = result.id;
              dbUpdates.senderVerified = result.verified;
              requiresVerification = !result.verified;
              try { if (oldSenderId) await deleteSender(oldSenderId); } catch {}
            }
          } else {
            const result = await createSenderVerification(senderData);
            dbUpdates.sendgridSenderId = result.id;
            dbUpdates.senderVerified = result.verified;
            requiresVerification = !result.verified;
            try { if (oldSenderId) await deleteSender(oldSenderId); } catch {}
          }
        } catch (sgError: any) {
          console.error("SendGrid sender update error:", sgError);
          return res.status(500).json({ error: "Failed to update sender in SendGrid: " + (sgError.message || "Unknown error") });
        }
      }

      await db.update(users).set(dbUpdates).where(eq(users.id, userId));

      res.json({ success: true, requiresVerification, message: requiresVerification ? "Sender updated. Verification email sent." : "Sender updated successfully." });
    } catch (error) {
      console.error("Error updating sender:", error);
      res.status(500).json({ error: "Failed to update sender details" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const allUsers = await storage.getAllUsers();
      let filtered;
      if (currentUser.role === "super_admin") {
        // Return owners (admins) and their users/installers so the dashboard can
        // show owners by default, filter to a single owner's users, and
        // search across everyone. Other super_admins are excluded.
        filtered = allUsers.filter(u => u.role === "admin" || u.role === "user" || u.role === "installer");
      } else {
        filtered = allUsers.filter(u => (u.role === "user" || u.role === "installer") && u.createdBy === currentUser.id);
      }
      res.json(filtered.map(sanitizeUser));
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/admin/users/export-xlsx", requireAdmin, async (req, res) => {
    try {
      const ExcelJSMod = await import("exceljs");
      const ExcelJS = (ExcelJSMod.default || ExcelJSMod) as typeof import("exceljs");
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const allUsers = await storage.getAllUsers();

      const wb = new ExcelJS.Workbook();
      wb.creator = "InstalliQ.ai";
      wb.created = new Date();

      const ws = wb.addWorksheet("Users & Admins");

      ws.columns = [
        { key: "c1", width: 26 },
        { key: "c2", width: 22 },
        { key: "c3", width: 20 },
        { key: "c4", width: 34 },
        { key: "c5", width: 16 },
        { key: "c6", width: 16 },
        { key: "c7", width: 22 },
      ];

      ws.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];

      // ── Row 1: Title ────────────────────────────────────────────────────
      ws.mergeCells("A1:G1");
      ws.getRow(1).height = 40;
      const titleCell = ws.getCell("A1");
      titleCell.value = "InstalliQ.ai — User & Admin Report";
      titleCell.font = { name: "Calibri", bold: true, size: 18, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B3A6B" } };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // ── Row 2: Export date ──────────────────────────────────────────────
      ws.mergeCells("A2:G2");
      ws.getRow(2).height = 20;
      const dateCell = ws.getCell("A2");
      dateCell.value = `Exported on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}  ·  InstalliQ.ai`;
      dateCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF475569" } };
      dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      dateCell.alignment = { horizontal: "center", vertical: "middle" };

      // ── Row 3: Spacer ───────────────────────────────────────────────────
      ws.getRow(3).height = 6;
      for (let c = 1; c <= 7; c++) {
        ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
      }

      // ── Row 4: Column headers ───────────────────────────────────────────
      ws.getRow(4).height = 28;
      ["Admin / Owner", "Full Name", "Username", "Email Address", "Phone", "Role", "Location"].forEach((label, i) => {
        const cell = ws.getCell(4, i + 1);
        cell.value = label;
        cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = { bottom: { style: "medium", color: { argb: "FF2563EB" } } };
      });

      // ── Helpers ─────────────────────────────────────────────────────────
      const thinBorder = {
        top: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        left: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
        right: { style: "thin" as const, color: { argb: "FFE2E8F0" } },
      };

      const addDataRow = (
        values: (string | null | undefined)[],
        bgArgb: string,
        opts: { bold?: boolean; italic?: boolean } = {}
      ) => {
        const row = ws.addRow(values.map(v => v ?? ""));
        row.height = 20;
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
          cell.font = { name: "Calibri", size: 10, bold: opts.bold, italic: opts.italic, color: { argb: "FF1E293B" } };
          cell.border = thinBorder;
          cell.alignment = { horizontal: "left", vertical: "middle" };
        });
        return row;
      };

      const addSectionHeader = (label: string, bgArgb: string) => {
        const row = ws.addRow([label]);
        ws.mergeCells(`A${row.number}:G${row.number}`);
        row.height = 26;
        const cell = row.getCell(1);
        cell.value = label;
        cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
      };

      const addNoInstallers = () => {
        const row = ws.addRow(["(No installers assigned)"]);
        ws.mergeCells(`A${row.number}:G${row.number}`);
        row.height = 18;
        const cell = row.getCell(1);
        cell.value = "(No installers assigned)";
        cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF78350F" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF9C3" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
      };

      const addBlankRow = () => {
        const row = ws.addRow([]);
        row.height = 8;
        for (let c = 1; c <= 7; c++) {
          ws.getCell(row.number, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
        }
      };

      // ── Data ────────────────────────────────────────────────────────────
      if (currentUser.role === "super_admin") {
        const admins = allUsers
          .filter(u => (u.role === "admin" || u.role === "super_admin") && u.id !== currentUser.id)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        const usersByAdmin = new Map<number, typeof allUsers>();
        allUsers.filter(u => u.role === "user" || u.role === "installer").forEach(u => {
          const aid = u.createdBy ?? 0;
          if (!usersByAdmin.has(aid)) usersByAdmin.set(aid, []);
          usersByAdmin.get(aid)!.push(u);
        });

        for (const admin of admins) {
          const members = (usersByAdmin.get(admin.id) || [])
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

          addSectionHeader(
            `  ${admin.name || admin.username}${admin.email ? `   ·   ${admin.email}` : ""}`,
            "FF1D4ED8"
          );
          addDataRow(
            [admin.name || admin.username, admin.name, admin.username, admin.email, admin.phone, "Admin (Owner)", admin.location],
            "FFDBEAFE",
            { bold: true }
          );
          if (members.length === 0) {
            addNoInstallers();
          } else {
            members.forEach((u, idx) => {
              addDataRow(
                [admin.name || admin.username, u.name, u.username, u.email, u.phone, "Installer", u.location],
                idx % 2 === 0 ? "FFFFFFFF" : "FFF0F9FF"
              );
            });
          }
          addBlankRow();
        }

        const assignedAdminIds = new Set(admins.map(a => a.id));
        const unassigned = allUsers
          .filter(u => (u.role === "user" || u.role === "installer") && (!u.createdBy || !assignedAdminIds.has(u.createdBy)))
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        if (unassigned.length > 0) {
          addSectionHeader("  Unassigned Users  (no admin assigned)", "FFEA580C");
          unassigned.forEach((u, idx) => {
            addDataRow(
              ["—", u.name, u.username, u.email, u.phone, "Installer", u.location],
              idx % 2 === 0 ? "FFFFF7ED" : "FFFEF3C7"
            );
          });
        }
      } else {
        const adminName = currentUser.name || currentUser.username;
        const members = allUsers
          .filter(u => (u.role === "user" || u.role === "installer") && u.createdBy === currentUser.id)
          .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

        addSectionHeader(
          `  ${adminName}${currentUser.email ? `   ·   ${currentUser.email}` : ""}   —   Team Members`,
          "FF1D4ED8"
        );
        if (members.length === 0) {
          addNoInstallers();
        } else {
          members.forEach((u, idx) => {
            addDataRow(
              [adminName, u.name, u.username, u.email, u.phone, "Installer", u.location],
              idx % 2 === 0 ? "FFFFFFFF" : "FFF0F9FF"
            );
          });
        }
      }

      const buffer = await wb.xlsx.writeBuffer();
      const today = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="installiiq-users-${today}.xlsx"`);
      res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error) {
      console.error("Error exporting users:", error);
      res.status(500).json({ error: "Failed to export users" });
    }
  });

  app.get("/api/admin/assignable-users", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const allUsers = await storage.getAllUsers();
      let filtered;
      if (currentUser.role === "super_admin") {
        filtered = allUsers.filter(u => u.role === "user");
      } else if (currentUser.role === "admin") {
        filtered = allUsers.filter(u => u.role === "user" && u.createdBy === currentUser.id);
      } else {
        const creator = currentUser.createdBy;
        filtered = allUsers.filter(u => u.role === "user" && (creator ? u.createdBy === creator : true));
        if (creator !== null && creator !== undefined) {
          filtered = filtered.filter(u => u.createdBy === creator);
        }
      }

      const adminMap = new Map<number, string>();
      if (currentUser.role === "super_admin") {
        allUsers.filter(u => u.role === "admin" || u.role === "super_admin").forEach(a => {
          adminMap.set(a.id, a.name);
        });
      }

      res.setHeader("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
      res.json(filtered.map(u => ({
        ...sanitizeUser(u),
        adminName: adminMap.get(u.createdBy || 0) || undefined,
      })));
    } catch (error) {
      console.error("Error fetching assignable users:", error);
      res.status(500).json({ error: "Failed to fetch assignable users" });
    }
  });

  // Get deleted users (super_admin sees all, admin sees own)
  app.get("/api/admin/users/deleted", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const deletedUsers = await storage.getDeletedUsers();
      
      let filtered = deletedUsers;
      if (currentUser.role === "admin") {
        filtered = deletedUsers.filter(u => u.createdBy === currentUser.id);
      }

      res.json(filtered.map(sanitizeUser));
    } catch (error) {
      console.error("Error fetching deleted users:", error);
      res.status(500).json({ error: "Failed to fetch deleted users" });
    }
  });

  // Permanently delete one or more soft-deleted (archived) users.
  // Body: { ids: number[] }. Only users that are already in the archive (deleted_at IS NOT NULL) can be hard-deleted.
  app.post("/api/admin/users/permanent-delete", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const rawIds = (req.body && (req.body as any).ids) as unknown;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      const ids = rawIds
        .map((v: any) => parseInt(String(v), 10))
        .filter((n: number) => Number.isFinite(n));
      if (ids.length === 0) {
        return res.status(400).json({ error: "No valid ids provided" });
      }

      const deletedUsers = await storage.getDeletedUsers();
      const deletedById = new Map(deletedUsers.map(u => [u.id, u]));

      const allowed: number[] = [];
      for (const id of ids) {
        const u = deletedById.get(id);
        if (!u) continue; // skip ids not in archive
        if (currentUser.role === "admin" && u.createdBy !== currentUser.id) {
          return res.status(403).json({ error: "You can only permanently delete users you created" });
        }
        allowed.push(id);
      }

      if (allowed.length === 0) {
        return res.status(404).json({ error: "No archived users matched the provided ids" });
      }

      // Capture user details for logging before deletion
      const allowedUsers = allowed
        .map(id => deletedById.get(id))
        .filter((u): u is NonNullable<typeof u> => !!u);

      try {
        await storage.permanentDeleteUsers(allowed);
      } catch (err: any) {
        // Foreign-key violation: related records exist that prevent hard-deletion.
        if (err && (err.code === "23503" || /foreign key/i.test(String(err.message)))) {
          return res.status(409).json({
            error:
              "One or more users have related records (projects, jobs, etc.) and cannot be permanently deleted. Please remove the related records first.",
          });
        }
        throw err;
      }

      for (const u of allowedUsers) {
        logActivity(req, {
          action: "PERMANENT_DELETE_USER",
          category: "User Management",
          description: `Permanently deleted ${u.role === "admin" ? "owner" : "user"} account: ${u.name}`,
          resourceId: u.id,
          resourceType: "user",
          metadata: { name: u.name, email: u.email, role: u.role },
        });
      }

      res.json({ success: true, deleted: allowed.length });
    } catch (error) {
      console.error("Error permanently deleting users:", error);
      res.status(500).json({ error: "Failed to permanently delete users" });
    }
  });

  // Restore a soft-deleted user
  app.post("/api/admin/users/:id/restore", requireAdmin, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const deletedUsers = await storage.getDeletedUsers();
      const userToRestore = deletedUsers.find(u => u.id === id);
      if (!userToRestore) {
        return res.status(404).json({ error: "Deleted user not found" });
      }

      if (currentUser.role === "admin" && userToRestore.createdBy !== currentUser.id) {
        return res.status(403).json({ error: "You can only restore users you created" });
      }

      const restored = await storage.restoreUser(id);
      if (!restored) {
        return res.status(500).json({ error: "Failed to restore user" });
      }

      logActivity(req, {
        action: "RESTORE_USER",
        category: "User Management",
        description: `Reactivated ${restored.role === "admin" ? "owner" : "user"} account: ${restored.name}`,
        resourceId: id,
        resourceType: "user",
        metadata: { name: restored.name, email: restored.email, role: restored.role },
      });

      res.json(sanitizeUser(restored));
    } catch (error) {
      console.error("Error restoring user:", error);
      res.status(500).json({ error: "Failed to restore user" });
    }
  });

  app.get("/api/admin/users/:userId/profile", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }
      const targetUserId = parseInt(req.params.userId);
      const result = await pool.query(
        `SELECT 
          u.id, u.name, u.username, u.email, u.phone, u.role, u.location, u.job_title,
          u.created_at, u.face_enabled, u.google_enabled,
          u.onboarding_completed, u.is_master, u.deleted_at,
          adm.id AS admin_id, adm.name AS admin_name, adm.email AS admin_email,
          adm.location AS admin_location,
          ob.business_address, ob.installation_range, ob.team_size, ob.scheduling_poc,
          ob.calendar_owner, ob.has_bucket_truck, ob.ladder_max_height,
          ob.sign_types, ob.pricing_product_list, ob.install_time_standards,
          ob.additional_notes, ob.completed_at AS onboarding_completed_at
        FROM users u
        LEFT JOIN users adm ON u.created_by = adm.id
        LEFT JOIN onboarding_forms ob ON ob.user_id = u.id
        WHERE u.id = $1`,
        [targetUserId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  app.get("/api/admin/users/:adminId/members", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Only Super Admin can view admin members" });
      }

      const adminId = parseInt(Array.isArray(req.params.adminId) ? req.params.adminId[0] : req.params.adminId);
      const allUsers = await storage.getAllUsers();
      const members = allUsers.filter(u => (u.role === "user" || u.role === "installer") && u.createdBy === adminId);
      res.json(members.map(sanitizeUser));
    } catch (error) {
      console.error("Error fetching admin members:", error);
      res.status(500).json({ error: "Failed to fetch admin members" });
    }
  });

  // Create user (admin only) - auto-generates password and sends welcome email
  const adminCreateUserSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().optional(),
    phone: z.string().optional(),
    role: z.enum(["user", "admin", "super_admin"]).default("user"),
    jobTitle: z.string().optional(),
    location: z.string().optional(),
  });

  // Generate a random temporary password meeting complexity requirements
  function generateTempPassword(): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*";
    
    const allChars = upper + lower + numbers + special;
    let password = "";
    
    // Ensure at least one of each required type
    password += upper[Math.floor(Math.random() * upper.length)];
    password += lower[Math.floor(Math.random() * lower.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    
    // Fill the rest randomly
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split("").sort(() => Math.random() - 0.5).join("");
  }

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const data = adminCreateUserSchema.parse(req.body);
      
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (data.role === "super_admin") {
        return res.status(400).json({ error: "Cannot create super_admin accounts" });
      }
      if (currentUser.role === "super_admin" && data.role !== "admin") {
        return res.status(400).json({ error: "Super Admin can only create Admin accounts" });
      }
      if (currentUser.role === "admin" && data.role !== "user") {
        return res.status(400).json({ error: "Admin can only create User accounts" });
      }

      // Validate: admin requires email, user requires email or phone
      if (data.role === "admin" && !data.email) {
        return res.status(400).json({ error: "Email is required for admin accounts" });
      }
      if (data.role === "user" && !data.email && !data.phone) {
        return res.status(400).json({ error: "Either email or phone number is required" });
      }

      // Auto-generate username from email or phone
      const username = data.email || data.phone || "";

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email/phone already exists" });
      }

      if (data.email) {
        const existingEmail = await storage.getUserByEmail(data.email);
        if (existingEmail) {
          return res.status(400).json({ error: "Email already exists" });
        }
      }

      if (data.phone) {
        const existingPhone = await storage.getUserByPhone(data.phone);
        if (existingPhone) {
          return res.status(400).json({ error: "Phone number already exists" });
        }
      }

      // Generate temporary password
      const tempPassword = generateTempPassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      
      const user = await storage.createUser({
        username: username,
        password: hashedPassword,
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        role: data.role,
        jobTitle: data.jobTitle || null,
        isMaster: "false",
        tempPassword: tempPassword,
        location: data.location,
        createdBy: currentUser.id,
      });

      // Send welcome email with credentials
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const loginUrl = `${baseUrl}/login`;

      const welcomeResolved = await resolveEmailTemplate(storage, req.session.userId!, "welcome_email", {
        name: data.name,
        username: username,
        email: data.email || "",
        tempPassword: tempPassword,
        loginUrl: loginUrl,
      });

      const welcomeHtml = welcomeResolved.html;

      if (data.email && welcomeResolved.enabled) {
        try {
          await sendEmailForAdmin(req.session.userId!, {
            to: data.email,
            toName: data.name,
            bcc: "info@installiq.ai",
            subject: welcomeResolved.subject,
            html: welcomeHtml,
          });
          console.log(`Welcome email sent to ${data.email}`);
        } catch (emailError) {
          console.error("Failed to send welcome email:", emailError);
          console.log(`Temporary password for ${data.email}: ${tempPassword}`);
        }
      } else {
        console.log(`No email provided for user ${data.name}. Temp password: ${tempPassword}`);
      }

      logActivity(req, {
        action: "CREATE_USER",
        category: "User Management",
        description: `Created ${data.role} account for ${data.name}`,
        resourceId: user.id,
        resourceType: "user",
        metadata: { role: data.role, name: data.name, email: data.email },
      });
      res.status(201).json(sanitizeUser(user));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Update user (admin only)
  const updateUserSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Valid email is required").optional().or(z.literal("")),
    phone: z.string().optional(),
    role: z.enum(["user", "admin", "super_admin"]),
    jobTitle: z.string().optional().nullable(),
    password: z.string().optional(),
    location: z.string().optional().nullable(),
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const data = updateUserSchema.parse(req.body);
      
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userToUpdate = await storage.getUser(id);
      if (!userToUpdate) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userToUpdate.isMaster === "true" && userToUpdate.role === "super_admin") {
        return res.status(403).json({ error: "Cannot modify master users" });
      }

      if (data.role === "super_admin") {
        return res.status(400).json({ error: "Cannot assign super_admin role" });
      }

      // Owners (admin role) must always remain owners. Silently keep the
      // existing role so other fields (name, email, phone, location) can
      // still be updated without orphaning the owner's data (their team,
      // projects, etc. are scoped by createdBy + role === "admin").
      if (userToUpdate.role === "admin") {
        data.role = "admin";
      }

      if (currentUser.role === "admin") {
        if (userToUpdate.createdBy !== currentUser.id) {
          return res.status(403).json({ error: "You can only manage users you created" });
        }
        if (data.role && data.role !== userToUpdate.role) {
          return res.status(403).json({ error: "Admins cannot change user roles" });
        }
      }

      // Check if email is already used by another user
      if (data.email && data.email !== userToUpdate.email) {
        const existingEmail = await storage.getUserByEmail(data.email);
        if (existingEmail && existingEmail.id !== id) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }

      // Auto-update username to match email or phone
      const newUsername = data.email || data.phone || userToUpdate.username;
      
      // If password is being updated, hash it and store both
      let updateData: any = {
        name: data.name,
        email: data.email || null,
        phone: data.phone,
        role: data.role,
        jobTitle: data.jobTitle || null,
        location: data.location,
        username: newUsername,
      };
      
      if (data.password && data.password.trim().length > 0) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        updateData.password = hashedPassword;
        updateData.tempPassword = null;
      }

      console.log(`[UpdateUser] id=${id} jobTitle="${updateData.jobTitle}" role="${updateData.role}"`);
      const updatedUser = await storage.updateUser(id, updateData);

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      console.log(`[UpdateUser] saved jobTitle="${updatedUser.jobTitle}" for user id=${id}`);

      // Write a real before/after diff (excluding password) so the User
      // Management Logs tab can show "field: old → new". Only log when there
      // is something visible to a viewer (a profile diff or a password reset).
      const profileChanges = computeUserChanges(
        userToUpdate,
        updatedUser,
        Object.keys(data).filter((k) => k !== "password"),
      );
      const passwordReset = !!(data.password && data.password.trim().length > 0);
      const isSelfEdit = currentUser.id === id;
      if (profileChanges.length > 0 || passwordReset) {
        const targetLabel = updatedUser.role === "admin" ? "owner" : "user";
        const description = isSelfEdit
          ? `${updatedUser.name} updated their own profile`
          : `Updated ${targetLabel} profile: ${updatedUser.name}`;
        logActivity(req, {
          action: "UPDATE_USER",
          category: "User Management",
          description,
          resourceId: id,
          resourceType: "user",
          metadata: {
            targetUserId: id,
            targetUserName: updatedUser.name,
            targetUserRole: updatedUser.role,
            isSelfEdit,
            passwordReset,
            changes: profileChanges,
          },
        });
      }

      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // User Management Logs — focused audit feed for the User Management page.
  // Returns activity_logs entries with resource_type='user', team-scoped:
  //   • super_admin → unrestricted
  //   • admin       → only entries where the actor OR the target user is in the
  //                   admin's team (so it covers both "admin edits user" and
  //                   "user edits self" but never leaks other tenants' data).
  app.get("/api/admin/user-management-logs", requireAdmin, async (req, res) => {
    try {
      const me = await storage.getUser(req.session.userId!);
      if (!me) return res.status(401).json({ error: "Not authenticated" });

      const teamIds = await getTeamUserIdsForUser(me);
      const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 500);

      // Limit to actual profile-management actions (avoids picking up LOGIN
      // and other ambient activity that also tags resource_type='user').
      // Self password changes are logged under category='Auth' (so they also
      // show in the Auth feed); include them here via an OR branch so the
      // User Management view captures the full history of password changes.
      let where = `deleted_at IS NULL
        AND resource_type = 'user'
        AND (
          (category = 'User Management'
            AND action IN ('UPDATE_USER', 'CREATE_USER', 'DELETE_USER', 'RESTORE_USER', 'PERMANENT_DELETE_USER', 'RESET_USER_PASSWORD', 'RESET_PASSWORD'))
          OR (category = 'Auth' AND action = 'CHANGE_PASSWORD')
        )`;
      const params: any[] = [];

      if (teamIds !== null) {
        if (teamIds.length === 0) {
          return res.json([]);
        }
        const intPlaceholders = teamIds.map((_, i) => `$${params.length + i + 1}`).join(",");
        params.push(...teamIds);
        const strPlaceholders = teamIds.map((_, i) => `$${params.length + i + 1}`).join(",");
        params.push(...teamIds.map((id) => String(id)));
        where += ` AND (user_id IN (${intPlaceholders}) OR resource_id IN (${strPlaceholders}))`;
      }

      params.push(limit);
      const limitPlaceholder = `$${params.length}`;

      const result = await pool.query(
        `SELECT id, user_id as "userId", user_name as "userName", user_email as "userEmail",
                user_role as "userRole", action, category, description,
                resource_id as "resourceId", resource_type as "resourceType",
                metadata, created_at as "createdAt"
         FROM activity_logs
         WHERE ${where}
         ORDER BY created_at DESC
         LIMIT ${limitPlaceholder}`,
        params,
      );

      res.json(
        result.rows.map((r: any) => ({
          ...r,
          metadata: safeParseJson(r.metadata),
        })),
      );
    } catch (error) {
      console.error("Error fetching user management logs:", error);
      res.status(500).json({ error: "Failed to fetch user management logs" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const userToReset = await storage.getUser(id);
      if (!userToReset) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userToReset.isMaster === "true") {
        return res.status(403).json({ error: "Cannot reset password for master users" });
      }

      if (currentUser.role === "admin" && userToReset.createdBy !== currentUser.id) {
        return res.status(403).json({ error: "You can only reset passwords for users you created" });
      }

      if (!userToReset.email) {
        return res.status(400).json({ error: "User does not have an email address" });
      }

      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUserPassword(id, hashedPassword, newPassword);

      // Send reset email
      const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;
      const loginUrl = `${baseUrl}/login`;

      const resetResolved = await resolveEmailTemplate(storage, req.session.userId!, "password_reset", {
        name: userToReset.name,
        username: userToReset.username,
        tempPassword: newPassword,
        loginUrl: loginUrl,
      });

      try {
        if (resetResolved.enabled) {
          await sendEmailForAdmin(req.session.userId!, {
            to: userToReset.email!,
            toName: userToReset.name,
            bcc: "info@installiq.ai",
            subject: resetResolved.subject,
            html: resetResolved.html,
          });
        }
        console.log(`Password reset email sent to ${userToReset.email}`);
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
      }

      logActivity(req, {
        action: "RESET_USER_PASSWORD",
        category: "User Management",
        description: `Reset password for ${userToReset.name}`,
        resourceId: id,
        resourceType: "user",
        metadata: { targetUser: userToReset.name, targetEmail: userToReset.email },
      });
      res.json({ success: true, message: "Password reset email sent" });
    } catch (error) {
      console.error("Error resetting user password:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userToDelete = await storage.getUser(id);
      if (!userToDelete) {
        return res.status(404).json({ error: "User not found" });
      }

      if (userToDelete.isMaster === "true" && userToDelete.role === "super_admin") {
        return res.status(403).json({ error: "Cannot delete master users" });
      }

      if (currentUser.role === "admin" && userToDelete.createdBy !== currentUser.id) {
        return res.status(403).json({ error: "You can only delete users you created" });
      }

      await storage.deleteUser(id);
      logActivity(req, {
        action: "DELETE_USER",
        category: "User Management",
        description: `Deleted ${userToDelete.role} account: ${userToDelete.name}`,
        resourceId: id,
        resourceType: "user",
        metadata: { name: userToDelete.name, email: userToDelete.email, role: userToDelete.role },
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // ============ ACTIVITY LOG ROUTES ============

  app.get("/api/admin/activity-logs", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { category, categories: categoriesParam, userId: filterUserId, limit: limitParam, offset: offsetParam, search, archived } = req.query;

      const limitVal = Math.min(parseInt(limitParam as string) || 100, 500);
      const offsetVal = parseInt(offsetParam as string) || 0;

      const isSuperAdmin = currentUser.role === "super_admin";
      const isOwner = currentUser.role === "admin";
      const isInstallManager = currentUser.role === "user" && currentUser.jobTitle === "Install Manager";

      // Compute the set of user_ids whose actions this caller is allowed to see.
      // null => no scoping (super admin sees everything).
      let scopedUserIds: number[] | null = null;
      if (!isSuperAdmin) {
        if (isOwner) {
          const team = await pool.query(
            "SELECT id FROM users WHERE created_by = $1",
            [currentUser.id]
          );
          scopedUserIds = [currentUser.id, ...team.rows.map((r: any) => r.id)];
        } else if (isInstallManager && currentUser.createdBy) {
          // Only widen scope to the team if the parent is an actual owner (admin role).
          // Guards against tenant boundary leak when an install manager was somehow
          // created directly by a super_admin.
          const parent = await storage.getUser(currentUser.createdBy);
          if (parent && parent.role === "admin") {
            const team = await pool.query(
              "SELECT id FROM users WHERE created_by = $1",
              [currentUser.createdBy]
            );
            scopedUserIds = [currentUser.createdBy, ...team.rows.map((r: any) => r.id)];
          } else {
            scopedUserIds = [currentUser.id];
          }
        } else {
          scopedUserIds = [currentUser.id];
        }
      }

      // Non-super-admins cannot view archived logs.
      const isArchived = archived === "only" && isSuperAdmin;
      const whereParts: string[] = [isArchived ? "al.deleted_at IS NOT NULL" : "al.deleted_at IS NULL"];
      const queryParams: any[] = [];
      let paramIdx = 1;

      if (scopedUserIds !== null) {
        if (scopedUserIds.length === 0) {
          // No accessible users — return empty result.
          return res.json({ logs: [], total: 0, limit: limitVal, offset: offsetVal });
        }
        const placeholders = scopedUserIds.map(() => `$${paramIdx++}`).join(",");
        whereParts.push(`al.user_id IN (${placeholders})`);
        queryParams.push(...scopedUserIds);
      }

      if (category) {
        whereParts.push(`al.category = $${paramIdx++}`);
        queryParams.push(category);
      }
      if (categoriesParam) {
        const cats = String(categoriesParam)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        if (cats.length > 0) {
          const placeholders = cats.map(() => `$${paramIdx++}`).join(",");
          whereParts.push(`al.category IN (${placeholders})`);
          queryParams.push(...cats);
        }
      }
      if (filterUserId) {
        // Owners/install managers can only narrow within their already-scoped set;
        // the IN clause above still enforces the scope.
        whereParts.push(`al.user_id = $${paramIdx++}`);
        queryParams.push(parseInt(filterUserId as string));
      }
      if (search) {
        whereParts.push(`(al.description ILIKE $${paramIdx} OR al.user_name ILIKE $${paramIdx} OR al.action ILIKE $${paramIdx})`);
        queryParams.push(`%${search}%`);
        paramIdx++;
      }

      const whereSQL = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

      const logsResult = await pool.query(
        `SELECT 
          al.*,
          adm.name AS admin_name,
          adm.email AS admin_email
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN users adm ON u.created_by = adm.id
        ${whereSQL}
        ORDER BY al.created_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...queryParams, limitVal, offsetVal]
      );

      const countResult = await pool.query(
        `SELECT count(*) FROM activity_logs al ${whereSQL}`,
        queryParams
      );

      const logs = logsResult.rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        userRole: row.user_role,
        adminName: row.admin_name ?? null,
        adminEmail: row.admin_email ?? null,
        action: row.action,
        category: row.category,
        description: row.description,
        resourceId: row.resource_id,
        resourceType: row.resource_type,
        metadata: row.metadata,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      }));

      const total = parseInt(String(countResult.rows[0]?.count ?? 0));

      res.json({ logs, total, limit: limitVal, offset: offsetVal });
    } catch (error) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  app.post("/api/admin/activity-logs/soft-delete", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }

      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }

      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
      await pool.query(
        `UPDATE activity_logs SET deleted_at = NOW() WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        ids
      );

      res.json({ success: true, deleted: ids.length });
    } catch (error) {
      console.error("Error soft-deleting activity logs:", error);
      res.status(500).json({ error: "Failed to delete activity logs" });
    }
  });

  // Permanently delete soft-deleted activity logs (single or bulk).
  // Only logs already soft-deleted (deleted_at IS NOT NULL) are eligible.
  app.post("/api/admin/activity-logs/permanent-delete", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }

      const rawIds = (req.body && (req.body as any).ids) as unknown;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      const ids = rawIds
        .map((v: any) => parseInt(String(v), 10))
        .filter((n: number) => Number.isFinite(n));
      if (ids.length === 0) {
        return res.status(400).json({ error: "No valid ids provided" });
      }

      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
      const result = await pool.query(
        `DELETE FROM activity_logs WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
        ids,
      );

      res.json({ success: true, deleted: result.rowCount ?? 0 });
    } catch (error) {
      console.error("Error permanently deleting activity logs:", error);
      res.status(500).json({ error: "Failed to permanently delete activity logs" });
    }
  });

  app.post("/api/admin/activity-logs/restore", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super Admin access required" });
      }

      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }

      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(",");
      await pool.query(
        `UPDATE activity_logs SET deleted_at = NULL WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
        ids
      );

      res.json({ success: true, restored: ids.length });
    } catch (error) {
      console.error("Error restoring activity logs:", error);
      res.status(500).json({ error: "Failed to restore activity logs" });
    }
  });

  // ============ PROJECT ROUTES ============

  // Check if a job label already exists within the user's group
  app.get("/api/projects/check-label", requireAuth, async (req, res) => {
    try {
      const jobLabel = (req.query.jobLabel as string || "").trim();
      if (!jobLabel) return res.json({ exists: false, count: 0 });

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "User not found" });

      let projectList: any[] = [];
      if (currentUser.role === "super_admin") {
        projectList = await storage.getAllProjects();
      } else if (currentUser.role === "admin") {
        const allUsers = await storage.getAllUsers();
        const myUserIds = allUsers.filter(u => u.createdBy === currentUser.id).map(u => u.id);
        myUserIds.push(currentUser.id);
        projectList = await storage.getProjectsByUserIds(myUserIds);
      } else if (currentUser.createdBy) {
        const allUsers = await storage.getAllUsers();
        const groupUserIds = allUsers
          .filter(u => u.createdBy === currentUser.createdBy || u.id === currentUser.createdBy)
          .map(u => u.id);
        groupUserIds.push(currentUser.id);
        projectList = await storage.getProjectsByUserIds(groupUserIds);
      } else {
        projectList = await storage.getProjectsByUserIds([currentUser.id]);
      }

      const matches = projectList.filter(p =>
        (p.jobLabel || "").trim().toLowerCase() === jobLabel.toLowerCase()
      );
      return res.json({ exists: matches.length > 0, count: matches.length, projectIds: matches.map(p => p.id) });
    } catch (err) {
      console.error("check-label error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all projects
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let projectList;
      if (currentUser.role === "super_admin") {
        projectList = await storage.getAllProjects();
      } else if (currentUser.role === "admin") {
        const allUsers = await storage.getAllUsers();
        const myUserIds = allUsers
          .filter(u => u.createdBy === currentUser.id)
          .map(u => u.id);
        myUserIds.push(currentUser.id);
        projectList = await storage.getProjectsByUserIds(myUserIds);
      } else if (currentUser.createdBy) {
        const allUsers = await storage.getAllUsers();
        const groupUserIds = allUsers
          .filter(u => u.createdBy === currentUser.createdBy || u.id === currentUser.createdBy)
          .map(u => u.id);
        groupUserIds.push(currentUser.id);
        projectList = await storage.getProjectsByUserIds(groupUserIds);
      } else {
        projectList = await storage.getAllProjects(currentUser.id);
      }

      res.json(projectList);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.post("/api/projects/export", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "User not found" });
      const isInstallManager = currentUser.role === "user" && currentUser.jobTitle === "Install Manager";
      if (currentUser.role !== "admin" && currentUser.role !== "super_admin" && !isInstallManager) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { projectIds, imageFilters } = req.body as {
        projectIds?: number[];
        imageFilters?: Record<number, string[]>; // projectId → selected image URLs
      };

      const allUsers = await storage.getAllUsers();

      let projectList;
      if (currentUser.role === "super_admin") {
        projectList = await storage.getAllProjects();
      } else if (isInstallManager) {
        const ownerId = await resolveAdminId(storage, currentUser.id);
        const groupUserIds = allUsers.filter(u => u.createdBy === ownerId || u.id === ownerId).map(u => u.id);
        projectList = await storage.getProjectsByUserIds(groupUserIds);
      } else {
        const myUserIds = allUsers.filter(u => u.createdBy === currentUser.id).map(u => u.id);
        myUserIds.push(currentUser.id);
        projectList = await storage.getProjectsByUserIds(myUserIds);
      }

      if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
        const idSet = new Set(projectIds.map((id: any) => Number(id)));
        projectList = projectList.filter(p => idSet.has(p.id));
      }

      projectList = projectList.filter(p => p.hasFinishedPhotos && p.imageUrls && p.imageUrls.length > 0);

      if (projectList.length === 0) {
        return res.status(404).json({ error: "No projects with images found" });
      }

      let branding: PdfBranding = {};
      try {
        branding = await loadAdminBranding(req.session.userId!);
      } catch (brandErr: any) {
        console.error("Failed to load branding for export, using defaults:", brandErr?.message);
      }

      async function buildExportPdfBuffer(project: any): Promise<Buffer> {
        // Apply per-project image filter if provided
        const filteredUrls = imageFilters && imageFilters[project.id];
        const projectForPDF = filteredUrls && filteredUrls.length > 0
          ? { ...project, imageUrls: filteredUrls }
          : project;
        return new Promise((resolve, reject) => {
          const doc = new PDFDocument({ size: "A4", margin: 50 });
          const chunks: Buffer[] = [];
          doc.on("data", (chunk: Buffer) => chunks.push(chunk));
          doc.on("end", () => resolve(Buffer.concat(chunks)));
          doc.on("error", reject);
          buildProjectPDF(doc, projectForPDF, branding)
            .then(() => doc.end())
            .catch((err) => {
              console.error(`Error building PDF for project ${project.id} (${project.jobLabel}):`, err);
              reject(err);
            });
        });
      }

      if (projectList.length === 1) {
        const project = projectList[0];
        const pdfBuffer = await buildExportPdfBuffer(project);
        const fileName = (project.jobLabel || `project_${project.id}`).replace(/[^a-zA-Z0-9_\-]/g, "_");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}.pdf"`);
        return res.send(pdfBuffer);
      }

      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 5 } });

      const zipChunks: Buffer[] = [];
      archive.on("data", (chunk: Buffer) => zipChunks.push(chunk));

      let successCount = 0;
      const failedProjects: string[] = [];

      for (const project of projectList) {
        const folderName = (project.jobLabel || `project_${project.id}`).replace(/[^a-zA-Z0-9_\-]/g, "_");
        try {
          const pdfBuffer = await buildExportPdfBuffer(project);
          archive.append(pdfBuffer, { name: `${folderName}/${folderName}.pdf` });
          successCount++;
        } catch (pdfErr: any) {
          console.error(`Skipping project ${project.id} (${project.jobLabel}) in export:`, pdfErr?.message || pdfErr);
          failedProjects.push(project.jobLabel || `#${project.id}`);
        }
      }

      if (successCount === 0) {
        return res.status(500).json({ error: `PDF generation failed for all projects: ${failedProjects.join(", ")}` });
      }

      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        archive.on("end", () => resolve(Buffer.concat(zipChunks)));
        archive.on("error", reject);
        archive.finalize();
      });

      if (failedProjects.length > 0) {
        console.warn(`Export completed with ${failedProjects.length} skipped projects: ${failedProjects.join(", ")}`);
      }

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="projects_export_${format(new Date(), "yyyy-MM-dd")}.zip"`);
      res.send(zipBuffer);
    } catch (error: any) {
      console.error("Error exporting projects:", error?.message || error, error?.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to export projects: ${error?.message || "Unknown error"}` });
      }
    }
  });

  // Get single project
  app.get("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  // Create project (supports up to 10 images)
  app.post("/api/projects", requireAuth, upload.array("images", 50), async (req, res) => {
    try {
      // Prevent duplicate: if calendarEventId already has a linked project, return it
      const incomingCalendarEventId = req.body.calendarEventId ? parseInt(req.body.calendarEventId) : null;
      if (incomingCalendarEventId && !isNaN(incomingCalendarEventId)) {
        const existingEvent = await storage.getCalendarEvent(incomingCalendarEventId);
        if (existingEvent?.projectId) {
          const existingProject = await storage.getProject(existingEvent.projectId);
          if (existingProject) {
            // Clean up any uploaded temp files
            const tempFiles = req.files as Express.Multer.File[] || [];
            for (const file of tempFiles) {
              try { fs.unlinkSync(file.path); } catch {}
            }
            return res.status(409).json({
              error: "This booking already has a linked project",
              existingProjectId: existingProject.id,
              existingProject,
            });
          }
        }
      }

      const files = req.files as Express.Multer.File[] || [];
      const imageUrls: string[] = [];
      let uploadWarning: string | null = null;
      for (const file of files) {
        try {
          const objUrl = await uploadFileToObjectStorage(file.path, file.filename, file.mimetype);
          imageUrls.push(objUrl);
        } catch (uploadErr: any) {
          console.error("Error uploading to DigitalOcean Spaces:", uploadErr);
          uploadWarning = "Photo upload to cloud storage failed. The project was created but photos could not be saved. Please try re-uploading later.";
        }
      }
      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      const aiSuggestedTags = req.body.aiSuggestedTags ? JSON.parse(req.body.aiSuggestedTags) : [];
      const hasIssue = req.body.hasIssue === "true";

      // Build address string for geocoding
      let latitude: string | null = null;
      let longitude: string | null = null;
      const address = req.body.address || null;
      const city = req.body.city || null;
      const state = req.body.state || null;
      const postalCode = req.body.postalCode || null;
      
      if (address || city || postalCode) {
        const fullAddress = [address, city, state, postalCode].filter(Boolean).join(", ");
        try {
          const geoResult = await geocodeAddress(fullAddress);
          if (geoResult) {
            latitude = geoResult.lat;
            longitude = geoResult.lng;
            console.log(`Geocoded "${fullAddress}" to ${latitude}, ${longitude}`);
          }
        } catch (error) {
          console.error("Geocoding error:", error);
        }
      }

      const project = await storage.createProject({
        userId: req.session.userId!,
        imageUrls,
        description: req.body.description || null,
        jobLabel: req.body.jobLabel || null,
        tags,
        aiSuggestedTags,
        hasIssue,
        issueDescription: hasIssue ? (req.body.issueDescription || null) : null,
        hasFinishedPhotos: imageUrls.length > 0,
        customerName: req.body.customerName || null,
        customerPhone: req.body.customerPhone || null,
        customerEmail: req.body.customerEmail || null,
        address,
        city,
        state,
        postalCode,
        latitude,
        longitude,
      });

      logActivity(req, {
        action: "CREATE_PROJECT",
        category: "Projects",
        description: `Uploaded project${project.jobLabel ? `: ${project.jobLabel}` : ` #${project.id}`}`,
        resourceId: project.id,
        resourceType: "project",
        metadata: { jobLabel: project.jobLabel, hasIssue, imageCount: imageUrls.length },
      });

      // Link the calendar event to this new project if calendarEventId was provided
      const calendarEventId = req.body.calendarEventId ? parseInt(req.body.calendarEventId) : null;
      if (calendarEventId && !isNaN(calendarEventId)) {
        const updateData: any = { projectId: project.id };
        if (imageUrls.length > 0 && !hasIssue) {
          updateData.status = "COMPLETED";
        }
        await storage.updateCalendarEvent(calendarEventId, updateData);
        console.log(`Linked calendar event ${calendarEventId} to project ${project.id}${updateData.status === "COMPLETED" ? " (marked COMPLETED)" : ""}`);

        // Auto-stop any active job timers for this event
        try {
          const stoppedCount = await storage.stopAllActiveTimersForEvent(calendarEventId);
          if (stoppedCount > 0) {
            console.log(`Auto-stopped ${stoppedCount} active timer(s) for event ${calendarEventId} on project save`);
          }
        } catch (timerError) {
          console.error("Failed to auto-stop timers:", timerError);
        }
      }

      // If project has finished photos and no issues, also mark any existing linked calendar events as completed
      if (imageUrls.length > 0 && !hasIssue && project.id) {
        const linkedEvents = await storage.getCalendarEventsByProjectId(project.id);
        for (const linkedEvent of linkedEvents) {
          if (linkedEvent.status !== "COMPLETED") {
            await storage.updateCalendarEvent(linkedEvent.id, { status: "COMPLETED" });
            console.log(`Marked calendar event ${linkedEvent.id} as COMPLETED for project ${project.id}`);
          }
        }
      }

      // If issue is flagged, update linked calendar events and send email notification
      if (hasIssue) {
        const user = await storage.getUser(req.session.userId!);
        const reporterName = user?.name || "Unknown User";
        
        // Find calendar events linked to this project and update their status to ISSUE
        const linkedEvents = await storage.getCalendarEventsByProjectId(project.id);
        for (const linkedEvent of linkedEvents) {
          await storage.updateCalendarEvent(linkedEvent.id, { 
            status: "ISSUE",
            hasIssue: true,
            issueDescription: req.body.issueDescription || project.description || "Issue reported from Completed Photos",
          });
        }
        
        // Send email notification
        try {
          const eventTitle = linkedEvents[0]?.title || project.jobLabel || "Project";
          const eventDate = linkedEvents[0]?.startTime 
            ? formatEST(new Date(linkedEvents[0].startTime), "MMMM d, yyyy 'at' h:mm a")
            : formatEST(new Date(), "MMMM d, yyyy");
          const issueResolved = await resolveEmailTemplate(storage, req.session.userId!, "issue_reported", {
            eventTitle,
            date: eventDate,
            customerName: "",
            address: "",
          });

          if (issueResolved.enabled) {
            await sendEmailForAdmin(req.session.userId!, {
              to: "info@installiq.ai",
              bcc: "info@installiq.ai",
              subject: `${issueResolved.subject}: ${project.jobLabel || "Project #" + project.id}`,
              html: issueResolved.html,
            });
          }
          console.log(`Issue notification email sent for project #${project.id}`);
        } catch (emailError) {
          console.error("Failed to send issue notification email:", emailError);
        }
      }

      if (uploadWarning) {
        res.status(201).json({ ...project, uploadWarning });
      } else {
        res.status(201).json(project);
      }
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Delete all image files
      if (project.imageUrls && project.imageUrls.length > 0) {
        for (const imageUrl of project.imageUrls) {
          if (!imageUrl || typeof imageUrl !== "string") continue;
          const filename = path.basename(imageUrl);
          const imagePath = path.join(uploadDir, filename);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }

      await storage.deleteProject(id);

      logActivity(req, {
        action: "DELETE_PROJECT",
        category: "Projects",
        description: `Deleted project: ${project.jobLabel || `#${id}`}`,
        resourceId: id,
        resourceType: "project",
        metadata: { jobLabel: project.jobLabel },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // ============ AI IMAGE ANALYSIS ============

  app.post("/api/analyze-image", requireAuth, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Image is required" });
      }

      // Fetch global tags + owner-specific tags so AI can suggest any tag the
      // user actually sees in the project-new tag picker.
      let allAvailableTags: string[];
      try {
        const [globalTags, ownerTags] = await Promise.all([
          storage.getGlobalTags(),
          resolveAdminId(storage, req.session.userId!).then(ownerId =>
            ownerId ? storage.getOwnerTags(ownerId) : []
          ).catch(() => [] as Awaited<ReturnType<typeof storage.getOwnerTags>>),
        ]);
        const globalNames = globalTags.map(t => t.name);
        const ownerNames = ownerTags.map(t => t.name).filter(n => !globalNames.includes(n));
        allAvailableTags = [...globalNames, ...ownerNames];
      } catch {
        allAvailableTags = TAG_OPTIONS as unknown as string[];
      }

      const imageBuffer = fs.readFileSync(req.file.path);
      const base64Image = imageBuffer.toString("base64");
      const rawMime = req.file.mimetype;

      // OpenAI vision only supports: jpeg, png, gif, webp
      const openAiSupportedMimes: Record<string, string> = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/gif": "image/gif",
        "image/webp": "image/webp",
      };
      const mimeType = openAiSupportedMimes[rawMime];

      if (!mimeType) {
        // Unsupported format (e.g. HEIC) – upload was fine, just skip AI analysis
        fs.unlinkSync(req.file.path);
        return res.json({ suggestedTags: [], note: "AI analysis not available for this file format" });
      }

      // Build a prompt that uses the actual DB tags with descriptions for the
      // well-known ones, and lists any additional tags plainly.
      const knownDescriptions: Record<string, string> = {
        "ADA": "ADA-compliant signs with braille, tactile text, or accessibility-required mounting",
        "Awning": "Awning signs or fabric canopy graphics attached to a building entrance",
        "Backlit Channel Letters": "Channel letters illuminated from behind (halo-lit / reverse-lit effect)",
        "Banner": "Flexible vinyl or fabric banners hung indoors or outdoors",
        "Channel Letters": "Three-dimensional individual letter signs mounted on a building, illuminated or not",
        "Dimensional Letters": "Raised or cut-out 3D letters or logos mounted on a wall or surface (not necessarily lit)",
        "Door Lettering": "Text, logos, or graphics applied directly to glass or solid doors",
        "Drop Offs": "Photo shows sign materials, panels, or hardware being delivered or dropped off",
        "Exterior Signs": "Any signage installed outdoors on a building façade, storefront, or exterior wall",
        "Halo Lit Letters": "Letters with light shining around them (reverse-lit / halo effect)",
        "Light Box": "Illuminated cabinet sign with a translucent face panel (backlit box sign)",
        "Monument Signs": "Low-profile ground-mounted signs on a masonry or fabricated base",
        "Parking Signs": "Parking lot signs including reserved, handicap, no-parking, or directional parking signage",
        "Post and Panel Signs": "Signs mounted on one or two vertical posts driven into the ground",
        "Pylon Signs": "Tall pole-mounted signs, often used at shopping centers or roadside locations",
        "Site Signs": "Temporary or permanent identification signs at a construction site or business location",
        "Site Survey": "Photo documenting an existing location before installation — measurements or existing conditions visible",
        "Trade Show Graphics": "Banners, pop-up displays, booth graphics, or exhibition signage",
        "Traffic Signs": "Road signs including stop, speed limit, yield, or directional traffic control",
        "Vehicle Graphics": "Vinyl wraps, decals, or lettering applied to cars, trucks, vans, or other vehicles",
        "Wall Graphics": "Large-format graphics, murals, or vinyl applied to interior or exterior walls",
        "Window Graphics": "Graphics, lettering, frosted film, or perforated vinyl applied to windows or glass",
      };

      const tagLines = allAvailableTags.map(tag => {
        const desc = knownDescriptions[tag];
        return desc ? `- "${tag}": ${desc}` : `- "${tag}"`;
      }).join("\n");

      const promptText = `You are analyzing a photo from a signage installation job. Select every tag from the list below that applies to what you see. Return ONLY a JSON array of matching tag strings — no explanation, no extra text. Be generous: if a tag is plausibly applicable, include it.

Available tags:
${tagLines}

Return format example: ["Exterior Signs", "Channel Letters"]`;

      // Analyze with OpenAI Vision
      const llmStart = Date.now();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_completion_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
      });

      const content = response.choices[0]?.message?.content || "[]";
      const tokensUsed = response.usage;
      
      let suggestedTags: string[] = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          suggestedTags = JSON.parse(jsonMatch[0]);
        }
      } catch {
        // Fallback: scan raw text for any tag name
        suggestedTags = allAvailableTags.filter(tag =>
          content.toLowerCase().includes(tag.toLowerCase())
        );
      }

      console.log("[analyze-image] AI raw response:", content);
      console.log("[analyze-image] AI parsed tags:", suggestedTags);

      // Case-insensitive match: normalize AI tags to exact DB tag names
      suggestedTags = suggestedTags
        .map(aiTag => allAvailableTags.find(t => t.toLowerCase() === aiTag.toLowerCase()) || null)
        .filter((t): t is string => t !== null);

      console.log("[analyze-image] Final matched tags:", suggestedTags);

      logActivity(req, {
        action: "LLM_IMAGE_ANALYSIS",
        category: "AI",
        description: `Photo analyzed for tag suggestions (${suggestedTags.length} tags found)`,
        resourceType: "llm_call",
        metadata: { model: "gpt-4o", purpose: "photo_tag_analysis", tagsFound: suggestedTags, promptTokens: tokensUsed?.prompt_tokens, completionTokens: tokensUsed?.completion_tokens, totalTokens: tokensUsed?.total_tokens, ...calculateLlmCost("gpt-4o", tokensUsed?.prompt_tokens, tokensUsed?.completion_tokens), durationMs: Date.now() - llmStart },
      });

      // Clean up temp file
      fs.unlinkSync(req.file.path);

      res.json({ suggestedTags });
    } catch (error) {
      console.error("Error analyzing image:", error);
      // Clean up temp file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "Failed to analyze image", suggestedTags: [] });
    }
  });

  // ============ PDF GENERATION ============

  interface PdfBranding {
    logoBuffer?: Buffer | null;
    templateBuffer?: Buffer | null;
    companyName?: string | null;
    companyAddress?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
  }

  async function buildProjectPDF(doc: InstanceType<typeof PDFDocument>, project: any, branding?: PdfBranding) {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 50;
    const contentW = pageW - margin * 2;
    const brandOrange = "#E8621C";
    const brandDark = "#C14D10";
    const darkText = "#222222";
    const medText = "#555555";
    const lightText = "#888888";
    const nowEST = formatEST(new Date(), "MMMM d, yyyy 'at' h:mm a zzz");

    const hasTemplate = !!(branding?.templateBuffer);
    const companyName = branding?.companyName || "FASTSIGNS of Waltham";
    const companyAddress = branding?.companyAddress || "922 Main Street, Waltham, MA 02451";
    const companyPhone = branding?.companyPhone || "(781) 894-4000";
    const companyEmail = branding?.companyEmail || "waltham.install@fastsigns.com";

    const drawTemplateBackground = () => {
      if (hasTemplate && branding?.templateBuffer) {
        try {
          doc.image(branding.templateBuffer, 0, 0, { width: pageW, height: pageH });
        } catch (e) {
          console.error("Failed to draw template background:", e);
        }
      }
    };

    // ========= HEADER BANNER =========
    const drawHeader = (isFirstPage: boolean) => {
      if (hasTemplate) {
        return isFirstPage ? 100 : 50;
      }

      const bannerH = isFirstPage ? 90 : 45;
      doc.rect(0, 0, pageW, bannerH).fill(brandOrange);
      doc.rect(0, bannerH, pageW, 3).fill(brandDark);

      if (isFirstPage) {
        let textStartX = margin + 14;

        if (branding?.logoBuffer) {
          try {
            doc.image(branding.logoBuffer, margin + 6, 10, { fit: [70, 70] });
            textStartX = margin + 84;
          } catch (e) {
            console.error("Failed to embed PDF logo:", e);
          }
        } else {
          const logoR = 22;
          const logoX = margin + logoR;
          const logoY = bannerH / 2;
          doc.circle(logoX, logoY, logoR).fill("#FFFFFF");
          doc.fontSize(16).font("Helvetica-Bold").fillColor(brandOrange)
            .text("FP", logoX - 11, logoY - 8, { width: 22, align: "center" });
          textStartX = margin + logoR * 2 + 14;
        }

        doc.fontSize(20).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(companyName, textStartX, 20);

        doc.fontSize(8).font("Helvetica").fillColor("rgba(255,255,255,0.75)")
          .text(nowEST, margin, 22, { width: contentW, align: "right" });
        doc.fontSize(7).fillColor("rgba(255,255,255,0.6)")
          .text(companyAddress, margin, 34, { width: contentW, align: "right" });
        doc.fontSize(7)
          .text(`${companyPhone}  |  ${companyEmail}`, margin, 44, { width: contentW, align: "right" });
      } else {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(companyName, margin, 14);
        doc.fontSize(7).font("Helvetica").fillColor("rgba(255,255,255,0.75)")
          .text("Project Report", margin, 28);
      }

      return bannerH + 3;
    };

    const footerHeight = hasTemplate ? 60 : 90;
    const drawFooter = () => {
      if (hasTemplate) return;
      const fTop = pageH - footerHeight;
      const curveH = 25;
      doc.save();
      doc.moveTo(0, fTop + curveH)
        .bezierCurveTo(pageW * 0.25, fTop - 5, pageW * 0.75, fTop + curveH + 10, pageW, fTop)
        .lineTo(pageW, pageH)
        .lineTo(0, pageH)
        .closePath()
        .fill("#F5F5F5");
      doc.moveTo(0, fTop + curveH)
        .bezierCurveTo(pageW * 0.25, fTop - 5, pageW * 0.75, fTop + curveH + 10, pageW, fTop)
        .lineWidth(2).strokeColor(brandOrange).stroke();
      doc.restore();

    };

    const contentBottom = pageH - footerHeight - 10;

    // ========= PAGE 1: HEADER =========
    drawTemplateBackground();
    let startY = drawHeader(true);
    doc.y = startY + 16;

    // ========= REPORT TITLE =========
    doc.fontSize(20).font("Helvetica-Bold").fillColor(darkText)
      .text("Project Report", margin, doc.y, { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(pageW / 2 - 40, doc.y).lineTo(pageW / 2 + 40, doc.y)
      .lineWidth(2).strokeColor(brandOrange).stroke();
    doc.moveDown(1);

    // ========= INFO TABLE =========
    const infoRows: { label: string; value: string }[] = [];
    if (project.jobLabel) infoRows.push({ label: "Job Label", value: project.jobLabel });
    infoRows.push({ label: "Date Created", value: formatEST(new Date(project.createdAt), "MM/dd/yyyy h:mm a zzz") });
    if (project.customerName) infoRows.push({ label: "Customer", value: project.customerName });
    if (project.customerPhone) infoRows.push({ label: "Phone", value: project.customerPhone });
    if (project.customerEmail) infoRows.push({ label: "Email", value: project.customerEmail });
    const addressParts = [project.address, project.city, project.state, project.postalCode].filter(Boolean);
    if (addressParts.length > 0) infoRows.push({ label: "Address", value: addressParts.join(", ") });
    if (project.tags && project.tags.length > 0) infoRows.push({ label: "Tags", value: project.tags.join(", ") });

    const rowH = 26;
    const tableY = doc.y;
    for (let i = 0; i < infoRows.length; i++) {
      const rY = tableY + i * rowH;
      if (i % 2 === 0) {
        doc.rect(margin, rY, contentW, rowH).fill("#FAFAFA");
      }
      doc.fontSize(8).font("Helvetica-Bold").fillColor(lightText)
        .text(infoRows[i].label.toUpperCase(), margin + 12, rY + 8);
      doc.fontSize(10).font("Helvetica").fillColor(darkText)
        .text(infoRows[i].value, margin + 120, rY + 7);
    }
    doc.roundedRect(margin, tableY, contentW, infoRows.length * rowH, 3)
      .lineWidth(0.5).strokeColor("#E0E0E0").stroke();
    doc.y = tableY + infoRows.length * rowH + 20;

    // ========= DESCRIPTION =========
    if (project.description) {
      const cleanDesc = project.description
        .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        .replace(/[^\x20-\x7E\n\t]/g, "");

      doc.fontSize(12).font("Helvetica-Bold").fillColor(darkText).text("Description", margin);
      doc.moveDown(0.2);
      doc.moveTo(margin, doc.y).lineTo(margin + 60, doc.y)
        .lineWidth(1.5).strokeColor(brandOrange).stroke();
      doc.moveDown(0.5);

      const descLines = cleanDesc.split("\n");
      for (const line of descLines) {
        const trimmed = line.trim();
        if (!trimmed) { doc.moveDown(0.25); continue; }
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx > 0 && colonIdx < 25) {
          const label = trimmed.substring(0, colonIdx + 1);
          const value = trimmed.substring(colonIdx + 1).trim();
          doc.fontSize(9).font("Helvetica-Bold").fillColor(medText)
            .text(label, margin + 8, doc.y, { continued: true });
          doc.font("Helvetica").fillColor(darkText).text(` ${value}`);
        } else {
          doc.fontSize(9).font("Helvetica").fillColor(darkText).text(trimmed, margin + 8);
        }
      }
      doc.moveDown(1);
    }

    // ========= PHOTOS =========
    if (project.imageUrls && project.imageUrls.length > 0) {
      const validImages: Buffer[] = [];
      for (const imgUrl of project.imageUrls) {
        if (!imgUrl || typeof imgUrl !== "string") continue;
        if (isSpacesUrl(imgUrl)) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            const resp = await fetch(imgUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (resp.ok) validImages.push(Buffer.from(await resp.arrayBuffer()));
          } catch (err: any) {
            console.error(`Failed to load DO Spaces image ${imgUrl}:`, err?.message || err);
          }
        } else if (imgUrl.startsWith('/objects/') && objectStorageService) {
          try {
            const objectFile = await objectStorageService.getObjectEntityFile(imgUrl);
            const [buffer] = await objectFile.download();
            validImages.push(buffer);
          } catch (err) {
            console.error(`Failed to load cloud image ${imgUrl}:`, err);
          }
        } else {
          const fn = path.basename(imgUrl);
          const fp = path.join(uploadDir, fn);
          if (fs.existsSync(fp)) validImages.push(fs.readFileSync(fp));
        }
      }

      if (validImages.length > 0) {
        doc.fontSize(12).font("Helvetica-Bold").fillColor(darkText)
          .text(`Project Photos (${validImages.length})`, margin);
        doc.moveDown(0.2);
        doc.moveTo(margin, doc.y).lineTo(margin + 80, doc.y)
          .lineWidth(1.5).strokeColor(brandOrange).stroke();
        doc.moveDown(0.6);

        // 2-column grid layout — consistent cell size for all photos
        const colGap = 12;
        const cellW = (contentW - colGap) / 2;
        const cellH = 160;
        const labelH = 18;
        const rowH = cellH + labelH + 10; // image + label + bottom gap

        for (let i = 0; i < validImages.length; i += 2) {
          // Page-break check before starting a new row
          if (doc.y + rowH > contentBottom) {
            drawFooter();
            doc.addPage();
            drawTemplateBackground();
            startY = drawHeader(false);
            doc.y = startY + 14;
          }

          const rowY = doc.y;
          const leftX = margin;
          const rightX = margin + cellW + colGap;

          // Left cell background + border
          doc.save();
          doc.rect(leftX, rowY, cellW, cellH).fillAndStroke("#F8F8F8", "#E0E0E0");
          doc.restore();

          // Left image
          try {
            doc.image(validImages[i], leftX, rowY, { fit: [cellW, cellH], align: "center", valign: "center" });
          } catch (imgErr: any) {
            console.error("Skipping unsupported image format:", imgErr.message);
            doc.fontSize(8).font("Helvetica").fillColor(lightText)
              .text("[Unsupported format]", leftX, rowY + cellH / 2 - 6, { width: cellW, align: "center" });
          }

          // Left label
          doc.fontSize(8).font("Helvetica").fillColor(lightText)
            .text(`Photo ${i + 1}`, leftX, rowY + cellH + 4, { width: cellW, align: "center" });

          // Right cell (if exists)
          if (i + 1 < validImages.length) {
            doc.save();
            doc.rect(rightX, rowY, cellW, cellH).fillAndStroke("#F8F8F8", "#E0E0E0");
            doc.restore();

            try {
              doc.image(validImages[i + 1], rightX, rowY, { fit: [cellW, cellH], align: "center", valign: "center" });
            } catch (imgErr: any) {
              console.error("Skipping unsupported image format:", imgErr.message);
              doc.fontSize(8).font("Helvetica").fillColor(lightText)
                .text("[Unsupported format]", rightX, rowY + cellH / 2 - 6, { width: cellW, align: "center" });
            }

            doc.fontSize(8).font("Helvetica").fillColor(lightText)
              .text(`Photo ${i + 2}`, rightX, rowY + cellH + 4, { width: cellW, align: "center" });
          }

          doc.y = rowY + rowH;
        }
      }
    }

    // ========= DRAW FOOTER ON LAST PAGE =========
    drawFooter();
  }

  async function loadAdminBranding(userId: number): Promise<PdfBranding> {
    const adminId = await findAdminForUser(userId);
    const [admin] = await db.select().from(users).where(eq(users.id, adminId));
    const branding: PdfBranding = {};
    if (admin) {
      branding.companyName = admin.pdfCompanyName;
      branding.companyAddress = admin.pdfCompanyAddress;
      branding.companyPhone = admin.pdfCompanyPhone;
      branding.companyEmail = admin.pdfCompanyEmail;
      if (admin.pdfLogoUrl) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const logoResp = await fetch(admin.pdfLogoUrl, { signal: ctrl.signal });
          clearTimeout(t);
          if (logoResp.ok) branding.logoBuffer = Buffer.from(await logoResp.arrayBuffer());
        } catch (e: any) {
          console.error("Failed to load PDF logo:", e?.message || e);
        }
      }
      if (admin.pdfTemplateUrl) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const templateResp = await fetch(admin.pdfTemplateUrl, { signal: ctrl.signal });
          clearTimeout(t);
          if (templateResp.ok) branding.templateBuffer = Buffer.from(await templateResp.arrayBuffer());
        } catch (e: any) {
          console.error("Failed to load PDF template:", e?.message || e);
        }
      }
    }
    return branding;
  }

  app.get("/api/projects/:id/pdf", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let branding: PdfBranding = {};
      try {
        branding = await loadAdminBranding(req.session.userId!);
      } catch (brandErr: any) {
        console.error("Failed to load branding for PDF, using defaults:", brandErr?.message);
      }

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        buildProjectPDF(doc, project, branding)
          .then(() => doc.end())
          .catch(reject);
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=project-${id}.pdf`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating PDF:", error?.message || error, error?.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to generate PDF: ${error?.message || "Unknown error"}` });
      }
    }
  });

  // POST version: allows caller to pass a subset of selectedImageUrls for the PDF
  app.post("/api/projects/:id/pdf", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const { selectedImageUrls } = req.body as { selectedImageUrls?: string[] };

      // Build a patched project with only the chosen images (or all if none specified)
      const projectForPDF = selectedImageUrls && selectedImageUrls.length > 0
        ? { ...project, imageUrls: selectedImageUrls }
        : project;

      let branding: PdfBranding = {};
      try {
        branding = await loadAdminBranding(req.session.userId!);
      } catch (brandErr: any) {
        console.error("Failed to load branding for PDF, using defaults:", brandErr?.message);
      }

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        buildProjectPDF(doc, projectForPDF, branding)
          .then(() => doc.end())
          .catch(reject);
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=project-${id}.pdf`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("Error generating PDF:", error?.message || error, error?.stack);
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to generate PDF: ${error?.message || "Unknown error"}` });
      }
    }
  });

  // ============ EMAIL ============

  app.post("/api/projects/:id/email", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      let branding: PdfBranding = {};
      try {
        branding = await loadAdminBranding(req.session.userId!);
      } catch (brandErr: any) {
        console.error("Failed to load branding for email PDF, using defaults:", brandErr?.message);
      }

      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        buildProjectPDF(doc, project, branding)
          .then(() => doc.end())
          .catch(reject);
      });

      const projectLabel = project.jobLabel || `Project #${project.id}`;
      const recipientEmail = project.customerEmail;
      if (!recipientEmail) {
        return res.status(400).json({ error: "No customer email address found for this booking" });
      }

      await sendEmailForAdmin(req.session.userId!, {
        to: recipientEmail,
        toName: project.customerName || undefined,
        bcc: "info@installiq.ai",
        subject: `Project Report - ${projectLabel}`,
        html: emailTemplates.projectReport({
          projectLabel,
          createdAt: project.createdAt ? formatEST(new Date(project.createdAt), "MM/dd/yyyy h:mm a zzz") : undefined,
          customerName: project.customerName || undefined,
          customerPhone: project.customerPhone || undefined,
          customerEmail: project.customerEmail || undefined,
          address: [project.address, project.city, project.state, project.postalCode].filter(Boolean).join(", ") || undefined,
          description: project.description || undefined,
          tags: project.tags && project.tags.length > 0 ? project.tags : undefined,
          hasIssue: project.hasIssue || false,
          issueDescription: project.issueDescription || undefined,
          photoCount: project.imageUrls ? project.imageUrls.length : 0,
        }),
        attachments: [
          {
            filename: `project-${id}.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      logActivity(req, {
        action: "SEND_EMAIL",
        category: "Projects",
        description: `Sent project report email for ${projectLabel} to ${recipientEmail}`,
        resourceId: id,
        resourceType: "project",
        metadata: { recipientEmail, projectLabel },
      });

      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Report issue endpoint - sends notification email
  app.post("/api/projects/:id/report-issue", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      
      // Validate request body
      const bodySchema = z.object({
        hasIssue: z.boolean(),
      });
      const parseResult = bodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body. hasIssue must be a boolean." });
      }
      const { hasIssue } = parseResult.data;
      
      const project = await storage.getProject(id);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Update the project's hasIssue status
      const updatedProject = await storage.updateProject(id, { hasIssue });

      // Update linked calendar events status
      const linkedEvents = await storage.getCalendarEventsByProjectId(id);
      for (const linkedEvent of linkedEvents) {
        if (hasIssue) {
          await storage.updateCalendarEvent(linkedEvent.id, { 
            status: "ISSUE",
            hasIssue: true,
            issueDescription: project.description || "Issue reported from Completed Photos",
          });
        } else {
          await storage.updateCalendarEvent(linkedEvent.id, { 
            status: "SCHEDULED",
            hasIssue: false,
            issueDescription: null,
          });
        }
      }

      // Send email notification when issue is reported (hasIssue = true)
      if (hasIssue) {
        const userId = req.session.userId;
        const user = userId ? await storage.getUser(userId) : null;
        const adminId = await resolveAdminId(storage, req.session.userId!);

        const issueResolved = await resolveEmailTemplate(storage, adminId, "issue_reported", {
          eventTitle: project.jobLabel || "Project #" + project.id,
          date: formatEST(new Date(project.createdAt), "MM/dd/yyyy h:mm a"),
          customerName: "",
          address: "",
        });

        if (issueResolved.enabled) {
          const adminUser = await storage.getUser(adminId);
          const recipientEmail = adminUser?.email || "info@installiq.ai";
          await sendEmailForAdmin(adminId, {
            to: recipientEmail,
            toName: adminUser?.name,
            bcc: "info@installiq.ai",
            subject: `${issueResolved.subject} - ${project.jobLabel || "Project #" + project.id}`,
            html: issueResolved.html,
          });
        }
      }

      logActivity(req, {
        action: hasIssue ? "REPORT_ISSUE" : "RESOLVE_ISSUE",
        category: "Projects",
        description: hasIssue
          ? `Reported issue on project #${id} (${project.jobLabel || "Untitled"})`
          : `Resolved issue on project #${id} (${project.jobLabel || "Untitled"})`,
        resourceId: id,
        resourceType: "project",
        metadata: { hasIssue, jobLabel: project.jobLabel },
      });

      res.json({ success: true, project: updatedProject });
    } catch (error) {
      console.error("Error reporting issue:", error);
      res.status(500).json({ error: "Failed to report issue" });
    }
  });

  // ============ CALENDAR EVENTS ============

  app.get("/api/calendar-events/check-work-order", requireAuth, async (req, res) => {
    try {
      const workJobNumber = (req.query.workJobNumber as string || "").trim();
      if (!workJobNumber) return res.json({ exists: false });

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "User not found" });

      // Collect all user IDs in this group
      const allUsers = await storage.getAllUsers();
      let groupUserIds: number[] = [];
      if (currentUser.role === "super_admin") {
        groupUserIds = allUsers.map(u => u.id);
      } else if (currentUser.role === "admin") {
        groupUserIds = allUsers.filter(u => u.createdBy === currentUser.id).map(u => u.id);
        groupUserIds.push(currentUser.id);
      } else if (currentUser.createdBy) {
        groupUserIds = allUsers
          .filter(u => u.createdBy === currentUser.createdBy || u.id === currentUser.createdBy)
          .map(u => u.id);
        groupUserIds.push(currentUser.id);
      } else {
        groupUserIds = [currentUser.id];
      }

      // Search for matching work order number across all group events
      const normalized = workJobNumber.toLowerCase();
      let found: CalendarEvent | undefined;
      for (const uid of groupUserIds) {
        const ev = await storage.getCalendarEventByWorkOrderNumber(workJobNumber, uid);
        if (ev) { found = ev; break; }
        // Also try without "WO " prefix (extracted values vary)
        const stripped = normalized.replace(/^wo[\s-]*/i, "");
        if (stripped !== normalized) {
          const ev2 = await storage.getCalendarEventByWorkOrderNumber(stripped, uid);
          if (ev2) { found = ev2; break; }
        }
      }

      if (found) {
        return res.json({ exists: true, eventId: found.id, title: found.title, date: found.date, startTime: found.startTime });
      }
      return res.json({ exists: false });
    } catch (err) {
      console.error("check-work-order error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Full-text booking search — used by the calendar search bar
  app.get("/api/calendar-events/search", requireAuth, async (req, res) => {
    try {
      const q = ((req.query.q as string) || "").trim();
      if (q.length < 2) return res.json([]);

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: "User not found" });

      const { pool } = await import("./db");
      let rows: Array<{ id: number; title: string; work_job_number: string | null; customer_name: string | null; date: string; start_time: string | null; status: string | null }>;

      if (user.role === "super_admin") {
        const result = await pool.query(
          `SELECT id, title, work_job_number, customer_name, date, start_time, status
           FROM calendar_events
           WHERE title ILIKE $1 OR work_job_number ILIKE $1 OR customer_name ILIKE $1
           ORDER BY date DESC LIMIT 20`,
          [`%${q}%`]
        );
        rows = result.rows;
      } else {
        const adminId = user.role === "admin" ? user.id : (user.createdBy ?? user.id);
        const result = await pool.query(
          `SELECT ce.id, ce.title, ce.work_job_number, ce.customer_name, ce.date, ce.start_time, ce.status
           FROM calendar_events ce
           WHERE ce.created_by IN (
             SELECT id FROM users WHERE id = $1 OR created_by = $1
           )
           AND (ce.title ILIKE $2 OR ce.work_job_number ILIKE $2 OR ce.customer_name ILIKE $2)
           ORDER BY ce.date DESC LIMIT 20`,
          [adminId, `%${q}%`]
        );
        rows = result.rows;
      }

      return res.json(rows.map(r => ({
        id: r.id,
        title: r.title,
        workJobNumber: r.work_job_number,
        customerName: r.customer_name,
        date: r.date,
        startTime: r.start_time,
        status: r.status,
      })));
    } catch (err) {
      console.error("calendar-events/search error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/calendar-events", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Team-scoped visibility:
      // - super_admin  -> all events
      // - admin/owner  -> events created by admin OR by users they own
      // - user         -> events created by their admin OR by users in that admin's team
      let events: CalendarEvent[];
      if (user.role === "super_admin") {
        events = await storage.getAllCalendarEvents();
      } else {
        const adminId =
          user.role === "admin" ? user.id : (user.createdBy ?? user.id);
        const teamUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(or(eq(users.id, adminId), eq(users.createdBy, adminId)));
        const teamIds = teamUsers.map((u) => u.id);
        if (teamIds.length === 0) {
          events = [];
        } else {
          const all = await storage.getAllCalendarEvents();
          events = all.filter(
            (e) => e.createdBy != null && teamIds.includes(e.createdBy),
          );
        }
      }

      const eventIds = events.map(e => e.id);
      const allAssignments = await storage.getAllEventAssignments();
      const assignmentMap = new Map<number, number[]>();
      for (const a of allAssignments) {
        if (!eventIds.includes(a.calendarEventId)) continue;
        if (!assignmentMap.has(a.calendarEventId)) {
          assignmentMap.set(a.calendarEventId, []);
        }
        assignmentMap.get(a.calendarEventId)!.push(a.userId);
      }

      // Fetch user names for all assigned user IDs
      const allUserIds = Array.from(new Set(allAssignments.map(a => a.userId)));
      const userNameMap = new Map<number, string>();
      if (allUserIds.length > 0) {
        const assignedUsers = await db.select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, allUserIds));
        for (const u of assignedUsers) {
          userNameMap.set(u.id, u.name || "");
        }
      }

      const eventsWithAssignments = events.map(event => {
        const userIds = assignmentMap.get(event.id) || [];
        return {
          ...event,
          assignedUserIds: userIds,
          assignedUserNames: userIds.map(uid => userNameMap.get(uid) || ""),
        };
      });

      res.json(eventsWithAssignments);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  async function deduplicateWorkJobNumber(workJobNumber: string | null | undefined): Promise<string | null> {
    if (!workJobNumber) return null;
    const baseNumber = workJobNumber.replace(/[A-Z]$/, "");
    const existing = await db.select({ workJobNumber: calendarEvents.workJobNumber })
      .from(calendarEvents)
      .where(sql`${calendarEvents.workJobNumber} LIKE ${baseNumber + '%'}`);
    if (existing.length === 0) return workJobNumber;
    const usedSuffixes = new Set(existing.map(e => e.workJobNumber));
    if (!usedSuffixes.has(baseNumber)) return baseNumber;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const letter of letters) {
      const candidate = `${baseNumber}${letter}`;
      if (!usedSuffixes.has(candidate)) return candidate;
    }
    return `${baseNumber}${Date.now()}`;
  }

  // Team-scoped version: only checks WO numbers within the same admin's team
  async function deduplicateWorkJobNumberInTeam(workJobNumber: string | null | undefined, adminId: number): Promise<string | null> {
    if (!workJobNumber) return null;
    const baseNumber = workJobNumber.replace(/[A-Z]$/, "");
    // Gather all team member IDs (admin + users they created)
    const teamUsers = await db.select({ id: users.id }).from(users)
      .where(or(eq(users.id, adminId), eq(users.createdBy, adminId)));
    const teamIds = teamUsers.map(u => u.id);
    if (teamIds.length === 0) return workJobNumber;
    const existing = await db.select({ workJobNumber: calendarEvents.workJobNumber })
      .from(calendarEvents)
      .where(and(
        sql`${calendarEvents.workJobNumber} LIKE ${baseNumber + '%'}`,
        inArray(calendarEvents.createdBy, teamIds)
      ));
    if (existing.length === 0) return workJobNumber;
    const usedSuffixes = new Set(existing.map(e => e.workJobNumber));
    if (!usedSuffixes.has(baseNumber)) return baseNumber;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const letter of letters) {
      const candidate = `${baseNumber}${letter}`;
      if (!usedSuffixes.has(candidate)) return candidate;
    }
    return `${baseNumber}${Date.now()}`;
  }

  // Booking time policy: 6:00 AM – 8:00 PM CST, 30-minute slots, no past times
  const validateBookingWindow = (
    date: any,
    startTime: any,
    endTime: any,
    options: { allowPast?: boolean } = {},
  ): string | null => {
    const BOOKING_TZ = "America/Chicago";
    const checkOne = (raw: any, label: string): string | null => {
      if (!raw) return null;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return `Invalid ${label}.`;
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: BOOKING_TZ, hour12: false, hour: "2-digit", minute: "2-digit",
      }).formatToParts(d);
      const hh = parseInt(parts.find(p => p.type === "hour")!.value, 10);
      const mm = parseInt(parts.find(p => p.type === "minute")!.value, 10);
      if (mm % 30 !== 0) return `${label} must be in 30-minute increments.`;
      if (hh < 6 || hh > 20 || (hh === 20 && mm > 0)) {
        return `${label} must be between 6:00 AM and 8:00 PM (CST).`;
      }
      return null;
    };
    const startRaw = startTime || date;
    const startErr = checkOne(startRaw, "Start time");
    if (startErr) return startErr;
    const endErr = checkOne(endTime, "End time");
    if (endErr) return endErr;
    if (!options.allowPast && startRaw) {
      const sd = new Date(startRaw);
      if (!isNaN(sd.getTime()) && sd.getTime() < Date.now()) {
        return "Bookings cannot be created for a past date or time.";
      }
    }
    if (startRaw && endTime) {
      const sd = new Date(startRaw);
      const ed = new Date(endTime);
      if (!isNaN(sd.getTime()) && !isNaN(ed.getTime()) && ed.getTime() <= sd.getTime()) {
        return "End time must be after the start time.";
      }
    }
    return null;
  };

  app.post("/api/calendar-events", requireAdminOrInstallManager, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }

      // Check subscription event limit
      const { sub: subPlan, eventsUsed: usedCount } = await getSubscriptionUsage(req.session.userId!);
      if (subPlan && usedCount >= subPlan.event_limit) {
        return res.status(429).json({
          error: `You've reached the maximum of ${subPlan.event_limit} events for this month under your ${subPlan.plan_name}. Upgrade to continue.`,
          limitExceeded: true, eventsUsed: usedCount, eventLimit: subPlan.event_limit,
        });
      }

      const { title, description, jobDescription, date, projectId, startTime, endTime, customerName, customerPhone, customerEmail, workJobNumber } = req.body;
      
      if (!title || !date) {
        return res.status(400).json({ error: "Title and date are required" });
      }

      const bookingTimeError = validateBookingWindow(date, startTime, endTime);
      if (bookingTimeError) {
        return res.status(400).json({ error: bookingTimeError });
      }

      // Idempotency guard: only applies when no WO number is present (WO deduplication handles that case)
      if (!workJobNumber) {
        const recentEvents = await storage.getCalendarEventsByCreator(req.session.userId!);
        const incomingDate = new Date(date);
        const thirtySecondsAgo = new Date(Date.now() - 30_000);
        const duplicate = recentEvents.find(ev => {
          const evCreated = ev.createdAt ? new Date(ev.createdAt) : null;
          return (
            ev.title === title &&
            Math.abs(new Date(ev.date).getTime() - incomingDate.getTime()) < 60_000 &&
            evCreated && evCreated > thirtySecondsAgo
          );
        });
        if (duplicate) {
          console.log(`[Idempotency] Duplicate event creation blocked for user ${req.session.userId}, returning existing event ${duplicate.id}`);
          return res.status(200).json(duplicate);
        }
      }

      // Auto-deduplicate WO number with A/B/C suffix if it already exists in the team
      let finalWorkJobNumber = workJobNumber || null;
      if (workJobNumber) {
        const adminIdWO = await resolveAdminId(storage, req.session.userId!);
        finalWorkJobNumber = await deduplicateWorkJobNumberInTeam(workJobNumber, adminIdWO);
      }

      const eventData: any = {
        title,
        description: description || null,
        jobDescription: jobDescription || null,
        date: new Date(date),
        projectId: projectId || null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        createdBy: req.session.userId!,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        workJobNumber: finalWorkJobNumber,
      };

      const event = await storage.createCalendarEvent(eventData);

      const confirmationToken = randomBytes(32).toString("hex");
      await storage.updateCalendarEvent(event.id, { confirmationToken });

      // Auto-fetch weather for booking location
      const eventAddress = req.body.address || null;
      if (eventAddress) {
        try {
          const geo = await geocodeAddress(eventAddress);
          if (geo) {
            const weather = await getWeatherForLocation(geo.lat, geo.lng);
            await storage.updateCalendarEvent(event.id, {
              address: eventAddress,
              weatherTemp: weather.temp,
              weatherFeelsLike: weather.feelsLike,
              weatherCondition: weather.summary,
              weatherHumidity: weather.humidity,
              weatherWindSpeed: weather.windSpeed,
              weatherIcon: weather.icon,
              weatherFetchedAt: new Date(),
            } as any);
          }
        } catch (weatherErr) {
          console.error("Error fetching weather for new booking:", weatherErr);
        }
      }

      const updatedEvent = eventAddress ? await storage.getCalendarEvent(event.id) : event;
      logActivity(req, {
        action: "CREATE_BOOKING",
        category: "Bookings",
        description: `Created booking: ${event.title}`,
        resourceId: event.id,
        resourceType: "calendar_event",
        metadata: { title: event.title, date: event.date },
      });
      const responseEvent = updatedEvent || event;
      const woWasRenamed = workJobNumber && finalWorkJobNumber !== workJobNumber;
      res.status(201).json({
        ...responseEvent,
        ...(woWasRenamed ? { woRenamed: true, originalWorkJobNumber: workJobNumber, assignedWorkJobNumber: finalWorkJobNumber } : {}),
      });
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  // Create manual event with file attachments
  app.post("/api/calendar-events/with-attachments", requireAdminOrInstallManager, mixedUpload.array("files", 10), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }

      // Check subscription event limit
      const { sub: subPlan, eventsUsed: usedCount } = await getSubscriptionUsage(req.session.userId!);
      if (subPlan && usedCount >= subPlan.event_limit) {
        if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
        return res.status(429).json({
          error: `You've reached the maximum of ${subPlan.event_limit} events for this month under your ${subPlan.plan_name}. Upgrade to continue.`,
          limitExceeded: true, eventsUsed: usedCount, eventLimit: subPlan.event_limit,
        });
      }

      const { title, description, jobDescription, date, startTime, endTime, customerName, customerPhone, customerEmail, workJobNumber } = req.body;
      
      if (!title || !date) {
        if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
        return res.status(400).json({ error: "Title and date are required" });
      }

      const bookingTimeErrorWA = validateBookingWindow(date, startTime, endTime);
      if (bookingTimeErrorWA) {
        if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
        return res.status(400).json({ error: bookingTimeErrorWA });
      }

      // Idempotency guard: only applies when no WO number is present (WO deduplication handles that case)
      if (!workJobNumber) {
        const recentEventsWA = await storage.getCalendarEventsByCreator(req.session.userId!);
        const incomingDateWA = new Date(date);
        const thirtySecondsAgoWA = new Date(Date.now() - 30_000);
        const duplicateWA = recentEventsWA.find(ev => {
          const evCreated = ev.createdAt ? new Date(ev.createdAt) : null;
          return (
            ev.title === title &&
            Math.abs(new Date(ev.date).getTime() - incomingDateWA.getTime()) < 60_000 &&
            evCreated && evCreated > thirtySecondsAgoWA
          );
        });
        if (duplicateWA) {
          if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
          console.log(`[Idempotency] Duplicate with-attachments event blocked for user ${req.session.userId}, returning existing event ${duplicateWA.id}`);
          return res.status(200).json(duplicateWA);
        }
      }

      // Auto-deduplicate WO number with A/B/C suffix if it already exists in the team
      let finalWorkJobNumberWA = workJobNumber || null;
      if (workJobNumber) {
        const adminIdWOWA = await resolveAdminId(storage, req.session.userId!);
        finalWorkJobNumberWA = await deduplicateWorkJobNumberInTeam(workJobNumber, adminIdWOWA);
      }

      const event = await storage.createCalendarEvent({
        title,
        description: description || null,
        jobDescription: jobDescription || null,
        date: new Date(date),
        projectId: null,
        startTime: startTime ? new Date(startTime) : null,
        endTime: endTime ? new Date(endTime) : null,
        createdBy: req.session.userId!,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        customerEmail: customerEmail || null,
        workJobNumber: finalWorkJobNumberWA,
      });

      const confirmationToken = randomBytes(32).toString("hex");
      await storage.updateCalendarEvent(event.id, { confirmationToken });

      // Auto-fetch weather for booking location
      const eventAddress = req.body.address || null;
      if (eventAddress) {
        try {
          const geo = await geocodeAddress(eventAddress);
          if (geo) {
            const weather = await getWeatherForLocation(geo.lat, geo.lng);
            await storage.updateCalendarEvent(event.id, {
              address: eventAddress,
              weatherTemp: weather.temp,
              weatherFeelsLike: weather.feelsLike,
              weatherCondition: weather.summary,
              weatherHumidity: weather.humidity,
              weatherWindSpeed: weather.windSpeed,
              weatherIcon: weather.icon,
              weatherFetchedAt: new Date(),
            } as any);
          }
        } catch (weatherErr) {
          console.error("Error fetching weather for new booking:", weatherErr);
        }
      }

      // If files are provided, create a job and link attachments
      let attachmentWarning: string | null = null;
      if (files && files.length > 0) {
        try {
          const job = await storage.createJob({
            jobName: title,
            description: jobDescription || description || null,
            status: "SCHEDULED",
          });

          await storage.createInstallEvent({
            jobId: job.id,
            calendarEventId: event.id,
            startTime: startTime ? new Date(startTime) : new Date(date),
            endTime: endTime ? new Date(endTime) : null,
            status: "SCHEDULED",
          });

          for (const file of files) {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            const newFilename = uniqueSuffix + path.extname(file.originalname);
            
            const fileUrl = await uploadFileToObjectStorage(file.path, newFilename, file.mimetype);
            
            const isPdf = file.mimetype === "application/pdf";
            const origNameLower = file.originalname.toLowerCase();
            const isWorkOrder = isPdf && (origNameLower.startsWith("wo-") || origNameLower.startsWith("wo_") || origNameLower.includes("work_order") || origNameLower.includes("work-order") || origNameLower.includes("workorder"));
            const isImage = !isPdf || origNameLower.includes("showimage") || origNameLower.includes("show_image") || origNameLower.includes("photo") || origNameLower.includes("proof") || origNameLower.includes("img") || origNameLower.includes("image") || origNameLower.includes("pic");
            
            let category = "PROOF";
            if (isWorkOrder) {
              category = "WORK_ORDER";
            } else if (isPdf && !isImage) {
              category = "WORK_ORDER";
            }
            
            await storage.createAttachment({
              jobId: job.id,
              fileName: file.originalname,
              fileUrl,
              fileType: file.mimetype,
              category,
            });
          }
        } catch (uploadErr) {
          console.error("Error uploading attachments (event was still created):", uploadErr);
          attachmentWarning = "Event created but file attachments could not be saved due to a storage error.";
        } finally {
          for (const file of files) {
            try { fs.unlinkSync(file.path); } catch {}
          }
        }
      }

      const woWasRenamedWA = workJobNumber && finalWorkJobNumberWA !== workJobNumber;
      res.status(201).json({
        ...event,
        attachmentWarning,
        ...(woWasRenamedWA ? { woRenamed: true, originalWorkJobNumber: workJobNumber, assignedWorkJobNumber: finalWorkJobNumberWA } : {}),
      });
    } catch (error) {
      // Clean up files on error
      if (files) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
      console.error("Error creating calendar event with attachments:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  // Add files to existing calendar event
  app.post("/api/calendar-events/:id/add-files", requireAdminOrInstallManager, mixedUpload.array("files", 10), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const eventId = parseInt(idParam);
      const event = await storage.getCalendarEvent(eventId);
      
      if (!event) {
        if (files) {
          for (const file of files) {
            try { fs.unlinkSync(file.path); } catch {}
          }
        }
        return res.status(404).json({ error: "Event not found" });
      }

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      // Check if there's already a linked job
      const installEvents = await storage.getAllInstallEvents();
      let linkedInstallEvent = installEvents.find(ie => ie.calendarEventId === eventId);
      let job;
      
      if (linkedInstallEvent) {
        job = await storage.getJob(linkedInstallEvent.jobId);
      } else {
        // Create a job for this event
        job = await storage.createJob({
          jobName: event.title,
          description: event.jobDescription || event.description || null,
          status: "SCHEDULED",
        });

        // Create install event to link job to calendar event
        await storage.createInstallEvent({
          jobId: job.id,
          calendarEventId: eventId,
          startTime: event.startTime || event.date,
          endTime: event.endTime || null,
          status: "SCHEDULED",
        });
      }

      // Upload files to cloud storage and create attachments
      const createdAttachments = [];
      for (const file of files) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const newFilename = uniqueSuffix + path.extname(file.originalname);
        
        const fileUrl = await uploadFileToObjectStorage(file.path, newFilename, file.mimetype);
        
        const isPdf = file.mimetype === "application/pdf";
        const origNameLower = file.originalname.toLowerCase();
        const isWorkOrder = isPdf && (origNameLower.startsWith("wo-") || origNameLower.startsWith("wo_") || origNameLower.includes("work_order") || origNameLower.includes("work-order") || origNameLower.includes("workorder"));
        const isImage = !isPdf || origNameLower.includes("showimage") || origNameLower.includes("show_image") || origNameLower.includes("photo") || origNameLower.includes("proof") || origNameLower.includes("img") || origNameLower.includes("image") || origNameLower.includes("pic");
        
        let fileCategory = "PROOF";
        if (isWorkOrder) {
          fileCategory = "WORK_ORDER";
        } else if (isPdf && !isImage) {
          fileCategory = "WORK_ORDER";
        }
        
        const attachment = await storage.createAttachment({
          jobId: job!.id,
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          category: fileCategory,
        });
        createdAttachments.push(attachment);
      }

      res.status(201).json({ success: true, attachments: createdAttachments });
    } catch (error) {
      if (files) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
      console.error("Error adding files to calendar event:", error);
      res.status(500).json({ error: "Failed to add files" });
    }
  });

  // Get calendar event details with associated job and attachments
  app.get("/api/calendar-events/:id/details", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const event = await storage.getCalendarEvent(id);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Find linked install event and job
      const installEvents = await storage.getAllInstallEvents();
      const linkedInstallEvent = installEvents.find(ie => ie.calendarEventId === id);
      
      let job = null;
      let attachments: any[] = [];
      
      if (linkedInstallEvent) {
        job = await storage.getJob(linkedInstallEvent.jobId);
        if (job) {
          attachments = await storage.getAttachmentsByJobId(job.id);
        }
      }

      const assignments = await storage.getEventAssignments(id);

      res.json({
        event,
        installEvent: linkedInstallEvent || null,
        job,
        attachments,
        assignments
      });
    } catch (error) {
      console.error("Error fetching event details:", error);
      res.status(500).json({ error: "Failed to fetch event details" });
    }
  });

  /**
   * Best-effort regex fallback for FASTSIGNS work order / invoice numbers.
   * If the AI parse missed it but the raw PDF text contains an "XXX-XXXXX"
   * pattern (e.g. "401-52281"), use it to fill jobNumber / workOrderNumber /
   * title. Prefers numbers that appear right after the word "WORK ORDER" or
   * "INVOICE", falling back to the first match anywhere in the document.
   */
  /**
   * Some PDFs encode the Order Contact as "James 401-275-3665" in a single
   * cell. Older AI prompts copied the whole string into customerPhone so the
   * tel: link was unusable. Strip any leading non-phone words and keep only
   * the phone-shaped substring, while preserving the original on customerName
   * if we have no better name.
   */
  function normalizeCustomerPhone(parsed: any) {
    if (!parsed || typeof parsed.customerPhone !== "string") return;
    const raw = parsed.customerPhone.trim();
    if (!raw) return;
    const match = raw.match(/(\+?\d[\d\s().\-]{6,}\d)/);
    if (!match) return;
    const phone = match[1].trim();
    if (phone === raw) return;
    const namePart = raw.replace(phone, "").replace(/[:\-,]/g, " ").trim();
    parsed.customerPhone = phone;
    if (namePart && !parsed.customerName) parsed.customerName = namePart;
  }

  function applyJobNumberRegexFallback(parsed: any, pdfText: string) {
    if (!pdfText || (parsed.jobNumber && parsed.workOrderNumber)) return;

    const text = pdfText.replace(/\s+/g, " ");
    const woMatch = text.match(/WORK\s*ORDER\s*[#:]?\s*(\d{3}-\d{5})/i);
    const invMatch = text.match(/INVOICE(?:\s*(?:NUMBER|#))?\s*[:#]?\s*(\d{3}-\d{5})/i);
    const anyMatch = text.match(/\b(\d{3}-\d{5})\b/);

    const fromWO = woMatch?.[1] || null;
    const fromInvoice = invMatch?.[1] || null;
    const fromAny = anyMatch?.[1] || null;

    if (!parsed.workOrderNumber && fromWO) parsed.workOrderNumber = fromWO;
    if (!parsed.invoiceNumber && fromInvoice) parsed.invoiceNumber = fromInvoice;
    if (!parsed.jobNumber) {
      parsed.jobNumber =
        parsed.workOrderNumber || parsed.invoiceNumber || fromWO || fromInvoice || fromAny || null;
    }
    if (!parsed.workOrderNumber && !parsed.invoiceNumber && parsed.jobNumber) {
      // No explicit header found, but we have *some* XXX-XXXXX in the doc —
      // treat it as the work order number so downstream code (badges, dedup)
      // has a value to use.
      parsed.workOrderNumber = parsed.jobNumber;
    }
  }

  app.post("/api/calendar-events/extract-file-data", requireAdminOrInstallManager, mixedUpload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const isPdf = file.mimetype === "application/pdf";
      const isImage = /jpeg|jpg|png|gif|webp/.test(file.mimetype);

      let imageContents: any[] = [];
      // Raw PDF text kept around for regex-based fallback extraction
      // (e.g. pulling "401-52281" out of the document even when the AI
      // returns null for workOrderNumber/invoiceNumber/jobNumber).
      let pdfFullText: string = "";

      if (isPdf) {
        // Always try to grab the raw text up front so we have it for the
        // regex fallback regardless of which AI path runs below.
        try {
          let pdfParseEarly: any;
          try {
            pdfParseEarly = require("pdf-parse");
          } catch {
            const mod = await import("pdf-parse");
            pdfParseEarly = (mod as any).default || mod;
          }
          const buf = fs.readFileSync(file.path);
          const data = await pdfParseEarly(buf);
          pdfFullText = (data?.text || "").toString();
        } catch (earlyTextErr) {
          console.warn("[extract-file-data] Early pdf-parse failed (continuing):", earlyTextErr);
        }

        const outputPattern = file.path.replace(/\.pdf$/i, "-page");
        let pdfConverted = false;
        try {
          await execAsync(`pdftoppm -png -r 150 "${file.path}" "${outputPattern}"`);
          const dir = path.dirname(file.path);
          const baseName = path.basename(file.path, ".pdf");
          const dirFiles = fs.readdirSync(dir);
          const imageFiles = dirFiles
            .filter((f: string) => f.startsWith(baseName.replace(/\.pdf$/i, "") + "-page") && f.endsWith(".png"))
            .sort()
            .map((f: string) => path.join(dir, f));

          for (const imgPath of imageFiles.slice(0, 5)) {
            const base64 = fs.readFileSync(imgPath).toString("base64");
            imageContents.push({
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64}`, detail: "high" },
            });
            try { fs.unlinkSync(imgPath); } catch {}
          }
          if (imageContents.length > 0) pdfConverted = true;
        } catch (err) {
          console.error("PDF conversion failed (pdftoppm may not be installed):", err);
        }

        if (!pdfConverted) {
          console.log("[extract-file-data] pdftoppm not available, using pdf-parse text fallback");
          try {
            let pdfParse: any;
            try {
              pdfParse = require("pdf-parse");
            } catch (requireErr) {
              console.error("[extract-file-data] pdf-parse require failed, trying dynamic import:", requireErr);
              const pdfParseModule = await import("pdf-parse");
              pdfParse = (pdfParseModule as any).default || pdfParseModule;
            }
            const pdfBuffer = fs.readFileSync(file.path);
            const pdfData = await pdfParse(pdfBuffer);
            console.log("[extract-file-data] PDF text extracted, length:", pdfData.text?.length || 0);
            if (pdfData.text && pdfData.text.trim().length > 0) {
              const pdfTextContent = pdfData.text.substring(0, 15000);
              try { fs.unlinkSync(file.path); } catch {}

              console.log("[extract-file-data] Sending text to OpenAI for extraction...");
              const textExtractLlmStart = Date.now();
              const textResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                  {
                    role: "system",
                    content: `You are a document parser for FASTSIGNS of Waltham. Extract key information from uploaded work orders, invoices, or sign documents to pre-fill a calendar event form.

Extract the following fields from the document:
- workOrderNumber: The work order number (e.g., "401-51480" from a "WORK ORDER 401-51480" header). ONLY set this when the header literally says "WORK ORDER". Leave null for invoices.
- invoiceNumber: The invoice number (e.g., "401-50896" from an "INVOICE" header followed by "401-50896", OR from an explicit "INVOICE NUMBER:" / "Invoice #" label). ONLY set this for invoice documents.
- jobNumber: The single identifier to use as the job number — set to workOrderNumber if found, else invoiceNumber. CRITICAL.
- title: Use format "INSTALL - {jobNumber}" if a job number is found, otherwise "INSTALL - {customerName} @ {location}"
- customerName: The customer or company name (from "Bill To" section)
- customerPhone: The customer's phone number ONLY — digits, spaces, dashes, parens, plus sign. Do NOT include any contact name, label, or other words. If a contact is shown as "James 401-275-3665", set customerName to the name part and customerPhone to "401-275-3665" only.
- customerEmail: The customer's email address if found (from "Order Contact" section - may be split across two lines)
- address: Full installation/delivery address (use "Installed" section address, NOT "Bill To")
- description: Brief notes or order description
- jobDescription: Detailed job/installation description including sign types, dimensions, quantities, materials, work order number
- startDate: The "Product Due" date from the work order (format: YYYY-MM-DD). This is the date the product is ready and installation should be scheduled. Look for "Product Due:" field. If not found, look for any other scheduled/due date. This is CRITICAL - always extract this date if present.
- startTime: The time from "Product Due" field (format: HH:MM in 24-hour, e.g., "15:00" for 3:00 pm). If not found, default to null.
- duration: Estimated duration in hours based on the job complexity. Use one of these values (30 min increments): "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8". Consider: quick tasks = 0.5-1 hours, simple sign installs = 1-2 hours, medium complexity = 2-4 hours, large/complex projects = 4-8 hours. Always provide an estimate, default to "2" if unsure.

Return a JSON object with these exact fields. Use null for any field you cannot determine.`
                  },
                  {
                    role: "user",
                    content: `Extract information from this document text to pre-fill a calendar event form:\n\n${pdfTextContent}`,
                  },
                ],
                max_tokens: 1000,
                response_format: { type: "json_object" },
              });

              const textContent = textResponse.choices[0]?.message?.content;
              console.log("[extract-file-data] OpenAI text response:", textContent);
              if (textContent) {
                try {
                  const parsed = JSON.parse(textContent);
                  if (!parsed.duration) parsed.duration = "2";
                  if (!parsed.startTime && parsed.startDate) parsed.startTime = "09:00";
                  if (!parsed.jobNumber) parsed.jobNumber = parsed.workOrderNumber || parsed.invoiceNumber || null;
                  // Regex fallback: scrape the raw PDF text for a FASTSIGNS-style
                  // XXX-XXXXX number (e.g. 401-52281) if the AI missed it.
                  applyJobNumberRegexFallback(parsed, pdfFullText);
                  normalizeCustomerPhone(parsed);
                  if (parsed.jobNumber && (!parsed.title || /^INSTALL\s*-\s*null/i.test(parsed.title) || /@\s*null/i.test(parsed.title))) parsed.title = `INSTALL - ${parsed.jobNumber}`;
                  if (!parsed.workOrderNumber && parsed.invoiceNumber) parsed.workOrderNumber = parsed.invoiceNumber;
                  console.log("[extract-file-data] Parsed data:", JSON.stringify({ startDate: parsed.startDate, startTime: parsed.startTime, duration: parsed.duration, title: parsed.title, jobNumber: parsed.jobNumber }));
                  logActivity(req, {
                    action: "LLM_FILE_EXTRACTION",
                    category: "AI",
                    description: `PDF text data extracted: ${parsed.title || parsed.workOrderNumber || "document"}`,
                    resourceType: "llm_call",
                    metadata: { model: "gpt-4o", purpose: "pdf_text_extraction", workOrderNumber: parsed.workOrderNumber, title: parsed.title, promptTokens: textResponse.usage?.prompt_tokens, completionTokens: textResponse.usage?.completion_tokens, totalTokens: textResponse.usage?.total_tokens, ...calculateLlmCost("gpt-4o", textResponse.usage?.prompt_tokens, textResponse.usage?.completion_tokens), durationMs: Date.now() - textExtractLlmStart },
                  });
                  return res.json({ extracted: true, data: parsed });
                } catch (parseErr) {
                  console.error("[extract-file-data] Failed to parse AI response:", textContent);
                }
              }
            } else {
              console.log("[extract-file-data] PDF text extraction returned empty text");
            }
          } catch (pdfParseErr: any) {
            console.error("[extract-file-data] PDF text extraction failed:", pdfParseErr.message || pdfParseErr);
          }
        }
      } else if (isImage) {
        const base64 = fs.readFileSync(file.path).toString("base64");
        const mimeType = file.mimetype || "image/png";
        imageContents.push({
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
        });
      }

      if (imageContents.length === 0) {
        console.log("[extract-file-data] No image contents produced from file, extraction not possible");
        return res.json({ extracted: false, message: "Could not process file. PDF text extraction may have failed." });
      }

      const extractLlmStart = Date.now();
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a document parser for FASTSIGNS of Waltham. Extract key information from uploaded work orders, invoices, or sign documents to pre-fill a calendar event form.

Extract the following fields from the document:
- workOrderNumber: The work order number (e.g., "401-51480" from a "WORK ORDER 401-51480" header). ONLY set this when the header literally says "WORK ORDER". Leave null for invoices.
- invoiceNumber: The invoice number (e.g., "401-50896" from an "INVOICE" header followed by "401-50896", OR from an explicit "INVOICE NUMBER:" / "Invoice #" label). ONLY set this for invoice documents.
- jobNumber: The single identifier to use as the job number — set to workOrderNumber if found, else invoiceNumber. CRITICAL.
- title: Use format "INSTALL - {jobNumber}" if a job number is found, otherwise "INSTALL - {customerName} @ {location}"
- customerName: The customer or company name (from "Bill To" section)
- customerPhone: The customer's phone number ONLY — digits, spaces, dashes, parens, plus sign. Do NOT include any contact name, label, or other words. If a contact is shown as "James 401-275-3665", set customerName to the name part and customerPhone to "401-275-3665" only.
- customerEmail: The customer's email address if found (from "Order Contact" section - email may be split across two lines, combine them)
- address: Full installation/delivery address (use "Installed" section address, NOT "Bill To" address)
- description: Brief notes or order description
- jobDescription: Detailed job/installation description including sign types, dimensions, quantities, materials, work order number
- startDate: The "Product Due" date from the work order (format: YYYY-MM-DD). This is the date the product is ready and installation should be scheduled. Look for "Product Due:" field. If not found, look for any other scheduled/due date. This is CRITICAL - always extract this date if present in the document.
- startTime: The time from "Product Due" field (format: HH:MM in 24-hour, e.g., "15:00" for 3:00 pm). If not found, default to null.
- duration: Estimated duration in hours based on the job complexity. Use one of these values (30 min increments): "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "4.5", "5", "5.5", "6", "6.5", "7", "7.5", "8". Consider: quick tasks = 0.5-1 hours, simple sign installs = 1-2 hours, medium complexity = 2-4 hours, large/complex projects = 4-8 hours. Always provide an estimate, default to "2" if unsure.

Return a JSON object with these exact fields. Use null for any field you cannot determine.
{
  "workOrderNumber": string | null,
  "invoiceNumber": string | null,
  "jobNumber": string | null,
  "title": string | null,
  "customerName": string | null,
  "customerPhone": string | null,
  "customerEmail": string | null,
  "address": string | null,
  "description": string | null,
  "jobDescription": string | null,
  "startDate": string | null,
  "startTime": string | null,
  "duration": string | null
}`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract information from this document to pre-fill a calendar event form:" },
              ...imageContents,
            ],
          },
        ],
        max_tokens: 1000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.json({ extracted: false, message: "No data extracted" });
      }

      try {
        const parsed = JSON.parse(content);
        if (!parsed.duration) parsed.duration = "2";
        if (!parsed.startTime && parsed.startDate) parsed.startTime = "09:00";
        if (!parsed.jobNumber) parsed.jobNumber = parsed.workOrderNumber || parsed.invoiceNumber || null;
        // Regex fallback off the raw PDF text in case the vision model
        // didn't pick up the WORK ORDER header on this layout.
        applyJobNumberRegexFallback(parsed, pdfFullText);
        normalizeCustomerPhone(parsed);
        if (parsed.jobNumber && (!parsed.title || /^INSTALL\s*-\s*null/i.test(parsed.title) || /@\s*null/i.test(parsed.title))) parsed.title = `INSTALL - ${parsed.jobNumber}`;
        if (!parsed.workOrderNumber && parsed.invoiceNumber) parsed.workOrderNumber = parsed.invoiceNumber;
        console.log("[extract-file-data] Image parsed data:", JSON.stringify({ startDate: parsed.startDate, startTime: parsed.startTime, duration: parsed.duration, title: parsed.title, jobNumber: parsed.jobNumber }));
        logActivity(req, {
          action: "LLM_FILE_EXTRACTION",
          category: "AI",
          description: `File data extracted: ${parsed.title || parsed.workOrderNumber || "document"}`,
          resourceType: "llm_call",
          metadata: { model: "gpt-4o", purpose: "file_data_extraction", workOrderNumber: parsed.workOrderNumber, title: parsed.title, promptTokens: response.usage?.prompt_tokens, completionTokens: response.usage?.completion_tokens, totalTokens: response.usage?.total_tokens, ...calculateLlmCost("gpt-4o", response.usage?.prompt_tokens, response.usage?.completion_tokens), durationMs: Date.now() - extractLlmStart },
        });
        res.json({ extracted: true, data: parsed });
      } catch (parseErr) {
        console.error("Failed to parse AI response:", content);
        res.json({ extracted: false, message: "Could not parse extracted data" });
      }
    } catch (error: any) {
      console.error("File extraction error:", error);
      res.json({ extracted: false, message: "Failed to extract data from file" });
    } finally {
      try { fs.unlinkSync(file.path); } catch {}
    }
  });

  app.post("/api/calendar-events/from-pdf", requireAdminOrInstallManager, pdfUpload.array("pdfs", 5), async (req, res) => {
    const files = req.files as Express.Multer.File[];

    const curUser = await storage.getUser(req.session.userId!);
    if (curUser?.role === "super_admin") {
      if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
      return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
    }

    // Check subscription event limit
    const { sub: subPlan, eventsUsed: usedCount } = await getSubscriptionUsage(req.session.userId!);
    if (subPlan && usedCount >= subPlan.event_limit) {
      if (files) { for (const file of files) { try { fs.unlinkSync(file.path); } catch {} } }
      return res.status(429).json({
        error: `You've reached the maximum of ${subPlan.event_limit} events for this month under your ${subPlan.plan_name}. Upgrade to continue.`,
        limitExceeded: true, eventsUsed: usedCount, eventLimit: subPlan.event_limit,
      });
    }
    
    // Track moved files and their new paths for cleanup
    const movedFiles: { original: string; newPath: string }[] = [];
    
    // Helper to clean up files - handles both temp and moved files
    const cleanupFiles = (rollbackMoved = false) => {
      // Clean up temp files that haven't been moved yet
      if (files) {
        for (const file of files) {
          const wasMoved = movedFiles.some(m => m.original === file.path);
          if (!wasMoved) {
            try { fs.unlinkSync(file.path); } catch {}
          }
        }
      }
      // If rollback requested, also delete any files that were moved to permanent storage
      if (rollbackMoved) {
        for (const moved of movedFiles) {
          try { fs.unlinkSync(moved.newPath); } catch {}
        }
      }
    };

    // Helper: classify a PDF file as INVOICE vs WORK_ORDER for attachment category.
    const classifyPdfCategory = (file: Express.Multer.File, data: any | null): "INVOICE" | "WORK_ORDER" | "PROOF" => {
      const isPdf = file.mimetype === "application/pdf";
      if (!isPdf) return "PROOF";
      if (data?.invoiceNumber && !data?.workOrderNumber) return "INVOICE";
      const lower = file.originalname.toLowerCase();
      if (lower.startsWith("inv-") || lower.startsWith("inv_") || lower.includes("invoice")) return "INVOICE";
      return "WORK_ORDER";
    };

    // Helper: process a single group of PDFs (one job number → one project + event + job + attachments).
    // Encapsulates the pipeline so it can be invoked once per group when multiple distinct jobs are uploaded.
    const processSinglePdfGroup = async (
      groupFiles: Express.Multer.File[],
      preExtractedData: any | null,
      userPromptArg: string,
      reqArg: Request,
      _movedFiles: { original: string; newPath: string }[],
    ): Promise<any> => {
      const groupPaths = groupFiles.map(f => f.path);
      let workOrderData: any;
      let needsManualReview = false;
      try {
        // Re-run combined extraction across ALL files in the group so supporting PDFs
        // (proofs, designs) can enrich fields the first PDF may not have. Pre-extracted
        // data is only used as a grouping signal, never as final structured data.
        if (groupPaths.length > 1) {
          workOrderData = await extractWorkOrderData(groupPaths[0], groupPaths.slice(1));
        } else {
          workOrderData = preExtractedData || await extractWorkOrderData(groupPaths[0]);
        }
      } catch (e) {
        console.error("Group extract failed:", e);
        needsManualReview = true;
        workOrderData = { workOrderNumber: null, invoiceNumber: null, customerName: null, customerPhone: null, customerEmail: null, pocName: null, address: null, city: null, state: null, postalCode: null, signTypes: [], dimensions: [], quantity: 1, description: null, installationNotes: "PDF extraction failed - manual review required", salesName: null, salesPhone: null, salesEmail: null, productDueDate: null, productDueTime: null, designDueDate: null, createdDate: null };
      }
      const normalizedData = {
        workOrderNumber: workOrderData.workOrderNumber || null,
        invoiceNumber: workOrderData.invoiceNumber || null,
        customerName: workOrderData.customerName || null,
        customerPhone: workOrderData.customerPhone || null,
        customerEmail: workOrderData.customerEmail || null,
        pocName: workOrderData.pocName || null,
        address: workOrderData.address || null,
        city: workOrderData.city || null,
        state: workOrderData.state || null,
        postalCode: workOrderData.postalCode || null,
        signTypes: Array.isArray(workOrderData.signTypes) ? workOrderData.signTypes : [],
        dimensions: Array.isArray(workOrderData.dimensions) ? workOrderData.dimensions : [],
        quantity: typeof workOrderData.quantity === "number" && workOrderData.quantity > 0 ? workOrderData.quantity : 1,
        description: workOrderData.description || null,
        installationNotes: workOrderData.installationNotes || null,
        salesName: workOrderData.salesName || null,
        salesPhone: workOrderData.salesPhone || null,
        salesEmail: workOrderData.salesEmail || null,
        productDueDate: workOrderData.productDueDate || null,
        productDueTime: workOrderData.productDueTime || null,
      };

      const workOrderId = normalizedData.workOrderNumber || normalizedData.invoiceNumber;
      const aiAdminId = await resolveAdminId(storage, reqArg.session.userId!);
      const adminAssistantId = curUser?.openaiAssistantId || null;
      const ownerSettings = await fetchOwnerSettings(reqArg.session.userId!);

      let assistantResult: any;
      try {
        assistantResult = await generateScheduleWithAssistant(normalizedData, userPromptArg, adminAssistantId, ownerSettings);
      } catch (e) {
        console.error("Assistant scheduling failed in group, fallback:", e);
        needsManualReview = true;
        assistantResult = { estimatedHours: 2, estimatedMinutes: 0, complexity: "medium", recommendedCrewSize: 2, reasoning: "AI calculation failed - using default 2-hour estimate.", suggestedDate: null, suggestedTime: null, additionalNotes: null };
      }
      const installTime = {
        estimatedHours: typeof assistantResult.estimatedHours === "number" ? assistantResult.estimatedHours : 1,
        estimatedMinutes: typeof assistantResult.estimatedMinutes === "number" ? assistantResult.estimatedMinutes : 0,
        complexity: assistantResult.complexity,
        recommendedCrewSize: typeof assistantResult.recommendedCrewSize === "number" && assistantResult.recommendedCrewSize >= 1 ? assistantResult.recommendedCrewSize : 1,
        reasoning: (assistantResult.reasoning || "") + (assistantResult.additionalNotes ? ` | ${assistantResult.additionalNotes}` : ""),
      };
      if (installTime.estimatedHours === 0 && installTime.estimatedMinutes < 30) installTime.estimatedMinutes = 30;

      const addressParts = [normalizedData.address, normalizedData.city, normalizedData.state, normalizedData.postalCode].filter(Boolean);
      let latitude: string | null = null;
      let longitude: string | null = null;
      if (addressParts.length >= 2) {
        try {
          const g = await geocodeAddress(addressParts.join(", "));
          if (g) { latitude = g.lat; longitude = g.lng; }
        } catch {}
      }

      const description = normalizedData.description || `Install for ${workOrderId || "work order"}` + (needsManualReview ? " - NEEDS MANUAL REVIEW" : "");

      const project = await storage.createProject({
        userId: reqArg.session.userId!,
        imageUrls: [],
        description,
        jobLabel: workOrderId,
        tags: normalizedData.signTypes,
        aiSuggestedTags: normalizedData.signTypes,
        hasIssue: needsManualReview,
        customerName: normalizedData.customerName,
        customerPhone: normalizedData.customerPhone,
        customerEmail: normalizedData.customerEmail,
        address: normalizedData.address,
        city: normalizedData.city,
        state: normalizedData.state,
        postalCode: normalizedData.postalCode,
        latitude,
        longitude,
      });

      const eventTitle = workOrderId ? `INSTALL - ${workOrderId}` : `INSTALL - ${normalizedData.customerName || "New Job"}`;
      const addressDisplay = addressParts.length > 0 ? addressParts.join(", ") : "No address provided";
      const eventDescription = [
        needsManualReview ? "⚠️ NEEDS MANUAL REVIEW - Some data could not be extracted\n" : "",
        `Customer: ${normalizedData.customerName || "N/A"}`,
        `Phone: ${normalizedData.customerPhone || "N/A"}`,
        `Address: ${addressDisplay}`,
        ``,
        `Signs: ${normalizedData.signTypes.length > 0 ? normalizedData.signTypes.join(", ") : "See work order"}`,
        `Dimensions: ${normalizedData.dimensions.length > 0 ? normalizedData.dimensions.join(", ") : "See work order"}`,
        `Quantity: ${normalizedData.quantity}`,
        ``,
        `Estimated Time: ${installTime.estimatedHours}h ${installTime.estimatedMinutes}m`,
        `Complexity: ${installTime.complexity || "N/A"}`,
        `Recommended Crew: ${installTime.recommendedCrewSize} person(s)`,
        `AI Notes: ${installTime.reasoning || "N/A"}`,
        ``,
        `Installation Notes: ${normalizedData.installationNotes || "None"}`
      ].join("\n");

      const calendarEvent = await storage.createCalendarEvent({
        title: eventTitle,
        description: eventDescription,
        date: new Date(),
        projectId: project.id,
        startTime: null,
        endTime: null,
        status: needsManualReview ? "NEEDS_REVIEW" : "DRAFT",
        createdBy: reqArg.session.userId!,
        workJobNumber: await deduplicateWorkJobNumberInTeam(workOrderId, aiAdminId) || undefined,
      });

      if (!workOrderId && !normalizedData.customerName && calendarEvent.workJobNumber) {
        const wjTitle = `INSTALL - ${calendarEvent.workJobNumber}`;
        await storage.updateCalendarEvent(calendarEvent.id, { title: wjTitle });
        (calendarEvent as any).title = wjTitle;
      }

      const job = await storage.createJob({
        workOrderNumber: normalizedData.workOrderNumber,
        invoiceNumber: normalizedData.invoiceNumber,
        jobName: description,
        description: description,
        address: normalizedData.address,
        city: normalizedData.city,
        state: normalizedData.state,
        postalCode: normalizedData.postalCode,
        formattedAddress: addressParts.length > 0 ? addressParts.join(", ") : null,
        latitude,
        longitude,
        customerName: normalizedData.customerName,
        pocName: normalizedData.pocName,
        customerEmail: normalizedData.customerEmail,
        customerPhone: normalizedData.customerPhone,
        salesName: normalizedData.salesName,
        salesPhone: normalizedData.salesPhone,
        salesEmail: normalizedData.salesEmail,
        notes: normalizedData.installationNotes,
        status: needsManualReview ? "NEEDS_REVIEW" : "SCHEDULED",
      });

      await storage.createInstallEvent({
        jobId: job.id,
        calendarEventId: calendarEvent.id,
        startTime: undefined,
        endTime: undefined,
        status: needsManualReview ? "NEEDS_REVIEW" : "DRAFT",
        gptEstimateMinutes: installTime.estimatedHours * 60 + installTime.estimatedMinutes,
        estimateConfidence: installTime.complexity,
        estimateSummary: installTime.reasoning,
      });

      // Upload files & create attachments — categorize each as INVOICE or WORK_ORDER based on this group's data
      for (let fi = 0; fi < groupFiles.length; fi++) {
        const f = groupFiles[fi];
        const newFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(f.originalname)}`;
        const fileUrl = await uploadFileToObjectStorage(f.path, newFileName, f.mimetype);
        const cat = fi === 0 ? classifyPdfCategory(f, workOrderData) : "PROOF";
        await storage.createAttachment({ jobId: job.id, fileName: f.originalname, fileUrl, fileType: f.mimetype, category: cat });
      }

      const confirmationToken = randomBytes(32).toString("hex");
      await storage.updateCalendarEvent(calendarEvent.id, { confirmationToken });

      logActivity(reqArg, {
        action: "AI_SCHEDULER",
        category: "Bookings",
        description: `AI scheduled "${eventTitle}" from ${normalizedData.invoiceNumber && !normalizedData.workOrderNumber ? "invoice" : "work order"}${needsManualReview ? " (needs review)" : ""}`,
        resourceId: calendarEvent.id,
        resourceType: "calendar_event",
        metadata: { eventTitle, workOrderNumber: normalizedData.workOrderNumber, invoiceNumber: normalizedData.invoiceNumber, customerName: normalizedData.customerName, needsManualReview, fileCount: groupFiles.length },
      });

      return {
        needsManualReview,
        emailSent: false,
        project,
        calendarEvent,
        job,
        workOrderData: normalizedData,
        installTime,
        message: needsManualReview
          ? `Created event but some data needs manual review. Check project details.`
          : `Created install event for ${eventTitle}. Please set the date and time to schedule.`,
      };
    };

    try {
      const userPrompt = req.body.prompt || "";
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one PDF file is required" });
      }

      // ---- Multi-job split: pre-extract job numbers per file when 2+ PDFs uploaded ----
      // If each file has a distinct WO/Invoice number, we create one booking per number
      // (current dialog accepts up to 5 PDFs). Files without an extractable job number
      // attach to the FIRST extracted-number group so proofs/designs stay together.
      type PerFile = { file: Express.Multer.File; data: any | null };
      let perFileExtractions: PerFile[] = [];
      if (files.length > 1) {
        perFileExtractions = await Promise.all(files.map(async (f): Promise<PerFile> => {
          try { return { file: f, data: await extractWorkOrderData(f.path) }; }
          catch (e) { console.error(`Per-file extract failed for ${f.originalname}:`, e); return { file: f, data: null }; }
        }));
        const distinctKeys = new Set(
          perFileExtractions
            .map(p => (p.data?.workOrderNumber || p.data?.invoiceNumber || "").trim())
            .filter(k => k.length > 0)
        );
        if (distinctKeys.size >= 2) {
          // Build groups: one per distinct job key, plus stranded no-key files joined to first group
          const groups: { key: string; files: Express.Multer.File[]; data: any }[] = [];
          for (const pe of perFileExtractions) {
            const k = (pe.data?.workOrderNumber || pe.data?.invoiceNumber || "").trim();
            if (!k) continue;
            const existing = groups.find(g => g.key === k);
            if (existing) existing.files.push(pe.file);
            else groups.push({ key: k, files: [pe.file], data: pe.data });
          }
          const noKey = perFileExtractions.filter(pe => !((pe.data?.workOrderNumber || pe.data?.invoiceNumber || "").trim()));
          if (groups.length > 0 && noKey.length > 0) {
            for (const nk of noKey) groups[0].files.push(nk.file);
          }

          const multiResults: any[] = [];
          for (const g of groups) {
            try {
              const r = await processSinglePdfGroup(g.files, g.data, userPrompt, req, movedFiles);
              multiResults.push(r);
            } catch (e) {
              console.error(`Failed to process group ${g.key}:`, e);
            }
          }
          // Cleanup any remaining temp files (most should already be unlinked by helper)
          cleanupFiles(false);
          if (multiResults.length === 0) {
            return res.status(500).json({ error: "Failed to create any bookings from the uploaded PDFs" });
          }
          if (multiResults.length === 1) {
            return res.status(201).json({ success: true, ...multiResults[0] });
          }
          return res.status(201).json({
            success: true,
            multiple: true,
            count: multiResults.length,
            events: multiResults,
            // Backwards-compat: also expose the first event at the top level so older clients still work
            ...multiResults[0],
            message: `Created ${multiResults.length} install events from the uploaded PDFs.`,
          });
        }
      }

      const allFilePaths = files.map(f => f.path);
      const allFileNames = files.map(f => f.originalname);
      
      console.log("Processing PDF files:", allFileNames.join(", "));

      let workOrderData;
      let needsManualReview = false;
      const pdfExtractStart = Date.now();
      try {
        // Always run combined extraction across all files so supporting PDFs (proofs,
        // designs) can enrich fields the first PDF may not have. Pre-extraction was only
        // a grouping signal — it is never used as the final structured data here.
        workOrderData = await extractWorkOrderData(allFilePaths[0], allFilePaths.slice(1));
        console.log("Extracted work order data:", workOrderData);
        logActivity(req, {
          action: "LLM_PDF_EXTRACTION",
          category: "AI",
          description: `PDF work order data extracted from ${allFileNames.length} file(s): ${workOrderData.workOrderNumber || workOrderData.invoiceNumber || allFileNames[0]}`,
          resourceType: "llm_call",
          metadata: { model: "gpt-4o", purpose: "pdf_work_order_extraction", fileNames: allFileNames, workOrderNumber: workOrderData.workOrderNumber, invoiceNumber: workOrderData.invoiceNumber, customerName: workOrderData.customerName, durationMs: Date.now() - pdfExtractStart },
        });
      } catch (extractError) {
        console.error("Failed to extract work order data:", extractError);
        needsManualReview = true;
        workOrderData = {
          workOrderNumber: null,
          invoiceNumber: null,
          customerName: null,
          customerPhone: null,
          customerEmail: null,
          pocName: null,
          address: null,
          city: null,
          state: null,
          postalCode: null,
          signTypes: [],
          dimensions: [],
          quantity: 1,
          description: null,
          installationNotes: "PDF extraction failed - manual review required",
          salesName: null,
          salesPhone: null,
          salesEmail: null,
          productDueDate: null,
          productDueTime: null,
          designDueDate: null,
          createdDate: null,
        };
      }

      console.log("Work order extracted dates:", {
        productDueDate: workOrderData.productDueDate,
        productDueTime: workOrderData.productDueTime,
        designDueDate: workOrderData.designDueDate,
        createdDate: workOrderData.createdDate,
        workOrderNumber: workOrderData.workOrderNumber,
      });
      
      // Normalize and validate work order data
      const normalizedData = {
        workOrderNumber: workOrderData.workOrderNumber || null,
        invoiceNumber: workOrderData.invoiceNumber || null,
        customerName: workOrderData.customerName || null,
        customerPhone: workOrderData.customerPhone || null,
        customerEmail: workOrderData.customerEmail || null,
        pocName: workOrderData.pocName || null,
        address: workOrderData.address || null,
        city: workOrderData.city || null,
        state: workOrderData.state || null,
        postalCode: workOrderData.postalCode || null,
        signTypes: Array.isArray(workOrderData.signTypes) ? workOrderData.signTypes : [],
        dimensions: Array.isArray(workOrderData.dimensions) ? workOrderData.dimensions : [],
        quantity: typeof workOrderData.quantity === "number" && workOrderData.quantity > 0 ? workOrderData.quantity : 1,
        description: workOrderData.description || null,
        installationNotes: workOrderData.installationNotes || null,
        salesName: workOrderData.salesName || null,
        salesPhone: workOrderData.salesPhone || null,
        salesEmail: workOrderData.salesEmail || null,
        productDueDate: workOrderData.productDueDate || null,
        productDueTime: workOrderData.productDueTime || null,
        designDueDate: workOrderData.designDueDate || null,
        createdDate: workOrderData.createdDate || null,
      };

      const workOrderId = normalizedData.workOrderNumber || normalizedData.invoiceNumber;
      // Resolve team admin ID for team-scoped WO deduplication (used when creating the event below)
      const aiAdminId = await resolveAdminId(storage, req.session.userId!);

      // Use OpenAI Assistant for scheduling analysis (with fallback to standard AI)
      const adminAssistantId = curUser?.openaiAssistantId || null;
      const ownerSettings = await fetchOwnerSettings(req.session.userId!);
      if (ownerSettings) {
        console.log("Owner settings loaded for AI:", { businessAddress: ownerSettings.businessAddress, hasStandards: !!ownerSettings.installTimeStandards });
      }
      let assistantResult;
      const pdfLlmStart = Date.now();
      try {
        console.log("Generating schedule with OpenAI Assistant...");
        assistantResult = await generateScheduleWithAssistant(normalizedData, userPrompt, adminAssistantId, ownerSettings);
        console.log("Assistant schedule result:", assistantResult);
      } catch (assistantError) {
        console.error("Assistant scheduling failed, using fallback:", assistantError);
        needsManualReview = true;
        assistantResult = {
          estimatedHours: 2,
          estimatedMinutes: 0,
          complexity: "medium",
          recommendedCrewSize: 2,
          reasoning: "AI calculation failed - using default 2-hour estimate. Manual review recommended.",
          suggestedDate: null,
          suggestedTime: null,
          additionalNotes: null,
        };
      }

      logActivity(req, {
        action: "LLM_SCHEDULE_ANALYSIS",
        category: "AI",
        description: `AI scheduling analysis for work order ${normalizedData.workOrderNumber || "unknown"} (${assistantResult.estimatedHours}h ${assistantResult.estimatedMinutes}m, ${assistantResult.complexity})`,
        resourceType: "llm_call",
        metadata: { model: "gpt-4o", purpose: "pdf_schedule_analysis", workOrderNumber: normalizedData.workOrderNumber, estimatedHours: assistantResult.estimatedHours, estimatedMinutes: assistantResult.estimatedMinutes, complexity: assistantResult.complexity, crewSize: assistantResult.recommendedCrewSize, usedAssistant: !!adminAssistantId, needsManualReview, durationMs: Date.now() - pdfLlmStart },
      });

      const datePrefs = {
        preferredDate: assistantResult.suggestedDate,
        preferredTime: assistantResult.suggestedTime,
      };

      const installTime = {
        estimatedHours: assistantResult.estimatedHours,
        estimatedMinutes: assistantResult.estimatedMinutes,
        complexity: assistantResult.complexity,
        recommendedCrewSize: assistantResult.recommendedCrewSize,
        reasoning: assistantResult.reasoning + (assistantResult.additionalNotes ? ` | ${assistantResult.additionalNotes}` : ""),
      };

      // Ensure minimum duration of 30 minutes
      if (installTime.estimatedHours === 0 && installTime.estimatedMinutes < 30) {
        installTime.estimatedMinutes = 30;
      }
      if (typeof installTime.estimatedHours !== "number") installTime.estimatedHours = 1;
      if (typeof installTime.estimatedMinutes !== "number") installTime.estimatedMinutes = 0;
      if (typeof installTime.recommendedCrewSize !== "number" || installTime.recommendedCrewSize < 1) {
        installTime.recommendedCrewSize = 1;
      }

      // Geocode the address only if we have a meaningful address
      let latitude: string | null = null;
      let longitude: string | null = null;
      
      const addressParts = [
        normalizedData.address,
        normalizedData.city,
        normalizedData.state,
        normalizedData.postalCode
      ].filter(Boolean);
      
      // Only geocode if we have at least city or address
      if (addressParts.length >= 2) {
        const fullAddress = addressParts.join(", ");
        try {
          const geoResult = await geocodeAddress(fullAddress);
          if (geoResult) {
            latitude = geoResult.lat;
            longitude = geoResult.lng;
          }
        } catch (geoError) {
          console.error("Geocoding failed:", geoError);
          // Continue without coordinates
        }
      }

      // Create the project (without PDF files as imageUrls - those will be added later via normal photo upload)
      const description = normalizedData.description || 
        `Install for ${workOrderId || "work order"}` +
        (needsManualReview ? " - NEEDS MANUAL REVIEW" : "");

      const project = await storage.createProject({
        userId: req.session.userId!,
        imageUrls: [], // No images from PDFs - user can add photos later
        description,
        jobLabel: workOrderId,
        tags: normalizedData.signTypes,
        aiSuggestedTags: normalizedData.signTypes,
        hasIssue: needsManualReview, // Flag if manual review needed
        customerName: normalizedData.customerName,
        customerPhone: normalizedData.customerPhone,
        customerEmail: normalizedData.customerEmail,
        address: normalizedData.address,
        city: normalizedData.city,
        state: normalizedData.state,
        postalCode: normalizedData.postalCode,
        latitude,
        longitude,
      });

      // Always leave date/time blank — admin will set them manually
      const eventDate: Date | null = null;
      const endDate: Date | null = null;

      // Create calendar event title using Work Order Number
      const eventTitle = workOrderId
        ? `INSTALL - ${workOrderId}`
        : `INSTALL - ${normalizedData.customerName || "New Job"}`;

      const addressDisplay = addressParts.length > 0 ? addressParts.join(", ") : "No address provided";
      const signsDisplay = normalizedData.signTypes.length > 0 ? normalizedData.signTypes.join(", ") : "See work order";
      const dimensionsDisplay = normalizedData.dimensions.length > 0 ? normalizedData.dimensions.join(", ") : "See work order";

      const eventDescription = [
        needsManualReview ? "⚠️ NEEDS MANUAL REVIEW - Some data could not be extracted\n" : "",
        `Customer: ${normalizedData.customerName || "N/A"}`,
        `Phone: ${normalizedData.customerPhone || "N/A"}`,
        `Address: ${addressDisplay}`,
        ``,
        `Signs: ${signsDisplay}`,
        `Dimensions: ${dimensionsDisplay}`,
        `Quantity: ${normalizedData.quantity}`,
        ``,
        `Estimated Time: ${installTime.estimatedHours}h ${installTime.estimatedMinutes}m`,
        `Complexity: ${installTime.complexity || "N/A"}`,
        `Recommended Crew: ${installTime.recommendedCrewSize} person(s)`,
        `AI Notes: ${installTime.reasoning || "N/A"}`,
        ``,
        `Installation Notes: ${normalizedData.installationNotes || "None"}`
      ].join("\n");

      const calendarEvent = await storage.createCalendarEvent({
        title: eventTitle,
        description: eventDescription,
        date: eventDate || new Date(),
        projectId: project.id,
        startTime: eventDate,
        endTime: endDate,
        status: needsManualReview ? "NEEDS_REVIEW" : "DRAFT",
        createdBy: req.session.userId!,
        workJobNumber: await deduplicateWorkJobNumberInTeam(workOrderId, aiAdminId) || undefined,
      });

      // If neither a work order number nor a customer name was extracted, the title is "INSTALL - New Job".
      // Replace it with the auto-generated WJ number so the booking shows "INSTALL - WJ-00282".
      if (!workOrderId && !normalizedData.customerName && calendarEvent.workJobNumber) {
        const wjTitle = `INSTALL - ${calendarEvent.workJobNumber}`;
        await storage.updateCalendarEvent(calendarEvent.id, { title: wjTitle });
        (calendarEvent as any).title = wjTitle;
      }

      // Create a Job record to link attachments
      const job = await storage.createJob({
        workOrderNumber: normalizedData.workOrderNumber,
        invoiceNumber: normalizedData.invoiceNumber,
        jobName: description,
        description: description,
        address: normalizedData.address,
        city: normalizedData.city,
        state: normalizedData.state,
        postalCode: normalizedData.postalCode,
        formattedAddress: addressParts.length > 0 ? addressParts.join(", ") : null,
        latitude,
        longitude,
        customerName: normalizedData.customerName,
        pocName: normalizedData.pocName,
        customerEmail: normalizedData.customerEmail,
        customerPhone: normalizedData.customerPhone,
        salesName: normalizedData.salesName,
        salesPhone: normalizedData.salesPhone,
        salesEmail: normalizedData.salesEmail,
        notes: normalizedData.installationNotes,
        status: needsManualReview ? "NEEDS_REVIEW" : "SCHEDULED",
      });

      // Create InstallEvent to link job to calendar event (dates blank for admin to set)
      await storage.createInstallEvent({
        jobId: job.id,
        calendarEventId: calendarEvent.id,
        startTime: eventDate || undefined,
        endTime: endDate || undefined,
        status: needsManualReview ? "NEEDS_REVIEW" : "DRAFT",
        gptEstimateMinutes: installTime.estimatedHours * 60 + installTime.estimatedMinutes,
        estimateConfidence: installTime.complexity,
        estimateSummary: installTime.reasoning,
      });

      // Upload PDF files to cloud storage and create attachments
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        const newFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        
        const fileUrl = await uploadFileToObjectStorage(file.path, newFileName, file.mimetype);
        
        const cat = fi === 0 ? classifyPdfCategory(file, workOrderData) : "PROOF";
        await storage.createAttachment({
          jobId: job.id,
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          category: cat,
        });
      }

      // Generate a secure confirmation token and save it to the calendar event
      const confirmationToken = randomBytes(32).toString("hex");
      await storage.updateCalendarEvent(calendarEvent.id, { confirmationToken });

      // Email is NOT sent automatically - admin must use the "Send Email" button manually
      let emailSent = false;

      logActivity(req, {
        action: "AI_SCHEDULER",
        category: "Bookings",
        description: `AI scheduled "${eventTitle}" from work order${needsManualReview ? " (needs review)" : ""}`,
        resourceId: calendarEvent.id,
        resourceType: "calendar_event",
        metadata: {
          eventTitle,
          workOrderNumber: normalizedData.workOrderNumber,
          customerName: normalizedData.customerName,
          needsManualReview,
          estimatedMinutes: installTime.estimatedHours * 60 + installTime.estimatedMinutes,
        },
      });

      res.status(201).json({
        success: true,
        needsManualReview,
        emailSent,
        project,
        calendarEvent,
        job,
        workOrderData: normalizedData,
        installTime,
        message: needsManualReview 
          ? `Created event but some data needs manual review. Check project details.`
          : eventDate
            ? `Created install event for ${eventTitle} on ${eventDate.toLocaleDateString()} at ${eventDate.toLocaleTimeString()}${emailSent ? ` - Confirmation email sent to ${normalizedData.customerEmail}` : ''}`
            : `Created install event for ${eventTitle}. Please set the date and time to schedule.`
      });

    } catch (error) {
      console.error("Error processing PDF for calendar:", error);
      // Clean up temp files and rollback any moved files on error
      cleanupFiles(true);
      res.status(500).json({ 
        error: "Failed to process work order PDF",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ===== Intake API - Create from Prompt + Upload =====
  app.post("/api/intake/create-from-prompt", requireAdmin, pdfUpload.array("files", 10), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    
    const cleanupFiles = () => {
      if (files) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
    };

    try {
      const promptText = req.body.promptText || "";
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "At least one PDF file (work order) is required" });
      }

      // Separate work order from proof files
      const workOrderFile = files[0]; // First file is assumed to be work order
      const proofFiles = files.slice(1);

      console.log("Processing intake:", {
        prompt: promptText,
        workOrder: workOrderFile.originalname,
        proofs: proofFiles.map(f => f.originalname)
      });

      // Extract work order data
      const workOrderData = await extractWorkOrderData(workOrderFile.path);
      
      // Extract proof data if available
      let invoiceNumber = workOrderData.invoiceNumber;
      const proofDataList = [];
      for (const proofFile of proofFiles) {
        const proofData = await extractProofData(proofFile.path);
        proofDataList.push(proofData);
        // Use invoice number from proof if work order doesn't have one
        if (!invoiceNumber && proofData.invoiceNumber) {
          invoiceNumber = proofData.invoiceNumber;
        }
      }

      // Use OpenAI Assistant for scheduling analysis (with fallback to standard AI)
      const intakeUser = await storage.getUser(req.session.userId!);
      const intakeAdminAssistantId = intakeUser?.openaiAssistantId || null;
      const intakeOwnerSettings = await fetchOwnerSettings(req.session.userId!);
      let assistantSchedule;
      const intakeLlmStart = Date.now();
      try {
        console.log("Generating schedule with OpenAI Assistant for intake...");
        assistantSchedule = await generateScheduleWithAssistant(workOrderData, promptText, intakeAdminAssistantId, intakeOwnerSettings);
        console.log("Assistant schedule result for intake:", assistantSchedule);
      } catch (assistantError) {
        console.error("Assistant scheduling failed for intake, using fallback:", assistantError);
        assistantSchedule = {
          estimatedHours: 2,
          estimatedMinutes: 0,
          complexity: "medium",
          recommendedCrewSize: 2,
          reasoning: "AI calculation failed - using default 2-hour estimate. Manual review recommended.",
          suggestedDate: null,
          suggestedTime: null,
          additionalNotes: null,
        };
      }

      logActivity(req, {
        action: "LLM_SCHEDULE_ANALYSIS",
        category: "AI",
        description: `AI intake scheduling analysis (${assistantSchedule.estimatedHours}h ${assistantSchedule.estimatedMinutes}m, ${assistantSchedule.complexity})`,
        resourceType: "llm_call",
        metadata: { model: "gpt-4o", purpose: "intake_schedule_analysis", estimatedHours: assistantSchedule.estimatedHours, estimatedMinutes: assistantSchedule.estimatedMinutes, complexity: assistantSchedule.complexity, crewSize: assistantSchedule.recommendedCrewSize, usedAssistant: !!intakeAdminAssistantId, durationMs: Date.now() - intakeLlmStart },
      });
      
      const datePrefs = {
        preferredDate: assistantSchedule.suggestedDate,
        preferredTime: assistantSchedule.suggestedTime,
      };
      
      const installTimeEstimate = {
        estimatedHours: assistantSchedule.estimatedHours,
        estimatedMinutes: assistantSchedule.estimatedMinutes,
        complexity: assistantSchedule.complexity,
        recommendedCrewSize: assistantSchedule.recommendedCrewSize,
        reasoning: assistantSchedule.reasoning + (assistantSchedule.additionalNotes ? ` | ${assistantSchedule.additionalNotes}` : ""),
      };
      
      // Total minutes for endTime calculation
      const totalMinutes = (installTimeEstimate.estimatedHours * 60) + installTimeEstimate.estimatedMinutes;

      // Geocode the address
      let latitude: string | null = null;
      let longitude: string | null = null;
      let formattedAddress: string | null = null;
      
      const addressParts = [
        workOrderData.address,
        workOrderData.city,
        workOrderData.state,
        workOrderData.postalCode
      ].filter(Boolean);
      
      if (addressParts.length >= 2) {
        const fullAddress = addressParts.join(", ");
        try {
          const geoResult = await geocodeAddress(fullAddress);
          if (geoResult) {
            latitude = geoResult.lat;
            longitude = geoResult.lng;
            formattedAddress = geoResult.formattedAddress;
          }
        } catch (geoError) {
          console.error("Geocoding failed:", geoError);
        }
      }

      // Always leave date/time blank — admin will set them manually
      const startDate: Date | null = null;
      const endDate: Date | null = null;

      // Build job draft
      const jobDraft = {
        workOrderNumber: workOrderData.workOrderNumber,
        invoiceNumber: invoiceNumber,
        jobName: workOrderData.description,
        description: workOrderData.description,
        address: workOrderData.address,
        city: workOrderData.city,
        state: workOrderData.state,
        postalCode: workOrderData.postalCode,
        formattedAddress,
        latitude,
        longitude,
        customerName: workOrderData.customerName,
        pocName: workOrderData.pocName,
        customerEmail: workOrderData.customerEmail,
        customerPhone: workOrderData.customerPhone,
        salesName: workOrderData.salesName,
        salesPhone: workOrderData.salesPhone,
        salesEmail: workOrderData.salesEmail,
        notes: workOrderData.installationNotes,
        status: "DRAFT" as const
      };

      // Build event draft
      const eventDraft = {
        startTime: startDate ? startDate.toISOString() : null,
        endTime: endDate ? endDate.toISOString() : null,
        status: "SCHEDULED" as const,
        gptEstimateMinutes: totalMinutes,
        estimateConfidence: installTimeEstimate.complexity,
        estimateSummary: installTimeEstimate.reasoning
      };

      // Upload files to cloud storage
      const uploadFileToPermanent = async (file: Express.Multer.File): Promise<string> => {
        const newFileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        return await uploadFileToObjectStorage(file.path, newFileName, file.mimetype);
      };

      const woFileUrl = await uploadFileToPermanent(workOrderFile);
      const proofFileUrls = await Promise.all(proofFiles.map(uploadFileToPermanent));

      const attachmentDrafts = [
        {
          fileName: workOrderFile.originalname,
          fileUrl: woFileUrl,
          fileType: workOrderFile.mimetype,
          category: "WORK_ORDER" as const
        },
        ...proofFiles.map((f, i) => ({
          fileName: f.originalname,
          fileUrl: proofFileUrls[i],
          fileType: f.mimetype,
          category: "PROOF" as const
        }))
      ];

      // Files are now in permanent location and don't need cleanup

      res.status(200).json({
        success: true,
        jobDraft,
        eventDraft,
        attachmentDrafts,
        extractedData: {
          workOrder: workOrderData,
          proofs: proofDataList
        },
        gptEstimate: {
          estimatedMinutes: totalMinutes,
          estimatedHours: installTimeEstimate.estimatedHours,
          remainingMinutes: installTimeEstimate.estimatedMinutes,
          confidence: installTimeEstimate.complexity,
          shortSummary: installTimeEstimate.reasoning,
          recommendedCrewSize: installTimeEstimate.recommendedCrewSize
        },
        dateTimeFromPrompt: datePrefs
      });

    } catch (error) {
      console.error("Error processing intake:", error);
      cleanupFiles();
      res.status(500).json({ 
        error: "Failed to process intake request",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ===== Jobs API =====
  app.get("/api/jobs", requireAuth, async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error getting jobs:", error);
      res.status(500).json({ error: "Failed to get jobs" });
    }
  });

  app.get("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const job = await storage.getJob(id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      // Get related data
      const installEventsData = await storage.getInstallEventsByJobId(id);
      const attachmentsData = await storage.getAttachmentsByJobId(id);
      
      res.json({ job, installEvents: installEventsData, attachments: attachmentsData });
    } catch (error) {
      console.error("Error getting job:", error);
      res.status(500).json({ error: "Failed to get job" });
    }
  });

  app.post("/api/jobs", requireAuth, async (req, res) => {
    try {
      const jobData = req.body;
      const job = await storage.createJob(jobData);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(500).json({ error: "Failed to create job" });
    }
  });

  app.patch("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const updated = await storage.updateJob(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating job:", error);
      res.status(500).json({ error: "Failed to update job" });
    }
  });

  app.delete("/api/jobs/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      await storage.deleteJob(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // ===== Install Events API =====
  app.get("/api/install-events", requireAuth, async (req, res) => {
    try {
      const events = await storage.getAllInstallEvents();
      res.json(events);
    } catch (error) {
      console.error("Error getting install events:", error);
      res.status(500).json({ error: "Failed to get install events" });
    }
  });

  app.post("/api/install-events", requireAuth, async (req, res) => {
    try {
      const eventData = req.body;
      const event = await storage.createInstallEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating install event:", error);
      res.status(500).json({ error: "Failed to create install event" });
    }
  });

  app.patch("/api/install-events/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const updated = await storage.updateInstallEvent(id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Install event not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating install event:", error);
      res.status(500).json({ error: "Failed to update install event" });
    }
  });

  // ===== Attachments API =====
  app.get("/api/jobs/:jobId/attachments", requireAuth, async (req, res) => {
    try {
      const jobIdParam = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const jobId = parseInt(jobIdParam);
      const attachmentsData = await storage.getAttachmentsByJobId(jobId);
      res.json(attachmentsData);
    } catch (error) {
      console.error("Error getting attachments:", error);
      res.status(500).json({ error: "Failed to get attachments" });
    }
  });

  app.post("/api/jobs/:jobId/attachments", requireAuth, async (req, res) => {
    try {
      const jobIdParam = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const jobId = parseInt(jobIdParam);
      const attachmentData = { ...req.body, jobId };
      const attachment = await storage.createAttachment(attachmentData);
      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Upload photos to a job (for finished install photos)
  app.post("/api/jobs/:jobId/upload-photos", requireAuth, upload.array("photos", 50), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    try {
      const jobIdParam = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const jobId = parseInt(jobIdParam);
      const { tags, description } = req.body;
      
      // Parse tags if provided as JSON string
      let parsedTags: string[] = [];
      if (tags) {
        try {
          parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        } catch {
          parsedTags = [];
        }
      }
      
      // Verify job exists and photo limit
      const job = await storage.getJob(jobId);
      if (!job) {
        // Clean up uploaded files
        if (files) {
          for (const file of files) {
            try { fs.unlinkSync(file.path); } catch {}
          }
        }
        return res.status(404).json({ error: "Job not found" });
      }

      const MAX_JOB_PHOTOS = 50;
      const existingAttachments = await storage.getAttachmentsByJobId(jobId);
      const existingPhotoCount = existingAttachments.filter((a: any) => a.category === "FINISHED_PHOTO").length;
      if (existingPhotoCount + files.length > MAX_JOB_PHOTOS) {
        if (files) files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
        return res.status(400).json({ error: `Photo limit exceeded. Maximum ${MAX_JOB_PHOTOS} photos per project. You currently have ${existingPhotoCount} and are trying to add ${files.length}.` });
      }
      
      const createdAttachments = [];
      const photoUrls: string[] = [];
      
      for (const file of files) {
        const fileUrl = await uploadFileToObjectStorage(file.path, file.filename, file.mimetype);
        photoUrls.push(fileUrl);
        
        const attachment = await storage.createAttachment({
          jobId,
          fileName: file.originalname,
          fileUrl,
          fileType: file.mimetype,
          category: "FINISHED_PHOTO",
        });
        createdAttachments.push(attachment);
      }
      
      // Find associated project via installEvent -> calendarEvent -> project
      const installEvents = await storage.getInstallEventsByJobId(jobId);
      let projectId: number | null = null;
      
      for (const ie of installEvents) {
        if (ie.calendarEventId) {
          const calEvent = await storage.getCalendarEvent(ie.calendarEventId);
          if (calEvent?.projectId) {
            projectId = calEvent.projectId;
            break;
          }
        }
      }
      
      // Update project with finished photos if found
      if (projectId) {
        const project = await storage.getProject(projectId);
        if (project) {
          const existingUrls = project.imageUrls || [];
          const newImageUrls = [...existingUrls, ...photoUrls];
          
          // Run AI analysis on first photo for tag suggestions
          let aiSuggestedTags: string[] = project.aiSuggestedTags || [];
          if (photoUrls.length > 0) {
            try {
              const aiResult = await analyzeImageWithAI(photoUrls[0]);
              if (aiResult.tags && aiResult.tags.length > 0) {
                aiSuggestedTags = Array.from(new Set([...aiSuggestedTags, ...aiResult.tags]));
              }
            } catch (err) {
              console.error("AI analysis failed:", err);
            }
          }
          
          // Merge manual tags with existing
          const existingTags = project.tags || [];
          const mergedTags = Array.from(new Set([...existingTags, ...parsedTags]));
          
          const updatedProject = await storage.updateProject(projectId, {
            imageUrls: newImageUrls,
            hasFinishedPhotos: true,
            tags: mergedTags,
            aiSuggestedTags,
            description: description || project.description,
            jobLabel: job.workOrderNumber || project.jobLabel,
          });

          // Sync new photos + metadata to Asset Manager (fire-and-forget)
          // Resolve admin from project owner (updatedProject.userId) so super_admin uploads target the correct tenant
          const uploaderIdForSync = req.session.userId!;
          getAdminIdForUserId(updatedProject?.userId ?? uploaderIdForSync).then(adminId => {
            if (adminId && updatedProject) {
              return syncProjectToAssets(updatedProject, adminId, uploaderIdForSync);
            }
          }).catch(err => console.warn("[Asset Sync] Job photo upload sync failed:", err));

          // Mark linked calendar events as COMPLETED
          const linkedEvents = await storage.getCalendarEventsByProjectId(projectId);
          for (const linkedEvent of linkedEvents) {
            if (linkedEvent.status !== "COMPLETED" && linkedEvent.status !== "ISSUE") {
              await storage.updateCalendarEvent(linkedEvent.id, { status: "COMPLETED" });
              console.log(`Marked calendar event ${linkedEvent.id} as COMPLETED after finished photos upload`);
            }
          }
        }
      }
      
      logActivity(req, {
        action: "PHOTO_UPLOADED",
        category: "Projects",
        description: `Uploaded ${files.length} photo(s) for job #${jobId}${projectId ? ` (project #${projectId})` : ""}`,
        resourceId: projectId || jobId,
        resourceType: projectId ? "project" : "job",
        metadata: { jobId, projectId, photoCount: files.length, tags: parsedTags },
      });

      res.status(201).json({ success: true, attachments: createdAttachments, projectId });
    } catch (error) {
      // Clean up uploaded files on error
      if (files) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
      console.error("Error uploading photos:", error);
      res.status(500).json({ error: "Failed to upload photos" });
    }
  });

  // Stream an attachment through our domain so the raw DigitalOcean Spaces URL
  // is never exposed to the browser. Address bar shows /api/attachments/:id/download.
  app.get("/api/attachments/:attachmentId/download", requireAuth, async (req, res) => {
    try {
      const attachmentId = parseInt(req.params.attachmentId);
      if (isNaN(attachmentId)) return res.status(400).json({ error: "Invalid attachment ID" });

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });

      const attachment = await storage.getAttachment(attachmentId);
      if (!attachment) return res.status(404).json({ error: "Attachment not found" });

      // Tenant isolation (mirrors DELETE /api/attachments/:id): only allow users in the
      // same team as the linked install/calendar event. Super admin gets read access.
      if (currentUser.role !== "super_admin") {
        const teamIds = await getTeamUserIdsForUser(currentUser);
        if (teamIds !== null && attachment.jobId != null) {
          const installEvents = await storage.getInstallEventsByJobId(attachment.jobId);
          const calEventIds = installEvents.map(ie => ie.calendarEventId).filter((v): v is number => v != null);
          if (calEventIds.length > 0) {
            let allowed = false;
            let crossTenantHit = false;
            for (const ceId of calEventIds) {
              const ce = await storage.getCalendarEvent(ceId);
              if (!ce || ce.createdBy == null) continue;
              if (teamIds.includes(ce.createdBy)) { allowed = true; break; }
              crossTenantHit = true;
            }
            if (!allowed && crossTenantHit) {
              return res.status(403).json({ error: "Forbidden" });
            }
          }
        }
      }

      const key = extractSpacesKey(attachment.fileUrl);
      if (!key) {
        // Fallback for non-Spaces URLs: just redirect (legacy data)
        return res.redirect(attachment.fileUrl);
      }

      const obj = await getSpacesObject(key);
      const safeName = (attachment.fileName || "download").replace(/"/g, "");
      res.setHeader("Content-Type", obj.contentType || attachment.fileType || "application/octet-stream");
      if (obj.contentLength != null) res.setHeader("Content-Length", String(obj.contentLength));
      res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      obj.body.pipe(res);
      obj.body.on("error", (err) => {
        console.error("Error streaming attachment:", err);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
    } catch (error) {
      console.error("Error fetching attachment:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to fetch attachment" });
    }
  });

  // Delete a specific photo attachment
  app.delete("/api/attachments/:attachmentId", requireAuth, async (req, res) => {
    try {
      const attachmentId = parseInt(req.params.attachmentId);
      if (isNaN(attachmentId)) return res.status(400).json({ error: "Invalid attachment ID" });

      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
      if (currentUser.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin has view-only access" });
      }

      const attachment = await storage.getAttachment(attachmentId);
      if (!attachment) return res.status(404).json({ error: "Attachment not found" });

      // Tenant isolation: ensure the attachment belongs to a calendar event in the
      // current user's team. Look up the linked install event → calendar event → createdBy.
      // Fallback rule: when an attachment has no resolvable install-event linkage
      // (legacy/orphan data, or jobs created without install events) we allow the delete
      // for non-super-admin users rather than 403'ing — there is no team signal to check
      // against, and this matches the previous behavior. super_admin is already blocked above.
      const teamIds = await getTeamUserIdsForUser(currentUser);
      if (teamIds !== null && attachment.jobId != null) {
        const installEvents = await storage.getInstallEventsByJobId(attachment.jobId);
        const calEventIds = installEvents.map(ie => ie.calendarEventId).filter((v): v is number => v != null);
        if (calEventIds.length > 0) {
          let allowed = false;
          let crossTenantHit = false;
          for (const ceId of calEventIds) {
            const ce = await storage.getCalendarEvent(ceId);
            if (!ce || ce.createdBy == null) continue;
            if (teamIds.includes(ce.createdBy)) { allowed = true; break; }
            crossTenantHit = true;
          }
          // Only deny if we positively identified a different tenant's event.
          // Otherwise (no resolvable createdBy at all), fall through to allow.
          if (!allowed && crossTenantHit) {
            return res.status(403).json({ error: "Forbidden" });
          }
        }
      }

      await storage.deleteAttachment(attachmentId);

      logActivity(req, {
        action: "DELETE_ATTACHMENT",
        category: "Storage",
        description: `Deleted ${attachment.category || "attachment"}: ${attachment.fileName}`,
        resourceId: attachmentId,
        resourceType: "attachment",
        metadata: { fileName: attachment.fileName, fileType: attachment.fileType, category: attachment.category, jobId: attachment.jobId },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  app.patch("/api/calendar-events/:id", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });

      if (currentUser.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }

      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const { title, description, date, startTime, endTime, status, projectId, address, hasIssue, issueDescription, customerName, customerPhone, customerEmail, secondaryPocName, secondaryPocPhone, secondaryPocEmail, workJobNumber } = req.body;

      const existingEvent = await storage.getCalendarEvent(id);

      // Drag-and-drop reschedule: only date/startTime/endTime supplied with no title or status change.
      // Block only completed bookings; SCHEDULED, CONFIRMED, SURVEY, NEEDS_RESCHEDULE, ISSUE can be moved.
      const isDragReschedule = (date || startTime) && !title && status === undefined;
      if (isDragReschedule && existingEvent && existingEvent.status === "COMPLETED") {
        return res.status(403).json({ error: "Completed bookings cannot be rescheduled by drag and drop" });
      }

      // Enforce booking time policy when caller is changing date/start/end (skip pure metadata updates).
      // For drag-and-drop reschedules we only shift the day while preserving the original time-of-day,
      // so legacy events whose times are not on a 30-min boundary (or outside 06:00–20:00 EST) must
      // still be movable. We only enforce that the new start is not in the past.
      //
      // Important: the booking edit form always re-sends the current date/start/end values even when
      // the user only edited contact details. We must compare normalized timestamps — not raw values —
      // because the request body is an ISO string and existingEvent.* is a Date object (raw !== would
      // always be true, blocking past-date booking edits and rejecting legacy non-30-min times).
      if (date !== undefined || startTime !== undefined || endTime !== undefined) {
        const effDate = date !== undefined ? date : existingEvent?.date;
        const effStart = startTime !== undefined ? startTime : existingEvent?.startTime;
        const effEnd = endTime !== undefined ? endTime : existingEvent?.endTime;

        const tsOrNull = (v: any): number | null => {
          if (v === undefined || v === null) return null;
          const t = new Date(v as any).getTime();
          return isNaN(t) ? null : t;
        };
        const dateChanged = date !== undefined && tsOrNull(date) !== tsOrNull(existingEvent?.date);
        const startChanged = startTime !== undefined && tsOrNull(startTime) !== tsOrNull(existingEvent?.startTime);
        const endChanged = endTime !== undefined && tsOrNull(endTime) !== tsOrNull(existingEvent?.endTime);
        const anyTimeChanged = dateChanged || startChanged || endChanged;

        if (isDragReschedule) {
          const startRaw = effStart || effDate;
          if (startRaw) {
            const sd = new Date(startRaw as any);
            if (!isNaN(sd.getTime()) && sd.getTime() < Date.now()) {
              return res.status(400).json({ error: "Bookings cannot be rescheduled to a past date or time." });
            }
          }
        } else if (anyTimeChanged) {
          const patchTimeError = validateBookingWindow(effDate, effStart, effEnd, { allowPast: !(dateChanged || startChanged) });
          if (patchTimeError) {
            return res.status(400).json({ error: patchTimeError });
          }
        }
      }

      // If caller is renaming the workJobNumber, ensure it's not already in use within the same team.
      let normalizedWorkJobNumber: string | undefined = undefined;
      if (workJobNumber !== undefined) {
        const trimmed = (workJobNumber || "").trim();
        if (!trimmed) {
          return res.status(400).json({ error: "Job ID cannot be empty" });
        }
        if (existingEvent && (existingEvent.workJobNumber || "").trim() !== trimmed) {
          const teamIds = await getTeamUserIdsForUser(currentUser);
          const dupQuery = db
            .select({ id: calendarEvents.id })
            .from(calendarEvents);
          const dupRows = teamIds === null
            ? await dupQuery.where(sql`LOWER(TRIM(${calendarEvents.workJobNumber})) = ${trimmed.toLowerCase()}`)
            : await dupQuery.where(and(
                sql`LOWER(TRIM(${calendarEvents.workJobNumber})) = ${trimmed.toLowerCase()}`,
                inArray(calendarEvents.createdBy, teamIds),
              ));
          if (dupRows.some(r => r.id !== id)) {
            return res.status(409).json({ error: `Job ID "${trimmed}" is already used by another booking on your team.` });
          }
        }
        normalizedWorkJobNumber = trimmed;
      }

      const updated = await storage.updateCalendarEvent(id, {
        title,
        description,
        date: date ? new Date(date) : undefined,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        status,
        projectId,
        address,
        hasIssue,
        issueDescription,
        customerName,
        customerPhone,
        customerEmail,
        secondaryPocName,
        secondaryPocPhone,
        secondaryPocEmail,
        workJobNumber: normalizedWorkJobNumber,
      });

      if (!updated) {
        return res.status(404).json({ error: "Calendar event not found" });
      }

      const isStatusChange = existingEvent && status && existingEvent.status !== status;
      const changes = computeBookingChanges(
        existingEvent,
        updated,
        Object.keys(req.body || {}),
      );
      if (isStatusChange && status === "COMPLETED") {
        logActivity(req, {
          action: "COMPLETE_BOOKING",
          category: "Bookings",
          description: `Completed booking: ${updated.title}`,
          resourceId: id,
          resourceType: "calendar_event",
          metadata: {
            previousStatus: existingEvent?.status,
            customerName: updated.customerName,
            changes,
          },
        });
      } else if (isStatusChange || changes.length > 0) {
        // Skip no-op PATCHes so the activity history only reflects real
        // user-driven changes (avoids noise from idempotent re-saves).
        logActivity(req, {
          action: "UPDATE_BOOKING",
          category: "Bookings",
          description: `Updated booking: ${updated.title}`,
          resourceId: id,
          resourceType: "calendar_event",
          metadata: {
            status: updated.status,
            customerName: updated.customerName,
            changes,
          },
        });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating calendar event:", error);
      res.status(500).json({ error: "Failed to update calendar event" });
    }
  });

  // Get activity log history for a single calendar event ("Last Updates")
  app.get("/api/calendar-events/:id/activity", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
      const event = await storage.getCalendarEvent(id);
      if (!event) return res.status(404).json({ error: "Booking not found" });
      const teamIds = await getTeamUserIdsForUser(currentUser);
      if (teamIds !== null) {
        if (event.createdBy == null || !teamIds.includes(event.createdBy)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const result = await pool.query(
        `SELECT id, user_id as "userId", user_name as "userName", user_email as "userEmail",
                user_role as "userRole", action, category, description,
                resource_id as "resourceId", resource_type as "resourceType",
                metadata, created_at as "createdAt"
         FROM activity_logs
         WHERE deleted_at IS NULL
           AND resource_type = 'calendar_event'
           AND resource_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [String(id)],
      );
      res.json(
        result.rows.map((r: any) => ({
          ...r,
          metadata: safeParseJson(r.metadata),
        })),
      );
    } catch (error) {
      console.error("Error fetching booking activity:", error);
      res.status(500).json({ error: "Failed to fetch booking activity" });
    }
  });

  // Get activity log history for a project ("Last Updates"), including any
  // linked calendar event activity so completion + post-completion updates
  // surface on the dashboard project view.
  app.get("/api/projects/:id/activity", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });
      const project = await storage.getProject(id);
      if (!project) return res.status(404).json({ error: "Project not found" });
      const teamIds = await getTeamUserIdsForUser(currentUser);
      if (teamIds !== null) {
        if (project.userId == null || !teamIds.includes(project.userId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
      const linkedEvents = await storage.getCalendarEventsByProjectId(id);
      const eventIds = linkedEvents.map((e) => String(e.id));
      const params: any[] = [String(id)];
      let extraClause = "";
      if (eventIds.length) {
        const placeholders = eventIds.map((_, i) => `$${i + 2}`).join(",");
        extraClause = ` OR (resource_type = 'calendar_event' AND resource_id IN (${placeholders}))`;
        params.push(...eventIds);
      }
      const result = await pool.query(
        `SELECT id, user_id as "userId", user_name as "userName", user_email as "userEmail",
                user_role as "userRole", action, category, description,
                resource_id as "resourceId", resource_type as "resourceType",
                metadata, created_at as "createdAt"
         FROM activity_logs
         WHERE deleted_at IS NULL
           AND ((resource_type = 'project' AND resource_id = $1)${extraClause})
         ORDER BY created_at DESC
         LIMIT 200`,
        params,
      );
      res.json(
        result.rows.map((r: any) => ({
          ...r,
          metadata: safeParseJson(r.metadata),
        })),
      );
    } catch (error) {
      console.error("Error fetching project activity:", error);
      res.status(500).json({ error: "Failed to fetch project activity" });
    }
  });

  // Get assignments for a calendar event
  app.get("/api/calendar-events/:id/assignments", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const assignments = await storage.getEventAssignments(id);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  // ---------------------------------------------------------------------------
  // Availability blocks (per-user unavailable time)
  // ---------------------------------------------------------------------------

  // Validation schemas for availability block payloads.
  const availabilityCategorySchema = z
    .string()
    .refine((v) => (AVAILABILITY_CATEGORIES as readonly string[]).includes(v), {
      message: "Invalid category",
    });
  // Office hours are defined in the business timezone (Central) — the same zone
  // the calendar renders in — so server checks match what the user sees.
  const AVAIL_BUSINESS_TZ = "America/Chicago";
  const AVAIL_OFFICE_OPEN_MIN = 6 * 60; // 6:00 AM
  const AVAIL_OFFICE_CLOSE_MIN = 20 * 60; // 8:00 PM
  const minuteOfDayInBusinessTz = (d: Date) => {
    const h = parseInt(formatInTimeZone(d, AVAIL_BUSINESS_TZ, "H"), 10);
    const m = parseInt(formatInTimeZone(d, AVAIL_BUSINESS_TZ, "m"), 10);
    return h * 60 + m;
  };

  const availabilityCreateSchema = z
    .object({
      userId: z.coerce.number().int().positive().optional(),
      category: availabilityCategorySchema.optional(),
      reason: z.string().trim().min(1, "Reason is required").max(1000),
      startAt: z.coerce.date(),
      endAt: z.coerce.date(),
      allDay: z.boolean().optional(),
      displayName: z.string().max(120).nullish(),
    })
    .refine((d) => d.endAt > d.startAt, {
      message: "End time must be after start time",
      path: ["endAt"],
    });
  const availabilityUpdateSchema = z
    .object({
      category: availabilityCategorySchema.optional(),
      reason: z.string().trim().min(1, "Reason is required").max(1000).nullish(),
      startAt: z.coerce.date().optional(),
      endAt: z.coerce.date().optional(),
      allDay: z.boolean().optional(),
      displayName: z.string().max(120).nullish(),
    });

  // List availability blocks. Users see their own; admins/install_managers see
  // their whole team. Optional ?userId filter, optional ?from/?to range.
  app.get("/api/availability-blocks", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const teamIds = await getTeamUserIdsForUser(currentUser);
      let scopeIds: number[];
      if (teamIds === null) {
        // super_admin: own blocks by default; ?scope=all returns every user's
        // blocks (used by the calendar Time Off view).
        if (req.query.scope === "all") {
          const allUsers = await db.select({ id: users.id }).from(users);
          scopeIds = allUsers.map((u) => u.id);
        } else {
          scopeIds = [currentUser.id];
        }
      } else {
        scopeIds = teamIds;
      }

      // Optional single-user filter (must be within scope)
      const userIdParam = req.query.userId
        ? parseInt(String(req.query.userId))
        : null;
      if (userIdParam !== null) {
        if (!scopeIds.includes(userIdParam)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        scopeIds = [userIdParam];
      }

      const from = req.query.from ? new Date(String(req.query.from)) : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : undefined;

      const blocks = await storage.getAvailabilityBlocksForUsers(scopeIds, {
        from,
        to,
      });
      res.json(blocks);
    } catch (error) {
      console.error("Error fetching availability blocks:", error);
      res.status(500).json({ error: "Failed to fetch availability blocks" });
    }
  });

  // Create an availability block (self, or an admin for a team member)
  app.post("/api/availability-blocks", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const parsed = availabilityCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const data = parsed.data;

      // Reject past blocks and out-of-office-hours half-days (defense in depth;
      // the client guards too). Full-day blocks are compared by calendar date;
      // half-day blocks by the actual instant and business-hours window.
      if (data.allDay) {
        const dayStr = formatInTimeZone(data.startAt, AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        const endDayStr = formatInTimeZone(data.endAt, AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        const todayStr = formatInTimeZone(new Date(), AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        if (dayStr < todayStr || endDayStr < todayStr) {
          return res.status(400).json({ error: "Cannot create time off for a past date" });
        }
      } else {
        // The client strictly blocks past start times; this small grace only
        // absorbs client/server clock skew + request latency so a "now" pick
        // isn't rejected by a slightly-ahead server clock.
        if (data.startAt.getTime() < Date.now() - 60 * 1000) {
          return res.status(400).json({ error: "Cannot create time off in the past" });
        }
        const sMin = minuteOfDayInBusinessTz(data.startAt);
        const eMin = minuteOfDayInBusinessTz(data.endAt);
        if (sMin < AVAIL_OFFICE_OPEN_MIN || eMin > AVAIL_OFFICE_CLOSE_MIN) {
          return res.status(400).json({
            error: "Half-day time off must be within office hours (6:00 AM – 8:00 PM)",
          });
        }
        const startDay = formatInTimeZone(data.startAt, AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        const endDay = formatInTimeZone(data.endAt, AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        if (startDay !== endDay) {
          return res.status(400).json({
            error: "A half-day block must start and end on the same day",
          });
        }
      }

      const targetUserId = data.userId ?? currentUser.id;

      const isAdmin =
        currentUser.role === "admin" ||
        currentUser.role === "super_admin" ||
        (currentUser.role === "user" && currentUser.jobTitle === "Install Manager");

      // Authorization: must be self, or an admin acting on a team member
      if (targetUserId !== currentUser.id) {
        if (!isAdmin) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const teamIds = await getTeamUserIdsForUser(currentUser);
        if (teamIds !== null && !teamIds.includes(targetUserId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      // The display name override is a label only and can only be set by an
      // Install Manager (it never changes the underlying user account).
      let displayName: string | null = null;
      const trimmedName = data.displayName?.trim();
      if (trimmedName) {
        const isInstallManager =
          currentUser.role === "user" &&
          currentUser.jobTitle === "Install Manager";
        if (!isInstallManager) {
          return res
            .status(403)
            .json({ error: "Only an Install Manager can set the display name" });
        }
        displayName = trimmedName;
      }

      const block = await storage.createAvailabilityBlock({
        userId: targetUserId,
        createdBy: currentUser.id,
        category: data.category ?? "other",
        reason: data.reason ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: !!data.allDay,
        displayName,
      });

      await notifyAvailabilityChange(req, currentUser, targetUserId, block, "created");

      res.status(201).json(block);
    } catch (error) {
      console.error("Error creating availability block:", error);
      res.status(500).json({ error: "Failed to create availability block" });
    }
  });

  // Update an availability block (owner, or an admin over the block's user)
  app.patch("/api/availability-blocks/:id", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const id = parseInt(String(req.params.id));
      const existing = await storage.getAvailabilityBlock(id);
      if (!existing) return res.status(404).json({ error: "Block not found" });

      const isAdmin =
        currentUser.role === "admin" ||
        currentUser.role === "super_admin" ||
        (currentUser.role === "user" && currentUser.jobTitle === "Install Manager");
      if (existing.userId !== currentUser.id) {
        if (!isAdmin) return res.status(403).json({ error: "Forbidden" });
        const teamIds = await getTeamUserIdsForUser(currentUser);
        if (teamIds !== null && !teamIds.includes(existing.userId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const parsed = availabilityUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
      }
      const body = parsed.data;

      const updates: Partial<InsertAvailabilityBlock> = {};
      if (body.category !== undefined) updates.category = body.category;
      if (body.reason !== undefined) updates.reason = body.reason ?? null;
      if (body.allDay !== undefined) updates.allDay = body.allDay;
      if (body.startAt !== undefined) updates.startAt = body.startAt;
      if (body.endAt !== undefined) updates.endAt = body.endAt;
      // The displayed name on a team time-off entry can only be changed by an
      // Install Manager. It overrides the shown label without touching the
      // underlying user account.
      if (body.displayName !== undefined) {
        const isInstallManager =
          currentUser.role === "user" &&
          currentUser.jobTitle === "Install Manager";
        if (!isInstallManager) {
          return res
            .status(403)
            .json({ error: "Only an Install Manager can edit the display name" });
        }
        const trimmed = body.displayName?.trim();
        updates.displayName = trimmed ? trimmed : null;
      }
      const finalStart = updates.startAt ?? existing.startAt;
      const finalEnd = updates.endAt ?? existing.endAt;
      if (new Date(finalEnd) <= new Date(finalStart)) {
        return res.status(400).json({ error: "End time must be after start time" });
      }
      // When a half-day block's times change, keep them within office hours.
      const finalAllDay = updates.allDay ?? existing.allDay;
      if (
        (body.startAt !== undefined || body.endAt !== undefined) &&
        !finalAllDay
      ) {
        const sMin = minuteOfDayInBusinessTz(new Date(finalStart));
        const eMin = minuteOfDayInBusinessTz(new Date(finalEnd));
        if (sMin < AVAIL_OFFICE_OPEN_MIN || eMin > AVAIL_OFFICE_CLOSE_MIN) {
          return res.status(400).json({
            error: "Half-day time off must be within office hours (6:00 AM – 8:00 PM)",
          });
        }
        const startDay = formatInTimeZone(new Date(finalStart), AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        const endDay = formatInTimeZone(new Date(finalEnd), AVAIL_BUSINESS_TZ, "yyyy-MM-dd");
        if (startDay !== endDay) {
          return res.status(400).json({
            error: "A half-day block must start and end on the same day",
          });
        }
      }

      const updated = await storage.updateAvailabilityBlock(id, updates);

      await notifyAvailabilityChange(
        req,
        currentUser,
        existing.userId,
        updated || existing,
        "updated",
      );

      res.json(updated);
    } catch (error) {
      console.error("Error updating availability block:", error);
      res.status(500).json({ error: "Failed to update availability block" });
    }
  });

  // Delete an availability block (owner, or an admin over the block's user)
  app.delete("/api/availability-blocks/:id", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

      const id = parseInt(String(req.params.id));
      const existing = await storage.getAvailabilityBlock(id);
      if (!existing) return res.status(404).json({ error: "Block not found" });

      const isAdmin =
        currentUser.role === "admin" ||
        currentUser.role === "super_admin" ||
        (currentUser.role === "user" && currentUser.jobTitle === "Install Manager");
      if (existing.userId !== currentUser.id) {
        if (!isAdmin) return res.status(403).json({ error: "Forbidden" });
        const teamIds = await getTeamUserIdsForUser(currentUser);
        if (teamIds !== null && !teamIds.includes(existing.userId)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      await storage.deleteAvailabilityBlock(id);
      await notifyAvailabilityChange(
        req,
        currentUser,
        existing.userId,
        existing,
        "deleted",
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting availability block:", error);
      res.status(500).json({ error: "Failed to delete availability block" });
    }
  });

  // Set assignments for a calendar event (admin only)
  app.post("/api/calendar-events/:id/assignments", requireAdminOrInstallManager, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }

      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const { userIds } = req.body;

      if (!Array.isArray(userIds)) {
        return res.status(400).json({ error: "userIds must be an array" });
      }

      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }

      // Enforce availability blocks: reject any assignee who is unavailable
      // during the booking window (holiday, leave, meeting, personal, etc.).
      const eventStart = event.startTime
        ? new Date(event.startTime)
        : new Date(event.date);
      const eventEnd = event.endTime
        ? new Date(event.endTime)
        : new Date(eventStart.getTime() + 60 * 60 * 1000);
      const conflicts: { userId: number; name: string; reason: string }[] = [];
      for (const userId of userIds) {
        const overlapping = await storage.getOverlappingBlocksForUser(
          Number(userId),
          eventStart,
          eventEnd,
        );
        if (overlapping.length > 0) {
          const u = await storage.getUser(Number(userId));
          const b = overlapping[0];
          conflicts.push({
            userId: Number(userId),
            name: u?.name || u?.email || `User ${userId}`,
            reason: b.reason || b.category || "unavailable",
          });
        }
      }
      if (conflicts.length > 0) {
        return res.status(409).json({
          error: "availability_conflict",
          message: `Cannot assign: ${conflicts
            .map((c) => `${c.name} is unavailable (${c.reason})`)
            .join("; ")}`,
          conflicts,
        });
      }

      // Set new assignments (no email sent)
      const assignments = await storage.setEventAssignments(id, userIds);

      // Create installer notifications for assigned users (24-hour expiry)
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const now = new Date();
      for (const userId of userIds) {
        const existing = await storage.getInstallerNotificationByEventAndUser(id, userId);
        if (!existing) {
          await storage.createInstallerNotification({
            userId,
            calendarEventId: id,
            status: "pending",
            expiresAt,
          });
        } else if (existing.expiresAt <= now) {
          await storage.updateInstallerNotification(existing.id, {
            status: "pending",
            expiresAt,
          });
        }
      }

      // Return updated assignments with user info
      const updatedAssignments = await storage.getEventAssignments(id);
      res.json(updatedAssignments);
    } catch (error) {
      console.error("Error setting assignments:", error);
      res.status(500).json({ error: "Failed to set assignments" });
    }
  });

  // Send assignment notification emails to selected users (admin only)
  app.post("/api/calendar-events/:id/send-assignment-emails", requireAdminOrInstallManager, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin has view-only access to bookings" });
      }

      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const { userIds } = req.body;

      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "userIds must be a non-empty array" });
      }

      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }

      const startTime = event.startTime ? new Date(event.startTime) : new Date(event.date);
      const endTime = event.endTime ? new Date(event.endTime) : null;
      const scheduledDate = formatEST(startTime, "MMMM d, yyyy");
      const scheduledTime = endTime 
        ? `${formatEST(startTime, "h:mm a")} - ${formatEST(endTime, "h:mm a")}`
        : formatEST(startTime, "h:mm a");

      const allInstallEvents = await storage.getAllInstallEvents();
      const linkedInstallEvent = allInstallEvents.find(ie => ie.calendarEventId === id);
      let jobAddress = event.address || "";
      if (linkedInstallEvent) {
        const job = await storage.getJob(linkedInstallEvent.jobId);
        if (job?.formattedAddress) jobAddress = job.formattedAddress;
        else if (job?.address) jobAddress = `${job.address}${job.city ? `, ${job.city}` : ""}${job.state ? `, ${job.state}` : ""}`;
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const sentTo: string[] = [];
      const failed: string[] = [];

      for (const userId of userIds) {
        const user = await storage.getUser(userId);
        if (user?.email) {
          try {
            const resolved = await resolveEmailTemplate(storage, req.session.userId!, "booking_assignment", {
              userName: user.name,
              jobTitle: event.title,
              date: scheduledDate,
              time: scheduledTime,
              address: jobAddress || "",
            });

            if (!resolved.enabled) {
              failed.push(user.name + " (template disabled)");
              continue;
            }

            await sendEmailForAdmin(req.session.userId!, {
              to: user.email,
              toName: user.name,
              bcc: "info@installiq.ai",
              subject: `${resolved.subject}: ${event.title} - ${scheduledDate}`,
              html: resolved.html,
            });
            sentTo.push(user.name);
          } catch (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError);
            failed.push(user.name);
          }
        } else {
          failed.push(user?.name || `User #${userId}`);
        }
      }

      if (sentTo.length > 0) {
        logActivity(req, {
          action: "SEND_EMAIL",
          category: "Bookings",
          description: `Sent assignment email for "${event.title}" to ${sentTo.join(", ")}`,
          resourceId: id,
          resourceType: "calendar_event",
          metadata: { sentTo, failed, eventTitle: event.title },
        });
      }

      res.json({ sentTo, failed });
    } catch (error) {
      console.error("Error sending assignment emails:", error);
      res.status(500).json({ error: "Failed to send assignment emails" });
    }
  });

  // Report issue from calendar event - emails salesperson and waltham.install@fastsigns.com
  app.post("/api/calendar-events/:id/report-issue", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const { issueDescription } = req.body;
      
      const event = await storage.getCalendarEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Find linked job to get salesperson info
      const installEvents = await storage.getAllInstallEvents();
      const linkedInstallEvent = installEvents.find(ie => ie.calendarEventId === id);
      
      let job = null;
      if (linkedInstallEvent) {
        job = await storage.getJob(linkedInstallEvent.jobId);
      }
      
      // Update event status to ISSUE
      await storage.updateCalendarEvent(id, { status: "ISSUE" });
      
      // Also update the linked project with issue description if available
      if (event.projectId) {
        await storage.updateProject(event.projectId, {
          hasIssue: true,
          issueDescription: issueDescription || undefined,
        });
      }
      
      // Build email recipients - use admin's email + sales email
      const adminUser = await storage.getUser(req.session.userId!);
      const recipients: string[] = [];
      if (adminUser?.email) recipients.push(adminUser.email);
      if (job?.salesEmail) {
        recipients.push(job.salesEmail);
      }
      if (recipients.length === 0) recipients.push("info@installiq.ai");
      
      const eventDate = event.startTime 
        ? formatEST(new Date(event.startTime), "MMMM d, yyyy 'at' h:mm a")
        : formatEST(new Date(event.date), "MMMM d, yyyy");

      const issueAdminId = await resolveAdminId(storage, req.session.userId!);
      const resolved = await resolveEmailTemplate(storage, issueAdminId, "issue_reported", {
        eventTitle: event.title,
        date: eventDate,
        customerName: job?.customerName || "",
        address: job?.formattedAddress || "",
      });

      try {
        if (resolved.enabled) {
          await sendEmailForAdmin(req.session.userId!, {
            to: recipients.join(", "),
            bcc: "info@installiq.ai",
            subject: `${resolved.subject}: ${event.title}`,
            html: resolved.html,
          });
        }
        
        // Log the notification
        if (job) {
          await storage.createNotificationLog({
            type: "ISSUE",
            toEmail: recipients.join(", "),
            subject: emailSubject,
            status: "SENT",
            sentAt: new Date(),
            jobId: job.id,
          });
        }
        
        logActivity(req, {
          action: "REPORT_ISSUE",
          category: "Bookings",
          description: `Reported issue on booking "${event.title}": ${issueDescription || "No description"}`,
          resourceId: id,
          resourceType: "calendar_event",
          metadata: { eventTitle: event.title, issueDescription, emailRecipients: recipients },
        });

        res.json({ success: true, message: "Issue reported successfully", emailSent: true });
      } catch (emailError) {
        console.error("Failed to send email:", emailError);

        logActivity(req, {
          action: "REPORT_ISSUE",
          category: "Bookings",
          description: `Reported issue on booking "${event.title}" (email failed)`,
          resourceId: id,
          resourceType: "calendar_event",
          metadata: { eventTitle: event.title, issueDescription },
        });

        res.json({ success: true, message: "Issue flagged but email failed", emailSent: false });
      }
    } catch (error) {
      console.error("Error reporting issue:", error);
      res.status(500).json({ error: "Failed to report issue" });
    }
  });

  app.post("/api/calendar-events/export", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: "Not authenticated" });

      const { statuses, startDate, endDate } = req.body;

      let events: CalendarEvent[];
      if (user.role === "super_admin") {
        events = await storage.getAllCalendarEvents();
      } else {
        events = await storage.getCalendarEventsByCreator(user.id);
      }

      if (statuses && Array.isArray(statuses) && statuses.length > 0) {
        const upperStatuses = statuses.map((s: string) => s.toUpperCase());
        events = events.filter((e) => {
          const eventStatus = e.status?.toUpperCase() || "SCHEDULED";
          if (upperStatuses.includes("ISSUE") && (e.hasIssue || eventStatus === "ISSUE")) return true;
          if (upperStatuses.includes("SCHEDULED") && (!e.status || eventStatus === "SCHEDULED")) return true;
          return upperStatuses.includes(eventStatus);
        });
      }

      if (startDate && typeof startDate === "string") {
        const start = new Date(`${startDate}T00:00:00-05:00`);
        if (!isNaN(start.getTime())) {
          events = events.filter((e) => {
            const d = e.startTime ? new Date(e.startTime) : new Date(e.date);
            return d >= start;
          });
        }
      }
      if (endDate && typeof endDate === "string") {
        const end = new Date(`${endDate}T23:59:59-05:00`);
        if (!isNaN(end.getTime())) {
          events = events.filter((e) => {
            const d = e.startTime ? new Date(e.startTime) : new Date(e.date);
            return d <= end;
          });
        }
      }

      const allAssignments = await storage.getAllEventAssignments();
      const assignmentMap = new Map<number, number[]>();
      for (const a of allAssignments) {
        if (!assignmentMap.has(a.calendarEventId)) {
          assignmentMap.set(a.calendarEventId, []);
        }
        assignmentMap.get(a.calendarEventId)!.push(a.userId);
      }

      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u.name]));

      const fmtDate = (d: Date | string | null | undefined) => {
        if (!d) return "";
        const date = typeof d === "string" ? new Date(d) : d;
        return formatInTimeZone(date, "America/New_York", "MM/dd/yyyy");
      };
      const fmtTime = (d: Date | string | null | undefined) => {
        if (!d) return "";
        const date = typeof d === "string" ? new Date(d) : d;
        return formatInTimeZone(date, "America/New_York", "hh:mm a");
      };

      const ExcelJSModule = await import("exceljs");
      const ExcelJS = ExcelJSModule.default || ExcelJSModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "InstalliQ.ai";
      workbook.created = new Date();

      const eventRows = events.map((e) => {
        const assignedIds = assignmentMap.get(e.id) || [];
        const assignedNames = assignedIds.map(id => userMap.get(id) || "Unknown").join(", ");
        const status = e.hasIssue ? "ISSUE" : (e.status?.toUpperCase() || "SCHEDULED");
        const startT = fmtTime(e.startTime);
        const endT = fmtTime(e.endTime);
        const timeStr = startT && endT ? `${startT} - ${endT}` : (startT || "");
        return {
          title: e.title || "Untitled",
          status,
          date: fmtDate(e.date),
          time: timeStr,
          address: e.address || "",
          workJob: e.workJobNumber || "",
          description: e.description || "",
          jobDescription: e.jobDescription || "",
          hasIssue: e.hasIssue ? "Yes" : "No",
          issueDescription: e.issueDescription || "",
          assigned: assignedNames || "",
        };
      });

      const statusColorMap: Record<string, string> = {
        SCHEDULED: "FFE8621C",
        CONFIRMED: "FF16A34A",
        SURVEY: "FF8B5CF6",
        NEEDS_RESCHEDULE: "FF3B82F6",
        ISSUE: "FFDC2626",
        COMPLETED: "FF888888",
      };

      const columns = [
        { header: "Title", key: "title", width: 30 },
        { header: "Status", key: "status", width: 14 },
        { header: "Date", key: "date", width: 14 },
        { header: "Time", key: "time", width: 22 },
        { header: "Address", key: "address", width: 35 },
        { header: "Work/Job #", key: "workJob", width: 14 },
        { header: "Description", key: "description", width: 35 },
        { header: "Job Description", key: "jobDescription", width: 30 },
        { header: "Issue", key: "hasIssue", width: 8 },
        { header: "Issue Description", key: "issueDescription", width: 30 },
        { header: "Assigned To", key: "assigned", width: 25 },
      ];

      const sheetCategories: { name: string; filter: (row: any) => boolean }[] = [
        { name: "All Bookings", filter: () => true },
        { name: "Scheduled", filter: (r) => r.status === "SCHEDULED" },
        { name: "Confirmed", filter: (r) => r.status === "CONFIRMED" },
        { name: "Survey", filter: (r) => r.status === "SURVEY" },
        { name: "Reschedule", filter: (r) => r.status === "NEEDS_RESCHEDULE" },
        { name: "Issues", filter: (r) => r.status === "ISSUE" || r.hasIssue === "Yes" },
        { name: "Completed", filter: (r) => r.status === "COMPLETED" },
      ];

      const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF333333" } };
      const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      const headerBorder = {
        bottom: { style: "medium" as const, color: { argb: "FFE8621C" } },
      };
      const altFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF5F5F5" } };
      const dataFont = { size: 10, name: "Calibri", color: { argb: "FF333333" } };
      const dataBorder = {
        bottom: { style: "thin" as const, color: { argb: "FFE8E8E8" } },
      };

      for (const category of sheetCategories) {
        const filtered = eventRows.filter(category.filter);
        const sheet = workbook.addWorksheet(category.name, {
          properties: { tabColor: { argb: category.name === "All Bookings" ? "FFE8621C" : (statusColorMap[category.name.toUpperCase()] || "FF888888") } },
        });

        sheet.mergeCells("A1", `K1`);
        const titleCell = sheet.getCell("A1");
        titleCell.value = `${category.name} — ${filtered.length} booking(s)`;
        titleCell.font = { bold: true, size: 14, name: "Calibri", color: { argb: "FFE8621C" } };
        titleCell.alignment = { vertical: "middle" };
        sheet.getRow(1).height = 30;

        sheet.mergeCells("A2", `K2`);
        const subCell = sheet.getCell("A2");
        subCell.value = `Generated: ${formatInTimeZone(new Date(), "America/New_York", "MMMM d, yyyy 'at' h:mm a")}`;
        subCell.font = { size: 9, name: "Calibri", color: { argb: "FF888888" }, italic: true };
        sheet.getRow(2).height = 18;

        const headerRow = sheet.getRow(4);
        columns.forEach((col, idx) => {
          const cell = headerRow.getCell(idx + 1);
          cell.value = col.header;
          cell.fill = headerFill;
          cell.font = headerFont;
          cell.border = headerBorder;
          cell.alignment = { vertical: "middle", horizontal: "left" };
        });
        headerRow.height = 24;

        columns.forEach((col, idx) => {
          sheet.getColumn(idx + 1).width = col.width;
        });

        filtered.forEach((row, ri) => {
          const excelRow = sheet.getRow(ri + 5);
          columns.forEach((col, ci) => {
            const cell = excelRow.getCell(ci + 1);
            cell.value = (row as any)[col.key] || "";
            cell.font = dataFont;
            cell.border = dataBorder;
            cell.alignment = { vertical: "middle", wrapText: col.key === "address" || col.key === "description" || col.key === "jobDescription" || col.key === "issueDescription" };

            if (col.key === "status") {
              const sColor = statusColorMap[row.status] || "FF888888";
              cell.font = { ...dataFont, bold: true, color: { argb: sColor } };
            }
          });

          if (ri % 2 === 1) {
            excelRow.eachCell({ includeEmpty: true }, (cell) => {
              cell.fill = altFill;
            });
          }
          excelRow.height = 20;
        });

        sheet.autoFilter = {
          from: { row: 4, column: 1 },
          to: { row: 4 + filtered.length, column: columns.length },
        };

        sheet.views = [{ state: "frozen", ySplit: 4 }];
      }

      const xlsxBuffer = await workbook.xlsx.writeBuffer();

      logActivity(req, {
        action: "EXPORT",
        category: "Bookings",
        description: `Exported ${events.length} calendar event(s) to Excel`,
        resourceType: "calendar_event",
        metadata: { eventCount: events.length, statuses, startDate, endDate },
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="bookings-export-${format(new Date(), "yyyy-MM-dd")}.xlsx"`);
      res.send(Buffer.from(xlsxBuffer as ArrayBuffer));
    } catch (error) {
      console.error("Error exporting calendar events:", error);
      res.status(500).json({ error: "Failed to export calendar events" });
    }
  });

  app.delete("/api/calendar-events/:id", requireAdminOrInstallManager, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Not authenticated" });

      const event = await storage.getCalendarEvent(id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (currentUser.role === "super_admin") {
        return res.status(403).json({ error: "Super Admin cannot delete bookings" });
      }

      const isInstallManager = currentUser.role === "user" && currentUser.jobTitle === "Install Manager";
      if (event.createdBy !== currentUser.id && currentUser.role !== "admin" && !isInstallManager) {
        return res.status(403).json({ error: "Only the creator or admin can delete this booking" });
      }

      await storage.deleteCalendarEvent(id);
      logActivity(req, {
        action: "DELETE_BOOKING",
        category: "Bookings",
        description: `Deleted booking: ${event.title}`,
        resourceId: id,
        resourceType: "calendar_event",
        metadata: { title: event.title, date: event.date },
      });
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ error: "Failed to delete calendar event" });
    }
  });

  // ===== Weather and Geocoding Routes =====

  // Get weather for a specific location and time
  app.get("/api/weather", requireAuth, async (req, res) => {
    try {
      const { lat, lng, time, projectId } = req.query;

      let latitude: string;
      let longitude: string;
      let targetTime: Date | undefined;

      // If projectId is provided, get lat/lng from the project
      if (projectId) {
        const project = await storage.getProject(parseInt(projectId as string));
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (!project.latitude || !project.longitude) {
          return res.status(400).json({ error: "Project has no location data" });
        }
        latitude = project.latitude;
        longitude = project.longitude;
      } else if (lat && lng) {
        latitude = lat as string;
        longitude = lng as string;
      } else {
        return res.status(400).json({ error: "Either projectId or lat/lng are required" });
      }

      if (time) {
        targetTime = new Date(time as string);
      }

      const weather = await getWeatherForLocation(latitude, longitude, targetTime);
      res.json(weather);
    } catch (error) {
      console.error("Error fetching weather:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  // Get 5-day forecast for a location
  app.get("/api/weather/forecast", requireAuth, async (req, res) => {
    try {
      const { lat, lng, eventDate, address } = req.query;

      let latitude: string;
      let longitude: string;

      // If address is provided, geocode it first
      if (address) {
        const geoResult = await geocodeAddress(address as string);
        if (!geoResult) {
          return res.status(400).json({ error: "Could not geocode address" });
        }
        latitude = geoResult.lat;
        longitude = geoResult.lng;
      } else if (lat && lng) {
        latitude = lat as string;
        longitude = lng as string;
      } else {
        return res.status(400).json({ error: "Either address or lat/lng are required" });
      }

      // Validate eventDate if provided
      let targetDate: Date | undefined;
      if (eventDate) {
        const parsedDate = new Date(eventDate as string);
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: "Invalid eventDate format" });
        }
        targetDate = parsedDate;
      }
      
      const forecast = await get5DayForecast(latitude, longitude, targetDate);
      res.json(forecast);
    } catch (error) {
      console.error("Error fetching forecast:", error);
      res.status(500).json({ error: "Failed to fetch forecast data" });
    }
  });

  // Get current weather + 7-day forecast for FASTSIGNS Waltham default location
  app.get("/api/weather/default-location", requireAuth, async (req, res) => {
    try {
      // FASTSIGNS of Waltham, MA coordinates
      const lat = "42.3765";
      const lng = "-71.2356";

      const [currentWeather, forecast] = await Promise.all([
        getWeatherForLocation(lat, lng),
        get5DayForecast(lat, lng),
      ]);

      res.json({
        location: "Waltham, MA",
        current: currentWeather,
        forecast: forecast.fiveDayForecast,
      });
    } catch (error) {
      console.error("Error fetching default location weather:", error);
      res.status(500).json({ error: "Failed to fetch weather data" });
    }
  });

  // Geocode an address
  app.post("/api/geocode", requireAuth, async (req, res) => {
    try {
      const { address } = req.body;
      
      if (!address) {
        return res.status(400).json({ error: "Address is required" });
      }

      const result = await geocodeAddress(address);
      
      if (!result) {
        return res.status(404).json({ error: "Could not geocode address" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error geocoding address:", error);
      res.status(500).json({ error: "Failed to geocode address" });
    }
  });

  const updateProjectSchema = z.object({
    jobLabel: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),
    customerEmail: z.string().optional(),
    issueDescription: z.string().optional(),
    notes: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    imageUrls: z.array(z.string()).optional(),
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const isInstallManager = user?.role === "user" && user?.jobTitle === "Install Manager";
      const isAdminLike = !!user && (user.role === "admin" || user.role === "super_admin" || isInstallManager);

      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Project creator may also edit (e.g., to update the Job Label on their own project).
      const isCreator = !!user && project.userId === user.id;
      if (!isAdminLike && !isCreator) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }

      const { jobLabel, description, tags, customerName, customerPhone, customerEmail, address, city, state, postalCode, issueDescription, notes, imageUrls } = parsed.data;

      const updateData: Record<string, any> = {};
      if (jobLabel !== undefined) updateData.jobLabel = jobLabel;
      if (description !== undefined) updateData.description = description;
      if (tags !== undefined) updateData.tags = tags;
      if (customerName !== undefined) updateData.customerName = customerName;
      if (customerPhone !== undefined) updateData.customerPhone = customerPhone;
      if (customerEmail !== undefined) updateData.customerEmail = customerEmail;
      if (issueDescription !== undefined) updateData.issueDescription = issueDescription;
      if (notes !== undefined) updateData.notes = notes;
      if (imageUrls !== undefined) {
        updateData.imageUrls = imageUrls;
        updateData.hasFinishedPhotos = imageUrls.length > 0;
      }
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (postalCode !== undefined) updateData.postalCode = postalCode;

      if (address !== undefined || city !== undefined || state !== undefined || postalCode !== undefined) {
        const fullAddress = [
          address ?? project.address,
          city ?? project.city,
          state ?? project.state,
          postalCode ?? project.postalCode
        ].filter(Boolean).join(", ");
        if (fullAddress) {
          const geocoded = await geocodeAddress(fullAddress);
          if (geocoded) {
            updateData.latitude = geocoded.lat;
            updateData.longitude = geocoded.lng;
          }
        }
      }

      const updated = await storage.updateProject(id, updateData);

      logActivity(req, {
        action: "UPDATE_PROJECT",
        category: "Projects",
        description: `Updated project: ${project.jobLabel || `#${id}`}`,
        resourceId: id,
        resourceType: "project",
        metadata: { jobLabel: project.jobLabel, updatedFields: Object.keys(updateData) },
      });

      res.json(updated);

      // Sync metadata updates to existing installiq assets (fire-and-forget, no new inserts needed)
      // Use project owner's userId (updated.userId) so super_admin edits target the correct tenant
      getAdminIdForUserId(updated?.userId ?? req.session.userId!).then(adminId => {
        if (!adminId || !updated) return;
        const fileUrls = updated.imageUrls ?? [];
        if (fileUrls.length === 0) return;
        const allTags = [...new Set([...(updated.tags ?? []), ...(updated.aiSuggestedTags ?? [])])];
        const projectAddress = [updated.address, updated.city, updated.state, updated.postalCode].filter(Boolean).join(", ") || null;
        return bulkUpdateInstalliqAssetMeta(adminId, fileUrls, {
          title: updated.jobLabel ?? null,
          description: updated.description ?? null,
          tags: allTags,
          projectName: updated.jobLabel ?? null,
          projectAddress,
          customerName: updated.customerName ?? null,
          customerPhone: updated.customerPhone ?? null,
          customerEmail: updated.customerEmail ?? null,
        });
      }).catch(err => console.warn("[Asset Sync] Project PATCH sync failed:", err));
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.post("/api/projects/:id/images", requireAuth, upload.array("images", 50), async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const isInstallManager = user?.role === "user" && user?.jobTitle === "Install Manager";
      if (!user || (user.role !== "admin" && user.role !== "super_admin" && !isInstallManager)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        return res.status(400).json({ error: "No images provided" });
      }

      const newUrls: string[] = [];
      for (const file of files) {
        const objUrl = await uploadFileToObjectStorage(file.path, file.filename, file.mimetype);
        newUrls.push(objUrl);
      }
      const existingUrls = project.imageUrls || [];
      const allUrls = [...existingUrls, ...newUrls];

      const updated = await storage.updateProject(id, {
        imageUrls: allUrls,
        hasFinishedPhotos: true,
      });

      res.json(updated);

      // Sync new images to Asset Manager (fire-and-forget)
      // Resolve admin from project owner (updated.userId) so super_admin uploads target the correct tenant
      const uploaderId = user.id;
      getAdminIdForUserId(updated?.userId ?? user.id).then(adminId => {
        if (adminId && updated) {
          return syncProjectToAssets(updated, adminId, uploaderId);
        }
      }).catch(err => console.warn("[Asset Sync] Photo upload sync failed:", err));
    } catch (error) {
      console.error("Error uploading project images:", error);
      res.status(500).json({ error: "Failed to upload images" });
    }
  });

  // Update project with address and geocoded location
  app.patch("/api/projects/:id/location", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const { address, city, state, postalCode, customerName, customerPhone } = req.body;

      const project = await storage.getProject(id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Build full address for geocoding
      const fullAddress = [address, city, state, postalCode].filter(Boolean).join(", ");
      
      let latitude: string | undefined;
      let longitude: string | undefined;

      if (fullAddress) {
        const geocoded = await geocodeAddress(fullAddress);
        if (geocoded) {
          latitude = geocoded.lat;
          longitude = geocoded.lng;
        }
      }

      const updateData: Record<string, any> = {};
      if (address !== undefined) updateData.address = address;
      if (city !== undefined) updateData.city = city;
      if (state !== undefined) updateData.state = state;
      if (postalCode !== undefined) updateData.postalCode = postalCode;
      if (latitude !== undefined) updateData.latitude = latitude;
      if (longitude !== undefined) updateData.longitude = longitude;
      if (customerName !== undefined) updateData.customerName = customerName;
      if (customerPhone !== undefined) updateData.customerPhone = customerPhone;

      const updated = await storage.updateProject(id, updateData);

      res.json(updated);

      // Sync location/customer metadata updates to existing installiq assets (fire-and-forget, no new inserts needed)
      // Use project owner's userId so super_admin edits target the correct tenant
      getAdminIdForUserId(updated?.userId ?? req.session.userId!).then(adminId => {
        if (!adminId || !updated) return;
        const fileUrls = updated.imageUrls ?? [];
        if (fileUrls.length === 0) return;
        const allTags = [...new Set([...(updated.tags ?? []), ...(updated.aiSuggestedTags ?? [])])];
        const projectAddress = [updated.address, updated.city, updated.state, updated.postalCode].filter(Boolean).join(", ") || null;
        return bulkUpdateInstalliqAssetMeta(adminId, fileUrls, {
          title: updated.jobLabel ?? null,
          description: updated.description ?? null,
          tags: allTags,
          projectName: updated.jobLabel ?? null,
          projectAddress,
          customerName: updated.customerName ?? null,
          customerPhone: updated.customerPhone ?? null,
          customerEmail: updated.customerEmail ?? null,
        });
      }).catch(err => console.warn("[Asset Sync] Project location PATCH sync failed:", err));
    } catch (error) {
      console.error("Error updating project location:", error);
      res.status(500).json({ error: "Failed to update project location" });
    }
  });

  // ===== Booking Confirmation Endpoint (public - accessed from email) =====
  app.get("/api/confirm-booking/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(400).json({ error: "Invalid confirmation token" });
      }

      const event = await storage.getCalendarEventByConfirmationToken(token);

      if (!event) {
        return res.status(404).json({ error: "Booking not found or already confirmed" });
      }

      const eventPayload = {
        title: event.title,
        date: event.date,
        startTime: event.startTime,
        endTime: event.endTime,
        workJobNumber: event.workJobNumber,
        address: event.address || "",
        description: event.description || "",
      };

      if (event.status === "CONFIRMED") {
        return res.json({
          success: true,
          alreadyConfirmed: true,
          event: eventPayload,
          calendarInviteSent: false,
          message: "This booking has already been confirmed."
        });
      }

      await storage.updateCalendarEvent(event.id, {
        status: "CONFIRMED",
      });

      res.json({
        success: true,
        alreadyConfirmed: false,
        event: eventPayload,
        message: "Your booking has been confirmed. Use the button below to save it to your calendar."
      });
    } catch (error) {
      console.error("Error confirming booking:", error);
      res.status(500).json({ error: "Failed to confirm booking" });
    }
  });

  app.get("/api/booking-calendar/:token", async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length < 32) {
        return res.status(400).send("Invalid token");
      }

      const event = await storage.getCalendarEventByConfirmationToken(token);
      if (!event) {
        return res.status(404).send("Booking not found");
      }

      if (event.status !== "CONFIRMED") {
        return res.status(400).send("Booking has not been confirmed yet");
      }

      const fmtICSET = (d: Date | string | null) => {
        if (!d) return "";
        const date = typeof d === "string" ? new Date(d) : d;
        return formatInTimeZone(date, "America/New_York", "yyyyMMdd'T'HHmmss");
      };

      const start = fmtICSET(event.startTime || event.date);
      const end = fmtICSET(event.endTime || event.startTime || event.date);
      const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const uid = `fieldproof-${event.id}-${token.substring(0, 8)}@fastsigns-waltham`;

      const descLines: string[] = [];
      if (event.workJobNumber) descLines.push(`Job: ${event.workJobNumber}`);
      if (event.address) descLines.push(`Location: ${event.address}`);
      descLines.push("FASTSIGNS of Waltham Installation");
      descLines.push("Contact: waltham.install@fastsigns.com | (781) 894-4000");

      const escapeICS = (text: string) => text.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

      const ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FASTSIGNS Waltham//InstalliQ.ai//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VTIMEZONE",
        "TZID:America/New_York",
        "BEGIN:STANDARD",
        "DTSTART:19701101T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "TZNAME:EST",
        "END:STANDARD",
        "BEGIN:DAYLIGHT",
        "DTSTART:19700308T020000",
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
        "TZOFFSETFROM:-0500",
        "TZOFFSETTO:-0400",
        "TZNAME:EDT",
        "END:DAYLIGHT",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=America/New_York:${start}`,
        `DTEND;TZID=America/New_York:${end}`,
        `SUMMARY:${escapeICS(event.title)}`,
        `DESCRIPTION:${escapeICS(descLines.join("\\n"))}`,
        ...(event.address ? [`LOCATION:${escapeICS(event.address)}`] : []),
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="installation-booking.ics"`);
      res.send(ics);
    } catch (error) {
      console.error("Error generating calendar file:", error);
      res.status(500).send("Failed to generate calendar file");
    }
  });

  // ===== Email Notification Endpoint =====
  app.post("/api/notifications/send-schedule-confirmation", requireAuth, async (req, res) => {
    try {
      const { jobId, calendarEventId, customerEmail, customerName, scheduledDate, scheduledTime, address } = req.body;
      
      if (!customerEmail) {
        return res.status(400).json({ error: "Customer email is required" });
      }

      let confirmationUrl: string | undefined;
      let rescheduleUrl: string | undefined;

      if (calendarEventId) {
        const calEvent = await storage.getCalendarEvent(calendarEventId);
        if (calEvent) {
          let token = calEvent.confirmationToken;
          if (!token) {
            token = randomBytes(32).toString("hex");
            await storage.updateCalendarEvent(calEvent.id, { confirmationToken: token });
          }
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          confirmationUrl = `${baseUrl}/confirm-booking/${token}`;
          rescheduleUrl = `${baseUrl}/reschedule-booking/${token}`;
        }
      }

      const adminId = req.session.userId!;
      const resolved = await resolveEmailTemplate(storage, adminId, "schedule_confirmation", {
        customerName: customerName || "Valued Customer",
        date: scheduledDate,
        time: scheduledTime,
        address: address || "See work order for address",
      });

      if (!resolved.enabled) {
        return res.json({ success: true, message: "Email template is disabled, skipped sending." });
      }

      const finalSubject = `${resolved.subject} - ${scheduledDate}`;

      // Always use the full branded template which includes Confirm / Reschedule buttons
      const emailHtml = emailTemplates.scheduleConfirmation({
        customerName: customerName || "Valued Customer",
        scheduledDate,
        scheduledTime,
        address: address || "See work order for address",
        confirmationUrl,
        rescheduleUrl,
      });

      await sendEmailForAdmin(adminId, {
        to: customerEmail,
        toName: customerName || null,
        bcc: "info@installiq.ai",
        subject: finalSubject,
        html: emailHtml,
      });

      if (jobId) {
        await storage.createNotificationLog({
          type: "SCHEDULE_CONFIRMATION",
          toEmail: customerEmail,
          ccEmails: "info@installiq.ai",
          subject: finalSubject,
          status: "SENT",
          sentAt: new Date(),
          jobId,
          eventId: null,
        });
      }

      logActivity(req, {
        action: "SEND_EMAIL",
        category: "Bookings",
        description: `Sent schedule confirmation email to ${customerName || customerEmail} for ${scheduledDate}`,
        resourceId: calendarEventId || jobId,
        resourceType: calendarEventId ? "calendar_event" : "job",
        metadata: { customerEmail, customerName, scheduledDate, scheduledTime },
      });

      res.json({ 
        success: true, 
        message: `Confirmation email sent to ${customerEmail}` 
      });
    } catch (error) {
      console.error("Error sending schedule confirmation:", error);
      res.status(500).json({ error: "Failed to send confirmation email" });
    }
  });

  // ===== Reschedule Booking Endpoint (public - accessed from email) =====
  app.get("/api/reschedule-booking/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || token.length < 32) {
        return res.status(400).json({ error: "Invalid token" });
      }

      const event = await storage.getCalendarEventByConfirmationToken(token);

      if (!event) {
        return res.status(404).json({ error: "Booking not found" });
      }

      res.json({
        success: true,
        event: {
          id: event.id,
          title: event.title,
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          address: event.address,
          workJobNumber: event.workJobNumber,
          status: event.status,
        },
      });
    } catch (error) {
      console.error("Error fetching booking for reschedule:", error);
      res.status(500).json({ error: "Failed to fetch booking details" });
    }
  });

  app.post("/api/reschedule-booking/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { customerName, customerEmail, customerPhone, reason } = req.body;

      if (!token || token.length < 32) {
        return res.status(400).json({ error: "Invalid token" });
      }

      if (!customerName || !reason) {
        return res.status(400).json({ error: "Name and reason are required" });
      }

      const event = await storage.getCalendarEventByConfirmationToken(token);

      if (!event) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const rescheduleRequest = await storage.createRescheduleRequest({
        calendarEventId: event.id,
        confirmationToken: token,
        customerName,
        customerEmail: customerEmail || null,
        customerPhone: customerPhone || null,
        reason,
        status: "pending",
      });

      logActivity(req, {
        action: "RESCHEDULE_REQUESTED",
        category: "Bookings",
        description: `Reschedule requested by ${customerName} for event #${event.id}: ${reason}`,
        resourceId: event.id,
        resourceType: "calendar_event",
        metadata: { customerName, customerEmail, reason, eventTitle: event.title },
        overrideName: customerName,
        overrideEmail: customerEmail || undefined,
      });

      res.json({
        success: true,
        message: "Your reschedule request has been submitted. Our team will contact you shortly.",
        rescheduleRequest,
      });
    } catch (error) {
      console.error("Error processing reschedule request:", error);
      res.status(500).json({ error: "Failed to submit reschedule request" });
    }
  });

  // ===== Reschedule Requests Admin Endpoints =====
  app.patch("/api/reschedule-requests/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const id = parseInt(req.params.id as string);
      const { status } = req.body;
      if (!status) {
        return res.status(400).json({ error: "Status is required" });
      }

      const request = await storage.getRescheduleRequestById(id);
      if (!request) {
        return res.status(404).json({ error: "Reschedule request not found" });
      }

      if (user.role !== "super_admin") {
        const event = await storage.getCalendarEvent(request.calendarEventId);
        if (!event || event.createdBy !== user.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const updated = await storage.updateRescheduleRequest(id, { status });
      if (!updated) {
        return res.status(404).json({ error: "Reschedule request not found" });
      }

      logActivity(req, {
        action: "RESCHEDULE_RESPONSE",
        category: "Bookings",
        description: `${status === "approved" ? "Approved" : "Denied"} reschedule request from ${request.customerName}`,
        resourceId: request.calendarEventId,
        resourceType: "calendar_event",
        metadata: { status, customerName: request.customerName, reason: request.reason },
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating reschedule request:", error);
      res.status(500).json({ error: "Failed to update reschedule request" });
    }
  });

  app.get("/api/reschedule-requests", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const includeArchived = req.query.archived === "true";
      const archivedOnly = req.query.archived === "only";
      const requests = await storage.getAllRescheduleRequests(includeArchived || archivedOnly);

      const enriched = await Promise.all(
        requests.map(async (r) => {
          const event = await storage.getCalendarEvent(r.calendarEventId);
          return {
            ...r,
            calendarEvent: event || null,
          };
        })
      );

      let results = enriched;
      if (user.role !== "super_admin") {
        results = results.filter(
          (r) => r.calendarEvent && r.calendarEvent.createdBy === user.id
        );
      }

      if (archivedOnly) {
        results = results.filter((r) => r.archivedAt !== null);
      }

      res.json(results);
    } catch (error) {
      console.error("Error fetching reschedule requests:", error);
      res.status(500).json({ error: "Failed to fetch reschedule requests" });
    }
  });

  app.post("/api/reschedule-requests/archive", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      if (user.role !== "super_admin") {
        for (const id of ids) {
          const request = await storage.getRescheduleRequestById(id);
          if (!request) continue;
          const event = await storage.getCalendarEvent(request.calendarEventId);
          if (!event || event.createdBy !== user.id) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
      }
      await storage.archiveRescheduleRequests(ids);
      res.json({ success: true });
    } catch (error) {
      console.error("Error archiving reschedule requests:", error);
      res.status(500).json({ error: "Failed to archive reschedule requests" });
    }
  });

  // Permanently delete archived reschedule requests (single or bulk).
  // Only requests already in the archive (archived_at IS NOT NULL) can be hard-deleted.
  app.post("/api/reschedule-requests/permanent-delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const rawIds = (req.body && (req.body as any).ids) as unknown;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      const ids = rawIds
        .map((v: any) => parseInt(String(v), 10))
        .filter((n: number) => Number.isFinite(n));
      if (ids.length === 0) {
        return res.status(400).json({ error: "No valid ids provided" });
      }

      // Per-tenant ownership check (mirrors archive/restore endpoints).
      if (user.role !== "super_admin") {
        for (const id of ids) {
          const request = await storage.getRescheduleRequestById(id);
          if (!request) continue;
          const event = await storage.getCalendarEvent(request.calendarEventId);
          if (!event || event.createdBy !== user.id) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
      }

      await storage.permanentDeleteRescheduleRequests(ids);
      res.json({ success: true, deleted: ids.length });
    } catch (error) {
      console.error("Error permanently deleting reschedule requests:", error);
      res.status(500).json({ error: "Failed to permanently delete reschedule requests" });
    }
  });

  app.post("/api/reschedule-requests/restore", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      if (user.role !== "super_admin") {
        for (const id of ids) {
          const request = await storage.getRescheduleRequestById(id);
          if (!request) continue;
          const event = await storage.getCalendarEvent(request.calendarEventId);
          if (!event || event.createdBy !== user.id) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
      }
      await storage.restoreRescheduleRequests(ids);
      res.json({ success: true });
    } catch (error) {
      console.error("Error restoring reschedule requests:", error);
      res.status(500).json({ error: "Failed to restore reschedule requests" });
    }
  });

  // ===== Installer Notifications =====
  app.get("/api/installer-notifications", requireAuth, async (req, res) => {
    try {
      // Clean up expired notifications
      await storage.deleteExpiredInstallerNotifications();
      
      const notifications = await storage.getInstallerNotificationsForUser(req.session.userId!);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching installer notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.get("/api/installer-notifications/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const notification = await storage.getInstallerNotification(id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (notification.userId !== req.session.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error fetching installer notification:", error);
      res.status(500).json({ error: "Failed to fetch notification" });
    }
  });

  app.patch("/api/installer-notifications/:id", requireAuth, async (req, res) => {
    try {
      const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const id = parseInt(idParam);
      const notification = await storage.getInstallerNotification(id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      if (notification.userId !== req.session.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { status, onMyWayAt, readAt } = req.body;
      const allowedStatuses = ["pending", "on_my_way", "completed"];
      const updateData: any = {};
      if (status) {
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({ error: "Invalid status" });
        }
        updateData.status = status;
      }
      if (onMyWayAt) updateData.onMyWayAt = new Date(onMyWayAt);
      if (readAt) updateData.readAt = new Date(readAt);
      const updated = await storage.updateInstallerNotification(id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating installer notification:", error);
      res.status(500).json({ error: "Failed to update notification" });
    }
  });

  app.get("/api/calendar-filter-colors", requireAuth, async (req, res) => {
    try {
      const colors = await storage.getCalendarFilterColors();
      const colorMap: Record<string, string> = {};
      for (const c of colors) {
        colorMap[c.statusKey] = c.color;
      }
      res.setHeader("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
      res.json(colorMap);
    } catch (error) {
      console.error("Error fetching filter colors:", error);
      res.status(500).json({ error: "Failed to fetch filter colors" });
    }
  });

  app.patch("/api/calendar-filter-colors/:statusKey", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ error: "Only Super Admin can change filter colors" });
      }
      const statusKey = req.params.statusKey as string;
      const { color } = req.body;
      if (!color || typeof color !== "string") {
        return res.status(400).json({ error: "Color is required" });
      }
      const validKeys = ["SCHEDULED", "CONFIRMED", "NEEDS_RESCHEDULE", "ISSUE", "COMPLETED", "SURVEY", "TIMEOFF"];
      if (!validKeys.includes(statusKey)) {
        return res.status(400).json({ error: "Invalid status key" });
      }
      const updated = await storage.updateCalendarFilterColor(statusKey, color);
      res.json(updated);
    } catch (error) {
      console.error("Error updating filter color:", error);
      res.status(500).json({ error: "Failed to update filter color" });
    }
  });

  // Job Timers - On My Way feature
  app.get("/api/job-timers/:calendarEventId", requireAuth, async (req, res) => {
    try {
      const calendarEventId = parseInt(req.params.calendarEventId);
      const userId = (req as any).session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const timer = await storage.getJobTimer(calendarEventId, userId);
      const allTimers = await storage.getJobTimersByEvent(calendarEventId);
      const userTimers = allTimers.filter((t: any) => t.userId === userId);
      const userTotalSeconds = userTimers
        .filter((t: any) => t.status === "completed" && t.totalSeconds)
        .reduce((sum: number, t: any) => sum + t.totalSeconds, 0);
      const eventTotalSeconds = allTimers
        .filter((t: any) => t.status === "completed" && t.totalSeconds)
        .reduce((sum: number, t: any) => sum + t.totalSeconds, 0);
      const activeUserIds = allTimers
        .filter((t: any) => t.status === "active")
        .map((t: any) => t.userId);
      res.json({ timer, allTimers: userTimers, totalSeconds: userTotalSeconds, eventTotalSeconds, activeUserIds });
    } catch (error) {
      console.error("Error fetching job timer:", error);
      res.status(500).json({ error: "Failed to fetch job timer" });
    }
  });

  app.post("/api/job-timers/:calendarEventId/start", requireAuth, async (req, res) => {
    try {
      const calendarEventId = parseInt(req.params.calendarEventId);
      const userId = (req as any).session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const existing = await storage.getJobTimer(calendarEventId, userId);
      if (existing && existing.status === "active") {
        return res.status(400).json({ error: "Timer already running" });
      }
      const timer = await storage.startJobTimer(calendarEventId, userId);

      // Update event status to CONFIRMED (Expected → Marked) - only for SCHEDULED events
      let calEvent: any = null;
      try {
        calEvent = await storage.getCalendarEvent(calendarEventId);
        if (calEvent && (!calEvent.status || calEvent.status === "SCHEDULED")) {
          await storage.updateCalendarEvent(calendarEventId, { status: "CONFIRMED" });
          console.log(`Event ${calendarEventId} status updated to CONFIRMED (On My Way)`);
        }
      } catch (statusError) {
        console.error("Failed to update event status:", statusError);
      }

      // Auto-add the user to calendar event assignments if not already there
      // so they appear in the Assigned Users section of the Install Calendar
      try {
        const currentAssignments = await storage.getEventAssignments(calendarEventId);
        const alreadyAssigned = currentAssignments.some((a: any) => a.userId === userId);
        if (!alreadyAssigned) {
          const existingUserIds = currentAssignments.map((a: any) => a.userId);
          await storage.setEventAssignments(calendarEventId, [...existingUserIds, userId]);
          console.log(`Auto-assigned user ${userId} to event ${calendarEventId} via On My Way`);
        }
      } catch (assignError) {
        console.error("Failed to auto-assign user on timer start:", assignError);
      }

      // Send "On My Way" notification email to customer
      try {
        if (!calEvent) calEvent = await storage.getCalendarEvent(calendarEventId);
        const user = await storage.getUser(userId);
        if (calEvent) {
          const jobDetails = calEvent.workJobNumber ? await storage.getJobByWorkOrderNumber(calEvent.workJobNumber.replace("WJ-", "")) : null;
          const customerEmail = jobDetails?.customerEmail || (calEvent as any).customerEmail || null;
          const customerName = jobDetails?.customerName || (calEvent as any).customerName || "Customer";
          const installerName = user?.name || "Installer";
          const eventTitle = calEvent.title || "Installation";
          const eventDate = calEvent.startTime ? formatEST(calEvent.startTime, "MMMM d, yyyy") : formatEST(calEvent.date, "MMMM d, yyyy");
          const eventTime = calEvent.startTime ? formatEST(calEvent.startTime, "h:mm a") : "";
          const eventAddress = (calEvent as any).address || jobDetails?.address || "";

          console.log(`[On My Way] Event ${calendarEventId}: customerEmail=${customerEmail}, customerName=${customerName}, jobDetails found=${!!jobDetails}`);
          if (customerEmail) {
            const ownerAdminId = await resolveAdminId(storage, req.session.userId!);
            const resolved = await resolveEmailTemplate(storage, ownerAdminId, "on_my_way", {
              customerName,
              installerName,
              jobTitle: eventTitle,
              date: eventDate,
              time: eventTime || "",
              address: eventAddress || "",
            });

            if (resolved.enabled) {
              await sendEmailForAdmin(req.session.userId!, {
                to: customerEmail,
                toName: customerName || null,
                bcc: "info@installiq.ai",
                subject: `${resolved.subject} - ${eventTitle}`,
                html: resolved.html,
              });
              console.log(`On My Way notification sent to ${customerEmail}`);
            }
          }
        }
      } catch (emailError) {
        console.error("Failed to send On My Way notification:", emailError);
      }

      res.json(timer);
    } catch (error) {
      console.error("Error starting job timer:", error);
      res.status(500).json({ error: "Failed to start timer" });
    }
  });

  app.post("/api/job-timers/:calendarEventId/stop", requireAuth, async (req, res) => {
    try {
      const calendarEventId = parseInt(req.params.calendarEventId);
      const userId = (req as any).session?.userId;
      if (!userId) return res.status(401).json({ error: "Not authenticated" });
      const timer = await storage.stopJobTimer(calendarEventId, userId);
      if (!timer) return res.status(404).json({ error: "No active timer found" });
      res.json(timer);
    } catch (error) {
      console.error("Error stopping job timer:", error);
      res.status(500).json({ error: "Failed to stop timer" });
    }
  });

  // ===== Assistant Settings API Endpoints =====

  async function getAssistantTargetUser(req: Request): Promise<{ user: any; error?: string; status?: number }> {
    const currentUser = await storage.getUser(req.session.userId!);
    if (!currentUser) return { user: null, error: "Not authenticated", status: 403 };

    const adminId = req.params.adminId;
    if (adminId) {
      if (currentUser.role !== "super_admin") {
        return { user: null, error: "Super admin access required", status: 403 };
      }
      const targetAdmin = await storage.getUser(parseInt(adminId));
      if (!targetAdmin || targetAdmin.role !== "admin") {
        return { user: null, error: "Admin not found", status: 404 };
      }
      return { user: targetAdmin };
    }
    if (currentUser.role !== "admin" && currentUser.role !== "super_admin") {
      return { user: null, error: "Admin access required", status: 403 };
    }
    return { user: currentUser };
  }

  const handleGetAssistantSettings = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      const assistantId = user.openaiAssistantId;
      if (!assistantId) {
        return res.json({ hasAssistant: false, instructions: null, files: [] });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      let assistant = await openai.beta.assistants.retrieve(assistantId);

      let vectorStoreIds = assistant.tool_resources?.file_search?.vector_store_ids || [];
      if (vectorStoreIds.length === 0) {
        const masterAssistantId = process.env.OPENAI_ASSISTANT_ID;
        if (masterAssistantId) {
          try {
            const masterAssistant = await openai.beta.assistants.retrieve(masterAssistantId);
            const masterVsIds = masterAssistant.tool_resources?.file_search?.vector_store_ids || [];
            if (masterVsIds.length > 0) {
              assistant = await openai.beta.assistants.update(assistantId, {
                tool_resources: {
                  file_search: {
                    vector_store_ids: masterVsIds,
                  },
                },
              });
              vectorStoreIds = masterVsIds;
              console.log(`Attached master vector store ${masterVsIds[0]} to assistant ${assistantId}`);
            }
          } catch (e) {
            console.warn("Could not attach master vector store:", e);
          }
        }
      }

      const dbFiles = await db.select().from(assistantFiles).where(eq(assistantFiles.userId, user.id));

      let vectorStoreFiles: any[] = [];
      if (vectorStoreIds.length > 0) {
        try {
          const vsId = vectorStoreIds[0];
          const vsFilesResp = await fetch(`https://api.openai.com/v1/vector_stores/${vsId}/files`, {
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });
          const vsFilesData = await vsFilesResp.json() as any;
          const dbFileIds = new Set(dbFiles.map((f: any) => f.openaiFileId));

          if (vsFilesData.data) {
            for (const vsFile of vsFilesData.data) {
              if (!dbFileIds.has(vsFile.id)) {
                try {
                  const fileInfo = await openai.files.retrieve(vsFile.id);
                  vectorStoreFiles.push({
                    id: `vs_${vsFile.id}`,
                    userId: user.id,
                    openaiFileId: vsFile.id,
                    fileName: fileInfo.filename || "Unknown file",
                    fileSize: fileInfo.bytes || 0,
                    createdAt: new Date(fileInfo.created_at * 1000).toISOString(),
                    source: "vector_store",
                  });
                } catch (e) {
                  vectorStoreFiles.push({
                    id: `vs_${vsFile.id}`,
                    userId: user.id,
                    openaiFileId: vsFile.id,
                    fileName: "File",
                    fileSize: vsFile.usage_bytes || 0,
                    createdAt: new Date(vsFile.created_at * 1000).toISOString(),
                    source: "vector_store",
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn("Could not fetch vector store files:", e);
        }
      }

      const allFiles = [...dbFiles.map((f: any) => ({ ...f, source: "database" })), ...vectorStoreFiles];

      res.json({
        hasAssistant: true,
        assistantId: assistant.id,
        name: assistant.name,
        instructions: assistant.instructions,
        model: assistant.model,
        files: allFiles,
        vectorStoreId: vectorStoreIds[0] || null,
      });
    } catch (error: any) {
      console.error("Error fetching assistant settings:", error);
      res.status(500).json({ error: "Failed to fetch assistant settings" });
    }
  };
  app.get("/api/assistant/settings", requireAuth, handleGetAssistantSettings);
  app.get("/api/assistant/admin/:adminId/settings", requireAuth, handleGetAssistantSettings);

  const handleUpdateInstructions = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      const { instructions } = req.body;
      if (!instructions || typeof instructions !== "string") {
        return res.status(400).json({ error: "Instructions are required" });
      }

      const assistantId = user.openaiAssistantId;
      if (!assistantId) {
        return res.status(404).json({ error: "No assistant found. Complete onboarding first." });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const updated = await openai.beta.assistants.update(assistantId, { instructions });

      logActivity(req, {
        action: "LLM_ASSISTANT_UPDATE",
        category: "AI",
        description: `Assistant instructions updated (${assistantId})`,
        resourceId: assistantId,
        resourceType: "assistant",
        metadata: { assistantId, instructionsLength: instructions.length },
      });

      res.json({ success: true, instructions: updated.instructions });
    } catch (error: any) {
      console.error("Error updating assistant instructions:", error);
      res.status(500).json({ error: "Failed to update assistant instructions" });
    }
  };
  app.put("/api/assistant/instructions", requireAuth, handleUpdateInstructions);
  app.put("/api/assistant/admin/:adminId/instructions", requireAuth, handleUpdateInstructions);

  const handleFileUpload = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      const assistantId = user.openaiAssistantId;
      if (!assistantId) {
        return res.status(404).json({ error: "No assistant found. Complete onboarding first." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const openaiFile = await openai.files.create({
        file: fs.createReadStream(req.file.path),
        purpose: "assistants",
      });

      try { fs.unlinkSync(req.file.path); } catch {}

      const currentAssistant = await openai.beta.assistants.retrieve(assistantId);
      const existingVectorStoreIds = currentAssistant.tool_resources?.file_search?.vector_store_ids || [];

      if (existingVectorStoreIds.length > 0) {
        const vsId = existingVectorStoreIds[0];
        await fetch(`https://api.openai.com/v1/vector_stores/${vsId}/files`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({ file_id: openaiFile.id }),
        });
      } else {
        const vsResp = await fetch("https://api.openai.com/v1/vector_stores", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
          body: JSON.stringify({
            name: `InstalliQ Files - ${user.name}`,
            file_ids: [openaiFile.id],
          }),
        });
        const vectorStore = await vsResp.json() as any;
        await openai.beta.assistants.update(assistantId, {
          tool_resources: {
            file_search: {
              vector_store_ids: [vectorStore.id],
            },
          },
          tools: [{ type: "file_search" }],
        });
      }

      await db.insert(assistantFiles).values({
        userId: user.id,
        openaiFileId: openaiFile.id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
      });

      const files = await db.select().from(assistantFiles).where(eq(assistantFiles.userId, user.id));
      res.json({ success: true, files });
    } catch (error: any) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
      console.error("Error uploading assistant file:", error);
      res.status(500).json({ error: "Failed to upload file to assistant" });
    }
  };
  app.post("/api/assistant/files", requireAuth, documentUpload.single("file"), handleFileUpload);
  app.post("/api/assistant/admin/:adminId/files", requireAuth, documentUpload.single("file"), handleFileUpload);

  const handleDeleteVectorStoreFile = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      const assistantId = user.openaiAssistantId;
      if (!assistantId) {
        return res.status(404).json({ error: "No assistant found" });
      }

      const openaiFileId = req.params.openaiFileId;
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const assistant = await openai.beta.assistants.retrieve(assistantId);
      const vectorStoreIds = assistant.tool_resources?.file_search?.vector_store_ids || [];

      if (vectorStoreIds.length > 0) {
        try {
          await fetch(`https://api.openai.com/v1/vector_stores/${vectorStoreIds[0]}/files/${openaiFileId}`, {
            method: "DELETE",
            headers: {
              "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
              "OpenAI-Beta": "assistants=v2",
            },
          });
        } catch (e) {
          console.warn("Could not remove file from vector store:", e);
        }
      }

      try {
        await openai.files.delete(openaiFileId);
      } catch (e) {
        console.warn("Could not delete file from OpenAI:", e);
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting vector store file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  };
  app.delete("/api/assistant/files/vector-store/:openaiFileId", requireAuth, handleDeleteVectorStoreFile);
  app.delete("/api/assistant/admin/:adminId/files/vector-store/:openaiFileId", requireAuth, handleDeleteVectorStoreFile);

  const handleDeleteFile = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      const fileId = parseInt(req.params.fileId);
      const [file] = await db.select().from(assistantFiles)
        .where(eq(assistantFiles.id, fileId));

      if (!file || file.userId !== user.id) {
        return res.status(404).json({ error: "File not found" });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      try {
        await (openai.files as any).delete(file.openaiFileId);
      } catch (e) {
        console.warn("Could not delete file from OpenAI:", e);
      }

      await db.delete(assistantFiles).where(eq(assistantFiles.id, fileId));

      const files = await db.select().from(assistantFiles).where(eq(assistantFiles.userId, user.id));
      res.json({ success: true, files });
    } catch (error: any) {
      console.error("Error deleting assistant file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  };
  app.delete("/api/assistant/files/:fileId", requireAuth, handleDeleteFile);
  app.delete("/api/assistant/admin/:adminId/files/:fileId", requireAuth, handleDeleteFile);

  const handleCreateAssistant = async (req: Request, res: Response) => {
    try {
      const { user, error, status } = await getAssistantTargetUser(req);
      if (!user) return res.status(status || 403).json({ error });

      if (user.openaiAssistantId) {
        return res.status(400).json({ error: "Assistant already exists for this admin" });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      let baseInstructions = "";
      let masterVectorStoreIds: string[] = [];
      const masterAssistantId = process.env.OPENAI_ASSISTANT_ID;
      if (masterAssistantId) {
        try {
          const masterAssistant = await openai.beta.assistants.retrieve(masterAssistantId);
          baseInstructions = masterAssistant.instructions || "";
          masterVectorStoreIds = masterAssistant.tool_resources?.file_search?.vector_store_ids || [];
        } catch (e) {
          console.warn("Could not retrieve master assistant:", e);
        }
      }

      const [onboardingData] = await db.select().from(onboardingForms).where(eq(onboardingForms.userId, user.id));

      let personalizedInstructions = baseInstructions;
      if (onboardingData) {
        const onboardingContext = `
--- Admin-Specific Business Details ---
Admin: ${user.name} (${user.location || "No location"})
Business Address: ${onboardingData.businessAddress || "N/A"}
Installation Range: ${onboardingData.installationRange || "N/A"}
Travel Time Charges: ${onboardingData.chargeTravelTime || "N/A"}
Setup/Cleanup Time: ${onboardingData.setupCleanupTime || "N/A"}
Team Size: ${onboardingData.teamSize || "N/A"}
Scheduling POC: ${onboardingData.schedulingPOC || "N/A"}
Has Bucket Truck: ${onboardingData.hasBucketTruck || "N/A"}
Bucket Truck Min Time: ${onboardingData.bucketTruckMinTime || "N/A"}
Ladder Max Height: ${onboardingData.ladderMaxHeight || "N/A"}
Does Vehicle Graphics: ${onboardingData.vehicleGraphics || "N/A"}
Has Garage: ${onboardingData.hasGarage || "N/A"}
Does Wraps: ${onboardingData.doesWraps || "N/A"}
Installs Posts: ${onboardingData.installsPosts || "N/A"}
Sign Types: ${onboardingData.signTypes?.join(", ") || "N/A"}
Pricing/Product List: ${onboardingData.pricingProductList || "N/A"}
Install Time Standards: ${onboardingData.installTimeStandards || "N/A"}
Additional Notes: ${onboardingData.additionalNotes || "N/A"}
--- End Admin-Specific Details ---`;

        personalizedInstructions = personalizedInstructions
          ? personalizedInstructions + "\n\n" + onboardingContext
          : onboardingContext;
      }

      const createParams: any = {
        name: `InstalliQ Assistant - ${user.name}`,
        instructions: personalizedInstructions || "You are an AI scheduling assistant for FASTSIGNS signage installations.",
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      };

      if (masterVectorStoreIds.length > 0) {
        createParams.tool_resources = {
          file_search: {
            vector_store_ids: masterVectorStoreIds,
          },
        };
      }

      const assistant = await openai.beta.assistants.create(createParams);

      await db.update(users).set({ openaiAssistantId: assistant.id }).where(eq(users.id, user.id));

      res.json({ success: true, assistantId: assistant.id });
    } catch (error: any) {
      console.error("Error creating assistant:", error);
      res.status(500).json({ error: "Failed to create assistant" });
    }
  };
  app.post("/api/assistant/create", requireAuth, handleCreateAssistant);
  app.post("/api/assistant/admin/:adminId/create", requireAuth, handleCreateAssistant);

  app.post("/api/admin/migrate-images-to-cloud", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }

      const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf" };
      let migratedCount = 0;
      let failedCount = 0;

      // Migrate project images
      const allProjects = await storage.getAllProjects();
      for (const project of allProjects) {
        if (!project.imageUrls || project.imageUrls.length === 0) continue;
        const hasLocalImages = project.imageUrls.some(url => url && url.startsWith("/uploads/"));
        if (!hasLocalImages) continue;

        const newUrls: string[] = [];
        for (const url of project.imageUrls) {
          if (!url || typeof url !== "string") continue;
          if (url.startsWith("/uploads/")) {
            const fileName = url.replace("/uploads/", "");
            const localPath = path.join(uploadDir, fileName);
            if (fs.existsSync(localPath)) {
              try {
                const ext = path.extname(fileName).toLowerCase();
                const mime = mimeMap[ext] || "application/octet-stream";
                const objUrl = await uploadFileToObjectStorage(localPath, fileName, mime);
                newUrls.push(objUrl);
                migratedCount++;
              } catch (err) {
                console.error(`Failed to migrate project image ${fileName}:`, err);
                newUrls.push(url);
                failedCount++;
              }
            } else {
              newUrls.push(url);
              failedCount++;
            }
          } else {
            newUrls.push(url);
          }
        }
        await storage.updateProject(project.id, { imageUrls: newUrls });
      }

      // Migrate attachment files (work orders, proofs, finished photos)
      const allAttachments = await storage.getAllAttachments();
      let attachmentsMigrated = 0;
      for (const attachment of allAttachments) {
        if (!attachment.fileUrl || !attachment.fileUrl.startsWith("/uploads/")) continue;
        const fileName = attachment.fileUrl.replace("/uploads/", "");
        const localPath = path.join(uploadDir, fileName);
        if (fs.existsSync(localPath)) {
          try {
            const ext = path.extname(fileName).toLowerCase();
            const mime = mimeMap[ext] || "application/octet-stream";
            const objUrl = await uploadFileToObjectStorage(localPath, fileName, mime);
            await storage.updateAttachment(attachment.id, { fileUrl: objUrl });
            attachmentsMigrated++;
            migratedCount++;
          } catch (err) {
            console.error(`Failed to migrate attachment ${fileName}:`, err);
            failedCount++;
          }
        } else {
          failedCount++;
        }
      }

      res.json({ success: true, migratedCount, failedCount, attachmentsMigrated, totalProjects: allProjects.length, totalAttachments: allAttachments.length });
    } catch (error) {
      console.error("Error migrating images:", error);
      res.status(500).json({ error: "Failed to migrate images" });
    }
  });

  // ─── Subscription Plan Routes ─────────────────────────────────────────────

  // Helper: get subscription usage for an admin
  async function getSubscriptionUsage(userId: number) {
    // Resolve Install Manager (role=user) to their admin for subscription lookup
    const userRecord = await storage.getUser(userId);
    const adminId = (userRecord?.role === "user" && userRecord.createdBy)
      ? userRecord.createdBy
      : userId;

    const subResult = await pool.query(
      `SELECT s.*, p.name as plan_name, p.price, p.event_limit, p.buffer_limit
       FROM admin_subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.admin_id = $1 AND s.status = 'active'
       ORDER BY s.started_at DESC LIMIT 1`,
      [adminId]
    );
    const sub = subResult.rows[0] || null;

    let eventsUsed = 0;
    let eventsCompleted = 0;

    if (sub) {
      // Count events created by the admin AND by any users under that admin
      const usageResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM calendar_events
         WHERE (created_by = $1 OR created_by IN (
           SELECT id FROM users WHERE created_by = $1 AND role = 'user'
         ))
         AND created_at >= $2`,
        [adminId, sub.started_at]
      );
      eventsUsed = usageResult.rows[0]?.count || 0;

      const completedResult = await pool.query(
        `SELECT COUNT(*)::int as count FROM calendar_events
         WHERE (created_by = $1 OR created_by IN (
           SELECT id FROM users WHERE created_by = $1 AND role = 'user'
         ))
         AND status = 'COMPLETED'
         AND created_at >= $2`,
        [adminId, sub.started_at]
      );
      eventsCompleted = completedResult.rows[0]?.count || 0;
    }

    return { sub, eventsUsed, eventsCompleted };
  }

  // ── Subscription Gate Toggle ──────────────────────────────
  app.get("/api/settings/subscription-gate", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT value FROM app_settings WHERE key = 'subscription_gate_enabled'"
      );
      const enabled = result.rows.length > 0 && result.rows[0].value === "true";
      res.json({ enabled });
    } catch (error) {
      console.error("Error fetching subscription gate setting:", error);
      res.json({ enabled: false });
    }
  });

  app.post("/api/settings/subscription-gate", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser || currentUser.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { enabled } = req.body;
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('subscription_gate_enabled', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [enabled ? "true" : "false"]
      );

      logActivity(req, {
        action: "UPDATE_SETTINGS",
        category: "Settings",
        description: `${enabled ? "Enabled" : "Disabled"} subscription gate for all owners`,
        resourceId: "subscription_gate_enabled",
        resourceType: "app_settings",
      });

      res.json({ enabled: !!enabled });
    } catch (error) {
      console.error("Error updating subscription gate setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // GET all active plans (any authenticated user)
  app.get("/api/subscription/plans", requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC, id ASC"
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // GET all plans including inactive (super_admin only)
  app.get("/api/subscription/plans/all", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const result = await pool.query(
        "SELECT * FROM subscription_plans ORDER BY sort_order ASC, id ASC"
      );
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching all plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });

  // POST create a plan (super_admin only)
  app.post("/api/subscription/plans", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { name, price, originalPrice, eventLimit, isActive, isDefault, sortOrder } = req.body;
      if (!name || !price || !eventLimit) {
        return res.status(400).json({ error: "name, price, and eventLimit are required" });
      }
      const result = await pool.query(
        `INSERT INTO subscription_plans (name, price, original_price, event_limit, buffer_limit, is_active, is_default, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [name, String(price), originalPrice ? String(originalPrice) : null, Number(eventLimit), Number(eventLimit), isActive !== false, isDefault || false, sortOrder || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ error: "Failed to create plan" });
    }
  });

  // PUT update a plan (super_admin only) - also notifies all subscribed admins
  app.put("/api/subscription/plans/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const planId = parseInt(req.params.id);
      const { name, price, originalPrice, eventLimit, isActive, isDefault, sortOrder } = req.body;

      // Fetch old plan (for future auditing if needed)
      await pool.query("SELECT * FROM subscription_plans WHERE id=$1", [planId]);

      const result = await pool.query(
        `UPDATE subscription_plans SET name=$1, price=$2, original_price=$3, event_limit=$4, buffer_limit=$5, is_active=$6, is_default=$7, sort_order=$8
         WHERE id=$9 RETURNING *`,
        [name, String(price), originalPrice ? String(originalPrice) : null, Number(eventLimit), Number(eventLimit), isActive !== false, isDefault || false, sortOrder || 0, planId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Plan not found" });

      // Notify all admins currently subscribed to this plan
      const notifyMsg = `Your subscription plan "${name}" has been updated by the administrator. ` +
        `New limits: ${eventLimit} events/month. ` +
        `Monthly price: $${price}. Please review your plan details.`;
      await pool.query(
        "UPDATE admin_subscriptions SET plan_notification=$1 WHERE plan_id=$2 AND status='active'",
        [notifyMsg, planId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });

  // POST assign a plan to a specific admin (super_admin only)
  app.post("/api/subscription/assign-plan", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const { adminId, planId } = req.body;
      if (!adminId || !planId) return res.status(400).json({ error: "adminId and planId are required" });

      const planCheck = await pool.query("SELECT * FROM subscription_plans WHERE id=$1", [planId]);
      if (planCheck.rows.length === 0) return res.status(404).json({ error: "Plan not found" });
      const plan = planCheck.rows[0];

      // Cancel existing subscription
      await pool.query("UPDATE admin_subscriptions SET status='cancelled' WHERE admin_id=$1 AND status='active'", [adminId]);

      // Create new subscription with notification
      const notifyMsg = `Your subscription plan has been updated to "${plan.name}" by the administrator. ` +
        `You now have ${plan.event_limit} events/month. ` +
        `Monthly price: $${plan.price}. Please review your plan details below.`;
      const result = await pool.query(
        "INSERT INTO admin_subscriptions (admin_id, plan_id, status, started_at, plan_notification) VALUES ($1, $2, 'active', NOW(), $3) RETURNING *",
        [adminId, planId, notifyMsg]
      );
      const adminUser = await storage.getUser(adminId);
      logActivity(req, {
        action: "ASSIGN_PLAN",
        category: "Subscriptions",
        description: `Assigned plan "${plan.name}" to owner ${adminUser?.name || adminId}`,
        resourceId: adminId,
        resourceType: "subscription_plan",
        metadata: { planName: plan.name, price: plan.price, adminId },
      });

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error assigning plan:", error);
      res.status(500).json({ error: "Failed to assign plan" });
    }
  });

  // POST dismiss plan notification for current admin
  app.post("/api/subscription/dismiss-notification", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      await pool.query(
        "UPDATE admin_subscriptions SET plan_notification=NULL WHERE admin_id=$1 AND status='active'",
        [userId]
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing notification:", error);
      res.status(500).json({ error: "Failed to dismiss notification" });
    }
  });

  // PATCH toggle plan active/inactive (super_admin only)
  app.patch("/api/subscription/plans/:id/toggle", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const planId = parseInt(req.params.id);
      const result = await pool.query(
        "UPDATE subscription_plans SET is_active = NOT is_active WHERE id=$1 RETURNING *",
        [planId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Plan not found" });
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error toggling plan:", error);
      res.status(500).json({ error: "Failed to toggle plan" });
    }
  });

  // DELETE a plan (super_admin only)
  app.delete("/api/subscription/plans/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const planId = parseInt(req.params.id);
      const inUse = await pool.query("SELECT COUNT(*) FROM admin_subscriptions WHERE plan_id=$1 AND status='active'", [planId]);
      if (parseInt(inUse.rows[0].count) > 0) {
        return res.status(400).json({ error: "Cannot delete a plan that has active subscribers" });
      }
      await pool.query("DELETE FROM subscription_plans WHERE id=$1", [planId]);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });

  // GET current admin's subscription + usage
  app.get("/api/subscription/my-subscription", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const { sub, eventsUsed, eventsCompleted } = await getSubscriptionUsage(userId);
      // Resolve admin ID for Install Managers
      const userRecord = await storage.getUser(userId);
      const resolvedAdminId = (userRecord?.role === "user" && userRecord.createdBy)
        ? userRecord.createdBy
        : userId;
      // Also fetch plan_notification from the active subscription row
      const notifResult = await pool.query(
        "SELECT plan_notification FROM admin_subscriptions WHERE admin_id=$1 AND status='active' LIMIT 1",
        [resolvedAdminId]
      );
      const planNotification = notifResult.rows[0]?.plan_notification || null;
      res.json({
        subscription: sub,
        eventsUsed,
        eventsCompleted,
        eventsRemaining: sub ? Math.max(0, sub.event_limit - eventsUsed) : null,
        planName: sub?.plan_name || null,
        eventLimit: sub?.event_limit || null,
        price: sub?.price || null,
        status: sub ? (eventsUsed >= sub.event_limit ? "blocked" : "active") : "no_plan",
        planNotification,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  // GET subscription usage for any admin (super_admin only)
  app.get("/api/subscription/usage/:adminId", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const adminId = parseInt(req.params.adminId);
      const { sub, eventsUsed, eventsCompleted } = await getSubscriptionUsage(adminId);
      res.json({
        subscription: sub,
        eventsUsed,
        eventsCompleted,
        eventsRemaining: sub ? Math.max(0, sub.event_limit - eventsUsed) : null,
        planName: sub?.plan_name || null,
        eventLimit: sub?.event_limit || null,
        price: sub?.price || null,
        status: sub ? (eventsUsed >= sub.event_limit ? "blocked" : "active") : "no_plan",
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ error: "Failed to fetch usage" });
    }
  });

  // POST subscribe/change plan (admin only)
  app.post("/api/subscription/subscribe", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role === "super_admin") {
        return res.status(403).json({ error: "Super admin does not subscribe to plans" });
      }
      const adminId = req.session.userId!;
      const { planId } = req.body;
      if (!planId) return res.status(400).json({ error: "planId is required" });
      const planCheck = await pool.query("SELECT * FROM subscription_plans WHERE id=$1 AND is_active=true", [planId]);
      if (planCheck.rows.length === 0) return res.status(404).json({ error: "Plan not found or inactive" });
      await pool.query("UPDATE admin_subscriptions SET status='cancelled' WHERE admin_id=$1 AND status='active'", [adminId]);
      const result = await pool.query(
        "INSERT INTO admin_subscriptions (admin_id, plan_id, status, started_at) VALUES ($1, $2, 'active', NOW()) RETURNING *",
        [adminId, planId]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error("Error subscribing:", error);
      res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  // GET all admins with their subscription info (super_admin only)
  app.get("/api/subscription/admin-subscriptions", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const result = await db.execute(sql`
        SELECT u.id, u.name, u.email, s.status, p.name as plan_name, p.price, p.event_limit, s.started_at,
               (SELECT COUNT(*)::int FROM calendar_events ce
                WHERE ce.created_by = u.id
                AND (s.started_at IS NULL OR ce.created_at >= s.started_at)) as events_used
        FROM users u
        LEFT JOIN admin_subscriptions s ON s.admin_id = u.id AND s.status = 'active'
        LEFT JOIN subscription_plans p ON p.id = s.plan_id
        WHERE u.role = 'admin' AND u.deleted_at IS NULL
        ORDER BY u.name ASC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error fetching admin subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch admin subscriptions" });
    }
  });

  // ============ PAYMENT ROUTES ============

  // Super admin: toggle payment_required for an admin
  app.patch("/api/admin/users/:id/payment-toggle", requireAdmin, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (currentUser?.role !== "super_admin") {
        return res.status(403).json({ error: "Super admin access required" });
      }
      const targetId = parseInt(req.params.id);
      const { paymentRequired } = req.body;
      await pool.query(
        "UPDATE users SET payment_required = $1 WHERE id = $2 AND role = 'admin'",
        [!!paymentRequired, targetId]
      );
      // If payment is being disabled, also clear payment_completed so if re-enabled they must pay again
      // (optional behavior - currently we keep payment_completed intact so they don't re-pay)
      const targetUser = await storage.getUser(targetId);
      logActivity(req, {
        action: "UPDATE_PAYMENT_REQUIRED",
        category: "User Management",
        description: `${paymentRequired ? "Enabled" : "Disabled"} payment requirement for owner: ${targetUser?.name ?? `#${targetId}`}`,
        resourceId: targetId,
        resourceType: "user",
        metadata: { paymentRequired: !!paymentRequired, ownerName: targetUser?.name, ownerEmail: targetUser?.email },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error toggling payment:", error);
      res.status(500).json({ error: "Failed to update payment setting" });
    }
  });

  // Create a Razorpay order for the current admin
  app.post("/api/payment/create-plan-order", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
      if (currentUser.role !== "admin") return res.status(403).json({ error: "Only admins can subscribe to plans" });

      const { planId } = req.body;
      if (!planId) return res.status(400).json({ error: "planId is required" });

      const planResult = await pool.query("SELECT * FROM subscription_plans WHERE id=$1 AND is_active=true", [planId]);
      if (planResult.rows.length === 0) return res.status(404).json({ error: "Plan not found or inactive" });
      const plan = planResult.rows[0];

      if (!razorpay) return res.status(503).json({ error: "Payment service not configured" });

      const priceNum = parseFloat(plan.price);
      const amountInPaise = Math.round(priceNum * 100);

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `plan_${currentUser.id}_${planId}_${Date.now()}`,
        notes: { adminId: String(currentUser.id), planId: String(planId), planName: plan.name, type: "plan_subscription" },
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        planName: plan.name,
        planId: planId,
      });
    } catch (error) {
      console.error("Error creating plan order:", error);
      res.status(500).json({ error: "Failed to create payment order" });
    }
  });

  app.post("/api/payment/verify-plan", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
      if (currentUser.role !== "admin") return res.status(403).json({ error: "Only admins can subscribe to plans" });

      const { orderId, paymentId, signature, planId } = req.body;
      if (!orderId || !paymentId || !signature || !planId) {
        return res.status(400).json({ error: "Missing payment verification data or planId" });
      }

      const isValid = verifyRazorpaySignature(orderId, paymentId, signature);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }

      const planCheck = await pool.query("SELECT * FROM subscription_plans WHERE id=$1 AND is_active=true", [planId]);
      if (planCheck.rows.length === 0) return res.status(404).json({ error: "Plan not found or inactive" });

      await pool.query("UPDATE admin_subscriptions SET status='cancelled' WHERE admin_id=$1 AND status='active'", [currentUser.id]);

      const result = await pool.query(
        "INSERT INTO admin_subscriptions (admin_id, plan_id, status, started_at) VALUES ($1, $2, 'active', NOW()) RETURNING *",
        [currentUser.id, planId]
      );

      await pool.query(
        "UPDATE users SET payment_completed = true WHERE id = $1",
        [currentUser.id]
      );

      const plan = planCheck.rows[0];
      logActivity(req, {
        action: "PURCHASE_PLAN",
        category: "Subscriptions",
        description: `Purchased plan: ${plan.name} ($${plan.price})`,
        resourceId: planId,
        resourceType: "subscription_plan",
        metadata: { planName: plan.name, price: plan.price, paymentId },
      });

      res.json({ success: true, message: "Payment verified and plan activated", subscription: result.rows[0] });
    } catch (error) {
      console.error("Error verifying plan payment:", error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });

  app.post("/api/payment/create-order", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
      if (currentUser.role !== "admin") return res.status(403).json({ error: "Only admins need to complete payment" });
      if (!currentUser.paymentRequired) return res.status(400).json({ error: "Payment is not required for your account" });
      if (currentUser.paymentCompleted) return res.status(400).json({ error: "Payment already completed" });

      // Get subscription plan amount if available
      let amountInPaise = 100000; // default ₹1000
      let planName = "Account Activation";
      const subResult = await pool.query(
        `SELECT p.price, p.name FROM admin_subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.admin_id = $1 AND s.status = 'active' LIMIT 1`,
        [currentUser.id]
      );
      if (subResult.rows.length > 0) {
        const priceNum = parseFloat(subResult.rows[0].price);
        amountInPaise = Math.round(priceNum * 100);
        planName = subResult.rows[0].name;
      }

      if (!razorpay) return res.status(503).json({ error: "Payment service not configured" });

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `admin_${currentUser.id}_${Date.now()}`,
        notes: { adminId: String(currentUser.id), planName },
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        planName,
      });
    } catch (error) {
      console.error("Error creating Razorpay order:", error);
      res.status(500).json({ error: "Failed to create payment order" });
    }
  });

  // Verify Razorpay payment and mark admin as paid
  app.post("/api/payment/verify", requireAuth, async (req, res) => {
    try {
      const currentUser = await storage.getUser(req.session.userId!);
      if (!currentUser) return res.status(401).json({ error: "Unauthorized" });
      if (currentUser.role !== "admin") return res.status(403).json({ error: "Only admins can complete payment" });

      const { orderId, paymentId, signature } = req.body;
      if (!orderId || !paymentId || !signature) {
        return res.status(400).json({ error: "Missing payment verification data" });
      }

      const isValid = verifyRazorpaySignature(orderId, paymentId, signature);
      if (!isValid) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }

      await pool.query(
        "UPDATE users SET payment_completed = true WHERE id = $1",
        [currentUser.id]
      );

      res.json({ success: true, message: "Payment verified successfully" });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });

  app.post("/api/time-estimator", requireAuth, pdfUpload.array("files", 10), async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    const cleanupFiles = () => {
      if (files) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch {}
        }
      }
    };

    try {
      const userId = req.session.userId;
      if (!userId) {
        cleanupFiles();
        return res.status(401).json({ message: "Not authenticated" });
      }
      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!currentUser) {
        cleanupFiles();
        return res.status(401).json({ message: "User not found" });
      }

      if (!files || files.length === 0) {
        cleanupFiles();
        return res.status(400).json({ message: "Please upload at least one file" });
      }

      let assistantId: string | null = null;
      if (currentUser.role === "admin") {
        assistantId = currentUser.openaiAssistantId || null;
      } else if (currentUser.role === "user" && currentUser.createdBy) {
        const [owner] = await db.select().from(users).where(eq(users.id, currentUser.createdBy));
        assistantId = owner?.openaiAssistantId || null;
      }

      const additionalNotes = req.body.additionalNotes || "";

      const allExtracted: string[] = [];

      for (const file of files) {
        try {
          if (file.mimetype === "application/pdf") {
            const workOrderData = await extractWorkOrderData(file.path);
            allExtracted.push(`Work Order File: ${file.originalname}\n- WO#: ${workOrderData.workOrderNumber || "N/A"}\n- Customer: ${workOrderData.customerName || "N/A"}\n- Sign Types: ${workOrderData.signTypes.join(", ") || "Not specified"}\n- Dimensions: ${workOrderData.dimensions.join(", ") || "Not specified"}\n- Quantity: ${workOrderData.quantity}\n- Description: ${workOrderData.description || "N/A"}\n- Installation Notes: ${workOrderData.installationNotes || "None"}\n- Product Due: ${workOrderData.productDueDate || "N/A"}`);
          } else {
            const imageBuffer = fs.readFileSync(file.path);
            const base64Image = imageBuffer.toString("base64");
            const mimeType = file.mimetype || "image/jpeg";

            const visionResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Describe this installation proof image. Identify sign types, dimensions if visible, installation surface, mounting method, and any relevant details for estimating installation time." },
                    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                  ]
                }
              ],
              max_tokens: 500,
            });

            const description = visionResponse.choices[0]?.message?.content || "Could not analyze image";
            allExtracted.push(`Proof Image: ${file.originalname}\n${description}`);
          }
        } catch (fileErr) {
          console.error(`Error processing file ${file.originalname}:`, fileErr);
          allExtracted.push(`File: ${file.originalname} - Could not process this file`);
        }
      }

      cleanupFiles();

      const combinedContext = allExtracted.join("\n\n---\n\n");

      let estimate: string;

      if (assistantId) {
        try {
          const thread = await openai.beta.threads.create();
          const messageContent = `Please analyze the following work orders and installation details using your knowledge base to provide an accurate installation time estimate.

${combinedContext}

${additionalNotes ? `Additional Notes from User: ${additionalNotes}` : ""}

Today's date: ${new Date().toISOString().split("T")[0]}

Based on your knowledge and experience data, provide:
1. Estimated total installation time (hours and minutes)
2. Complexity level (simple, moderate, or complex)
3. Recommended crew size
4. Breakdown by sign type if multiple types are present
5. Key factors affecting the estimate
6. Any recommendations or considerations

Use your knowledge base and training data to make the estimate as accurate as possible. Keep the response concise but thorough. Use plain text formatting.`;

          await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: messageContent,
          });

          console.log(`Using owner's assistant ${assistantId} with knowledge base for time estimation`);
          let run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId,
            tools: [{ type: "file_search" }],
          });

          const startTime = Date.now();
          const timeout = 60000;
          while (run.status === "queued" || run.status === "in_progress") {
            if (Date.now() - startTime > timeout) break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
          }

          if (run.status === "completed") {
            const messages = await openai.beta.threads.messages.list(thread.id);
            const assistantMessage = messages.data.find((m) => m.role === "assistant");
            if (assistantMessage && assistantMessage.content[0]?.type === "text") {
              estimate = assistantMessage.content[0].text.value;
            } else {
              throw new Error("No assistant response");
            }
          } else {
            throw new Error(`Assistant run status: ${run.status}`);
          }
        } catch (assistantErr) {
          console.error("Assistant API error, falling back to chat:", assistantErr);
          const fallback = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "You are an expert sign installation time estimator. Provide clear, concise estimates based on the work order details and images provided." },
              { role: "user", content: `Analyze these files and provide an installation time estimate:\n\n${combinedContext}\n\n${additionalNotes ? `Additional Notes: ${additionalNotes}` : ""}\n\nProvide: estimated time, complexity, crew size, breakdown, and key factors.` }
            ],
            max_tokens: 1000,
          });
          estimate = fallback.choices[0]?.message?.content || "Unable to generate estimate";
        }
      } else {
        const fallback = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert sign installation time estimator. Provide clear, concise estimates based on the work order details and images provided." },
            { role: "user", content: `Analyze these files and provide an installation time estimate:\n\n${combinedContext}\n\n${additionalNotes ? `Additional Notes: ${additionalNotes}` : ""}\n\nProvide: estimated time, complexity, crew size, breakdown, and key factors.` }
          ],
          max_tokens: 1000,
        });
        estimate = fallback.choices[0]?.message?.content || "Unable to generate estimate";
      }

      res.json({ estimate });
    } catch (error: any) {
      cleanupFiles();
      console.error("Time estimator error:", error);
      res.status(500).json({ message: error.message || "Failed to generate estimate" });
    }
  });

  // ==================== SURVEY ROUTES ====================

  app.get("/api/surveys", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      let surveyList: any[];
      if (user.role === "admin") {
        const adminUsers = await storage.getAllUsers();
        const teamIds = adminUsers.filter(u => u.createdBy === userId || u.id === userId).map(u => u.id);
        const allSurveys = await db.select().from(surveys).where(inArray(surveys.createdBy, teamIds)).orderBy(desc(surveys.createdAt));
        surveyList = allSurveys;
      } else if (user.role === "super_admin") {
        surveyList = await db.select().from(surveys).orderBy(desc(surveys.createdAt));
      } else if (user.createdBy) {
        const allUsers = await storage.getAllUsers();
        const teamIds = allUsers
          .filter(u => u.createdBy === user.createdBy || u.id === user.createdBy)
          .map(u => u.id);
        if (!teamIds.includes(userId)) teamIds.push(userId);
        surveyList = await db.select().from(surveys).where(inArray(surveys.createdBy, teamIds)).orderBy(desc(surveys.createdAt));
      } else {
        surveyList = await storage.getSurveysByCreator(userId);
      }

      const enriched = await Promise.all(surveyList.map(async (s: any) => {
        const photos = await storage.getSurveyPhotos(s.id);
        const thumbnailUrl = photos.length > 0 ? (photos[0].annotatedImageUrl || photos[0].originalImageUrl) : null;
        return { ...s, photoCount: photos.length, thumbnailUrl };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching surveys:", error);
      res.status(500).json({ error: "Failed to fetch surveys" });
    }
  });

  app.get("/api/surveys/:id", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurvey(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ error: "Survey not found" });
      const photos = await storage.getSurveyPhotos(survey.id);
      res.json({ ...survey, photos });
    } catch (error) {
      console.error("Error fetching survey:", error);
      res.status(500).json({ error: "Failed to fetch survey" });
    }
  });

  app.get("/api/surveys/by-event/:calendarEventId", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurveyByCalendarEventId(parseInt(req.params.calendarEventId));
      if (!survey) return res.status(404).json({ error: "No survey found for this event" });
      const photos = await storage.getSurveyPhotos(survey.id);
      res.json({ ...survey, photos });
    } catch (error) {
      console.error("Error fetching survey by event:", error);
      res.status(500).json({ error: "Failed to fetch survey" });
    }
  });

  app.post("/api/surveys", requireAuth, async (req, res) => {
    try {
      const { jobName, address, description, generalNotes, calendarEventId } = req.body;
      if (!jobName) return res.status(400).json({ error: "Job name is required" });

      const survey = await storage.createSurvey({
        jobName,
        address: address || null,
        description: description || null,
        generalNotes: generalNotes || null,
        calendarEventId: calendarEventId ? parseInt(calendarEventId) : null,
        status: "draft",
        createdBy: req.session.userId!,
      });

      logActivity(req, {
        action: "CREATE_SURVEY",
        category: "Surveys",
        description: `Created survey: ${survey.jobName}`,
        resourceId: survey.id,
        resourceType: "survey",
      });

      res.status(201).json(survey);
    } catch (error) {
      console.error("Error creating survey:", error);
      res.status(500).json({ error: "Failed to create survey" });
    }
  });

  app.patch("/api/surveys/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const survey = await storage.getSurvey(id);
      if (!survey) return res.status(404).json({ error: "Survey not found" });

      const { jobName, address, description, generalNotes, status, assessmentData } = req.body;
      const updated = await storage.updateSurvey(id, {
        ...(jobName !== undefined && { jobName }),
        ...(address !== undefined && { address }),
        ...(description !== undefined && { description }),
        ...(generalNotes !== undefined && { generalNotes }),
        ...(status !== undefined && { status }),
        ...(assessmentData !== undefined && { assessmentData }),
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating survey:", error);
      res.status(500).json({ error: "Failed to update survey" });
    }
  });

  app.delete("/api/surveys/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSurvey(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting survey:", error);
      res.status(500).json({ error: "Failed to delete survey" });
    }
  });

  app.post("/api/surveys/:id/photos", requireAuth, mixedUpload.array("photos", 50), async (req, res) => {
    const files = req.files as Express.Multer.File[];
    try {
      const surveyId = parseInt(req.params.id);
      const survey = await storage.getSurvey(surveyId);
      if (!survey) return res.status(404).json({ error: "Survey not found" });

      const existingPhotos = await storage.getSurveyPhotos(surveyId);
      const MAX_SURVEY_PHOTOS = 50;
      if (existingPhotos.length + files.length > MAX_SURVEY_PHOTOS) {
        if (files) files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
        return res.status(400).json({ error: `Photo limit exceeded. Maximum ${MAX_SURVEY_PHOTOS} photos per survey. You currently have ${existingPhotos.length} and are trying to add ${files.length}.` });
      }
      let sortOrder = existingPhotos.length;

      const uploadedPhotos = [];
      for (const file of files) {
        const imageUrl = await uploadFileToObjectStorage(file.path, file.filename, file.mimetype, req.session.userId);
        const photo = await storage.createSurveyPhoto({
          surveyId,
          originalImageUrl: imageUrl,
          sortOrder: sortOrder++,
          hasAnnotations: false,
        });
        uploadedPhotos.push(photo);
        try { fs.unlinkSync(file.path); } catch {}
      }

      res.status(201).json(uploadedPhotos);
    } catch (error) {
      console.error("Error uploading survey photos:", error);
      if (files) files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
      res.status(500).json({ error: "Failed to upload photos" });
    }
  });

  app.patch("/api/surveys/:surveyId/photos/:photoId", requireAuth, async (req, res) => {
    try {
      const photoId = parseInt(req.params.photoId);
      const { note, measurements } = req.body;
      const patch: Record<string, any> = {};
      if (note !== undefined) patch.note = note;
      if (measurements !== undefined) patch.measurements = measurements;
      const updated = await storage.updateSurveyPhoto(photoId, patch);
      res.json(updated);
    } catch (error) {
      console.error("Error updating survey photo:", error);
      res.status(500).json({ error: "Failed to update photo" });
    }
  });

  app.post("/api/surveys/:surveyId/photos/:photoId/annotate", requireAuth, mixedUpload.single("annotatedImage"), async (req, res) => {
    const file = req.file;
    try {
      const photoId = parseInt(req.params.photoId);
      if (!file) return res.status(400).json({ error: "No annotated image provided" });

      const imageUrl = await uploadFileToObjectStorage(file.path, `annotated-${file.filename}`, file.mimetype, req.session.userId);
      const updated = await storage.updateSurveyPhoto(photoId, {
        annotatedImageUrl: imageUrl,
        hasAnnotations: true,
      });
      try { fs.unlinkSync(file.path); } catch {}

      res.json(updated);
    } catch (error) {
      console.error("Error saving annotation:", error);
      if (file) try { fs.unlinkSync(file.path); } catch {}
      res.status(500).json({ error: "Failed to save annotation" });
    }
  });

  app.delete("/api/surveys/:surveyId/photos/:photoId", requireAuth, async (req, res) => {
    try {
      const photoId = parseInt(req.params.photoId);
      await storage.deleteSurveyPhoto(photoId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting survey photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  app.get("/api/surveys/:id/pdf", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurvey(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ error: "Survey not found" });
      const photos = await storage.getSurveyPhotos(survey.id);
      const branding = await loadAdminBranding(req.session.userId!);

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="survey-${survey.id}.pdf"`);
      doc.pipe(res);

      await buildSurveyPDF(doc, survey, photos, branding);

      doc.end();
    } catch (error) {
      console.error("Error generating survey PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  async function buildSurveyPDF(doc: InstanceType<typeof PDFDocument>, survey: any, photos: any[], branding?: PdfBranding) {
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 50;
    const contentW = pageW - margin * 2;
    const brandOrange = "#E8621C";
    const brandDark = "#C14D10";
    const darkText = "#222222";
    const medText = "#555555";
    const nowEST = formatEST(new Date(), "MMMM d, yyyy 'at' h:mm a zzz");

    const hasTemplate = !!(branding?.templateBuffer);

    const drawTemplateBackground = () => {
      if (hasTemplate && branding?.templateBuffer) {
        try {
          doc.image(branding.templateBuffer, 0, 0, { width: pageW, height: pageH });
        } catch (e) {
          console.error("Failed to draw template background in survey:", e);
        }
      }
    };

    const drawHeader = (isFirstPage: boolean) => {
      if (hasTemplate) {
        return isFirstPage ? 100 : 50;
      }

      const bannerH = isFirstPage ? 90 : 45;
      doc.rect(0, 0, pageW, bannerH).fill(brandOrange);
      doc.rect(0, bannerH, pageW, 3).fill(brandDark);

      if (isFirstPage) {
        let textStartX = margin + 14;

        if (branding?.logoBuffer) {
          try {
            doc.image(branding.logoBuffer, margin + 6, 10, { fit: [70, 70] });
            textStartX = margin + 84;
          } catch (e) {
            console.error("Failed to embed PDF logo in survey:", e);
          }
        } else {
          const logoR = 22;
          const logoX = margin + logoR;
          const logoY = bannerH / 2;
          doc.circle(logoX, logoY, logoR).fill("#FFFFFF");
          doc.fontSize(16).font("Helvetica-Bold").fillColor(brandOrange)
            .text("FP", logoX - 11, logoY - 8, { width: 22, align: "center" });
          textStartX = margin + logoR * 2 + 14;
        }

        const companyName = branding?.companyName || "FASTSIGNS";
        doc.fontSize(20).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text(companyName, textStartX, 20);

        if (branding?.companyAddress) {
          doc.fontSize(10).font("Helvetica").fillColor("rgba(255,255,255,0.85)")
            .text(branding.companyAddress, textStartX, 44);
        }

        doc.fontSize(8).font("Helvetica").fillColor("rgba(255,255,255,0.75)")
          .text(nowEST, margin, 22, { width: contentW, align: "right" });
      }
      return bannerH + 3;
    };

    drawTemplateBackground();
    drawHeader(true);

    let y = 110;
    doc.fontSize(18).font("Helvetica-Bold").fillColor(darkText)
      .text("Site Survey Report", margin, y);
    y += 30;

    doc.fontSize(12).font("Helvetica-Bold").fillColor(darkText)
      .text("Job Name: ", margin, y, { continued: true });
    doc.font("Helvetica").fillColor(medText).text(survey.jobName);
    y += 22;

    if (survey.address) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText)
        .text("Address: ", margin, y, { continued: true });
      doc.font("Helvetica").fillColor(medText).text(survey.address);
      y += 20;
    }

    if (survey.description) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText)
        .text("Description: ", margin, y);
      y += 16;
      doc.font("Helvetica").fillColor(medText)
        .text(survey.description, margin, y, { width: contentW });
      y += doc.heightOfString(survey.description, { width: contentW }) + 10;
    }

    if (survey.generalNotes) {
      doc.fontSize(11).font("Helvetica-Bold").fillColor(darkText)
        .text("General Notes: ", margin, y);
      y += 16;
      doc.font("Helvetica").fillColor(medText)
        .text(survey.generalNotes, margin, y, { width: contentW });
      y += doc.heightOfString(survey.generalNotes, { width: contentW }) + 10;
    }

    // ── Site Assessment Sections ─────────────────────────────────────────────
    const ad = survey.assessmentData as Record<string, any> | null;
    if (ad) {
      const checkNewPage = (needed: number) => {
        if (y + needed > pageH - margin) {
          doc.addPage();
          drawTemplateBackground();
          drawHeader(false);
          y = 60;
        }
      };

      const renderField = (label: string, value: string | undefined) => {
        if (!value) return;
        checkNewPage(20);
        const leftW = 140;
        doc.fontSize(9).font("Helvetica-Bold").fillColor(darkText)
          .text(label + ":", margin + 8, y, { width: leftW, continued: false });
        const valH = doc.heightOfString(value, { width: contentW - leftW - 8 });
        doc.fontSize(9).font("Helvetica").fillColor(medText)
          .text(value, margin + leftW + 8, y, { width: contentW - leftW - 8 });
        y += Math.max(14, valH) + 2;
      };

      const sectionDefs: { title: string; fields: { label: string; key: string; isArray?: boolean }[] }[] = [
        {
          title: "Site Overview",
          fields: [
            { label: "Placement Description", key: "sitePlacementDescription" },
            { label: "Site Covered", key: "siteCovered" },
            { label: "Weather Dependent", key: "siteWeatherDependent" },
          ],
        },
        {
          title: "Safety & Access",
          fields: [
            { label: "Obstructions / Safety", key: "safetyObstructions" },
            { label: "Access Height", key: "accessHeight" },
            { label: "Safety Issues", key: "safetyIssues" },
            { label: "Equipment Needed", key: "ladderLiftRequired" },
          ],
        },
        {
          title: "Wall & Mounting",
          fields: [
            { label: "Wall Surface", key: "wallSurface" },
            { label: "Substrate Condition", key: "substrateCondition" },
            { label: "Mounting Methods", key: "mountingMethods", isArray: true },
          ],
        },
        {
          title: "Electrical",
          fields: [
            { label: "Electric Present", key: "electricPresent" },
            { label: "Electrical Notes", key: "electricalNotes" },
            { label: "Dig Safe Call Needed", key: "digSafeCallNeeded" },
          ],
        },
        {
          title: "Permitting",
          fields: [
            { label: "Permit Required", key: "permitRequired" },
            { label: "Permit Notes", key: "permitNotes" },
          ],
        },
        {
          title: "Sign Audit",
          fields: [
            { label: "Replacement Sign", key: "isReplacementSign" },
            { label: "Removal Scheduled", key: "removalScheduled" },
            { label: "Audit Punch List", key: "signAuditPunchList" },
          ],
        },
        {
          title: "Notes",
          fields: [
            { label: "Punch List", key: "punchList" },
            { label: "Summary Notes", key: "summaryNotes" },
          ],
        },
      ];

      const enumLabels: Record<string, string> = {
        covered: "Covered", not_covered: "Not covered",
        weather_dependent: "Weather dependent", not_weather_dependent: "Not weather dependent",
        yes: "Yes", no: "No", dont_know: "Don't Know",
        none: "None", ladder: "Ladder", lift: "Lift", bucket_truck: "Bucket Truck",
        true: "Yes", false: "No",
      };

      const hasAnySectionData = sectionDefs.some(sec =>
        sec.fields.some(f => {
          const v = ad[f.key];
          return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
        })
      );

      if (hasAnySectionData) {
        checkNewPage(40);
        y += 8;
        doc.rect(margin, y, contentW, 24).fill(brandOrange);
        doc.fontSize(13).font("Helvetica-Bold").fillColor("#FFFFFF")
          .text("Site Assessment", margin + 8, y + 5, { width: contentW - 16 });
        y += 30;

        for (const sec of sectionDefs) {
          const hasData = sec.fields.some(f => {
            const v = ad[f.key];
            return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
          });
          if (!hasData) continue;

          checkNewPage(30);
          doc.fontSize(10).font("Helvetica-Bold").fillColor(brandOrange)
            .text(sec.title, margin, y);
          y += 16;

          for (const field of sec.fields) {
            const raw = ad[field.key];
            if (raw === undefined || raw === null || raw === "") continue;
            let display: string;
            if (field.isArray && Array.isArray(raw)) {
              if (raw.length === 0) continue;
              display = raw.join(", ");
            } else if (typeof raw === "boolean") {
              display = raw ? "Yes" : "No";
            } else {
              display = enumLabels[String(raw)] ?? String(raw);
            }
            renderField(field.label, display);
          }
          y += 6;
        }
        y += 8;
      }
    }

    // ── Survey Photos ─────────────────────────────────────────────────────────
    if (photos.length > 0) {
      if (y + 40 > pageH - margin) {
        doc.addPage();
        drawTemplateBackground();
        drawHeader(false);
        y = 60;
      }
      y += 10;
      doc.rect(margin, y, contentW, 24).fill(brandOrange);
      doc.fontSize(13).font("Helvetica-Bold").fillColor("#FFFFFF")
        .text(`Survey Photos (${photos.length})`, margin + 8, y + 5, { width: contentW - 16 });
      y += 30;

      for (const photo of photos) {
        if (y > pageH - 250) {
          doc.addPage();
          drawTemplateBackground();
          drawHeader(false);
          y = 60;
        }

        try {
          const imgUrl = photo.annotatedImageUrl || photo.originalImageUrl;
          const response = await fetch(imgUrl);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const maxW = contentW;
            const maxH = 300;
            doc.image(buffer, margin, y, { fit: [maxW, maxH], align: "center" });
            y += maxH + 10;
          }
        } catch (e) {
          doc.fontSize(9).fillColor("#999").text("[Image unavailable]", margin, y);
          y += 20;
        }

        if (photo.note) {
          doc.fontSize(10).font("Helvetica-Bold").fillColor(darkText)
            .text("Note: ", margin, y, { continued: true });
          doc.font("Helvetica").fillColor(medText).text(photo.note, { width: contentW });
          y += doc.heightOfString(photo.note, { width: contentW }) + 6;
        }

        const m = photo.measurements as Record<string, string> | null;
        if (m) {
          const mPairs: [string, string][] = [
            ["Width", m.signWidth],
            ["Height", m.signHeight],
            ["Ground to Sign", m.groundToSign],
            ["Sq Footage", m.squareFootage],
            ["Cut Size", m.cutSize],
          ].filter(([, v]) => v) as [string, string][];
          if (mPairs.length > 0) {
            const measLine = mPairs.map(([k, v]) => `${k}: ${v}`).join("  |  ");
            doc.fontSize(9).font("Helvetica").fillColor(medText)
              .text(measLine, margin, y, { width: contentW });
            y += doc.heightOfString(measLine, { width: contentW }) + 8;
          }
        }

        y += 6;
      }
    }
  }

  app.post("/api/surveys/:id/email", requireAuth, async (req, res) => {
    try {
      const survey = await storage.getSurvey(parseInt(req.params.id));
      if (!survey) return res.status(404).json({ error: "Survey not found" });
      const photos = await storage.getSurveyPhotos(survey.id);
      const { recipientEmail, subject, message } = req.body;
      if (!recipientEmail) return res.status(400).json({ error: "Recipient email is required" });

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        doc.on("end", resolve);
        doc.on("error", reject);
        buildSurveyPDF(doc, survey, photos).then(() => doc.end());
      });

      const pdfBuffer = Buffer.concat(chunks);
      const adminId = await resolveAdminId(storage, req.session.userId!);

      await sendEmailForAdmin(adminId, {
        to: recipientEmail,
        subject: subject || `Site Survey: ${survey.jobName}`,
        html: `<p>${(message || `Please find attached the site survey report for ${survey.jobName}.`).replace(/\n/g, "<br>")}</p>`,
        attachments: [{
          filename: `survey-${survey.id}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        }],
      });

      res.json({ success: true, sentTo: recipientEmail });
    } catch (error) {
      console.error("Error emailing survey:", error);
      res.status(500).json({ error: "Failed to email survey" });
    }
  });

  // ─── InstalliQ Asset Backfill ─────────────────────────────────────────────────
  // Super admin must select a specific owner — sync is always tenant-scoped.
  // Owner admin can only sync their own tenant.
  app.post("/api/admin/sync-installiq-assets", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Determine which owner's tenant to sync
      let targetAdminId: number;
      if (user.role === "super_admin") {
        const { ownerId } = req.body as { ownerId?: number };
        if (!ownerId) {
          return res.status(400).json({ error: "ownerId is required for super admin sync" });
        }
        // Verify the target is a real, non-deleted admin
        const ownerCheck = await pool.query(
          `SELECT id, role FROM users WHERE id = $1 AND role = 'admin' AND deleted_at IS NULL`,
          [ownerId]
        );
        if (ownerCheck.rows.length === 0) {
          return res.status(404).json({ error: "Owner not found or not an admin account" });
        }
        targetAdminId = ownerId;
      } else {
        // Owner admin: always their own tenant
        const adminId = await getAdminIdForUserId(user.id);
        if (!adminId) return res.status(403).json({ error: "No admin scope found" });
        targetAdminId = adminId;
      }

      // Fetch all projects belonging to the target admin's tenant
      // (projects created by the admin themselves OR by any user on their team)
      const allProjects = await pool.query(
        `SELECT p.*
         FROM projects p
         JOIN users u ON u.id = p.user_id
         WHERE p.image_urls IS NOT NULL AND array_length(p.image_urls, 1) > 0
           AND u.deleted_at IS NULL
           AND (p.user_id = $1 OR u.created_by = $1)`,
        [targetAdminId]
      );

      let synced = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of allProjects.rows) {
        try {
          const projectUserId: number = row.user_id;
          const project = {
            id: row.id,
            imageUrls: row.image_urls ?? [],
            jobLabel: row.job_label ?? null,
            description: row.description ?? null,
            tags: row.tags ?? [],
            aiSuggestedTags: row.ai_suggested_tags ?? [],
            address: row.address ?? null,
            city: row.city ?? null,
            state: row.state ?? null,
            postalCode: row.postal_code ?? null,
            customerName: row.customer_name ?? null,
            customerPhone: row.customer_phone ?? null,
            customerEmail: row.customer_email ?? null,
            userId: projectUserId,
          };

          // Always store assets under the target admin's ID — ensures correct tenant isolation
          await syncProjectToAssets(project, targetAdminId, projectUserId);
          synced++;
        } catch (err) {
          errors.push(`Project ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      res.json({ synced, skipped, errors, total: allProjects.rows.length });
    } catch (error) {
      console.error("Error in installiq backfill:", error);
      res.status(500).json({ error: "Backfill failed" });
    }
  });

  // ─── In-app Feedback ────────────────────────────────────────────────────────

  app.post("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const { feedbackType, notes, pageUrl, pageTitle } = req.body;
      const userId = (req.session as any).userId as number;
      if (!feedbackType || !pageUrl) return res.status(400).json({ error: "feedbackType and pageUrl are required" });
      if (!["bug", "enhancement"].includes(feedbackType)) return res.status(400).json({ error: "feedbackType must be 'bug' or 'enhancement'" });

      const item = await storage.createFeedbackItem({
        userId,
        pageUrl: pageUrl || "/",
        pageTitle: pageTitle || null,
        feedbackType: feedbackType || "bug",
        notes: notes || null,
        status: "new",
      });
      res.json(item);
    } catch (error) {
      console.error("Error creating feedback:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const rawStatus = typeof req.query.status === "string" ? req.query.status : undefined;
      if (rawStatus && !["new", "accepted", "ignored"].includes(rawStatus)) {
        return res.status(400).json({ error: "status must be one of: new, accepted, ignored" });
      }
      const status = rawStatus;
      const items = await storage.listFeedbackItems(status);
      res.json(items);
    } catch (error) {
      console.error("Error listing feedback:", error);
      res.status(500).json({ error: "Failed to list feedback" });
    }
  });

  app.patch("/api/feedback/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const id = parseInt(req.params.id);
      const { status } = req.body;
      if (!["accepted", "ignored"].includes(status)) return res.status(400).json({ error: "Invalid status — must be 'accepted' or 'ignored'" });
      const updated = await storage.updateFeedbackItemStatus(id, status);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating feedback:", error);
      res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  app.get("/api/feedback/export-csv", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });
      const items = await storage.listFeedbackItems();
      const header = ["ID", "Type", "Status", "Notes", "Page", "Page Title", "User", "Email", "Submitted At"];
      const rows = items.map(i => [
        i.id,
        i.feedbackType,
        i.status,
        (i.notes || "").replace(/"/g, '""'),
        i.pageUrl,
        (i.pageTitle || "").replace(/"/g, '""'),
        (i.userName || "").replace(/"/g, '""'),
        i.userEmail || "",
        i.createdAt ? new Date(i.createdAt).toISOString() : "",
      ].map(v => `"${v}"`).join(","));
      const csv = [header.map(h => `"${h}"`).join(","), ...rows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="feedback-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting feedback:", error);
      res.status(500).json({ error: "Failed to export feedback" });
    }
  });

  app.post("/api/feedback/export-sheets", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== "super_admin") return res.status(403).json({ error: "Forbidden" });

      const clientId = process.env.GOOGLE_CLIENT_ID?.trim().replace(/\\n/g, "");
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim().replace(/\\n/g, "");
      if (!clientId || !clientSecret) {
        return res.status(422).json({ error: "Google OAuth is not configured on this server.", code: "NO_GOOGLE_CONFIG" });
      }

      const accessRow = await pool.query(
        `SELECT google_drive_refresh_token FROM asset_manager_access WHERE owner_id = $1 LIMIT 1`,
        [user.id]
      );
      const refreshToken = accessRow.rows[0]?.google_drive_refresh_token as string | null | undefined;
      if (!refreshToken) {
        return res.status(422).json({ error: "Google account not connected. Connect Google Drive in Asset Manager settings first.", code: "NO_GOOGLE_TOKEN" });
      }

      const { google } = await import("googleapis");
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
      oauth2Client.setCredentials({ refresh_token: refreshToken });

      const sheetsApi = google.sheets({ version: "v4", auth: oauth2Client });
      const items = await storage.listFeedbackItems();

      const headers = [["ID", "Type", "Status", "Notes", "Page URL", "Page Title", "Submitted By", "Email", "Submitted At"]];
      const rows = items.map(i => [
        String(i.id),
        i.feedbackType,
        i.status,
        i.notes || "",
        i.pageUrl,
        i.pageTitle || "",
        i.userName || "",
        i.userEmail || "",
        i.createdAt ? new Date(i.createdAt).toISOString() : "",
      ]);

      const createResp = await sheetsApi.spreadsheets.create({
        requestBody: {
          properties: { title: `InstalliQ Feedback — ${new Date().toLocaleDateString()}` },
          sheets: [{ properties: { title: "Feedback" } }],
        },
      });

      const spreadsheetId = createResp.data.spreadsheetId!;
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range: "Feedback!A1",
        valueInputOption: "RAW",
        requestBody: { values: [...headers, ...rows] },
      });

      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      res.json({ url: sheetUrl, spreadsheetId });
    } catch (error: any) {
      console.error("Error exporting to Google Sheets:", error);
      if (error?.code === 401 || error?.status === 401) {
        return res.status(422).json({ error: "Google token expired. Reconnect Google Drive in Asset Manager settings.", code: "TOKEN_EXPIRED" });
      }
      res.status(500).json({ error: "Failed to export to Google Sheets" });
    }
  });

  // Asset Manager module — single combined router mounted at /api
  const { assetManagerRouter } = await import("./asset-manager/index");
  app.use("/api", assetManagerRouter);

  return httpServer;
}
