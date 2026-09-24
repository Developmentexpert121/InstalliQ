import OpenAI from "openai";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

export interface OwnerSettings {
  businessAddress?: string | null;
  installationRange?: string | null;
  chargeTravelTime?: string | null;
  setupCleanupTime?: string | null;
  installTimeStandards?: string | null;
  additionalNotes?: string | null;
  hasBucketTruck?: string | null;
  ladderMaxHeight?: string | null;
  signTypes?: string[] | null;
}

export interface WorkOrderData {
  workOrderNumber: string | null;
  invoiceNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  pocName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  description: string | null;
  signTypes: string[];
  dimensions: string[];
  quantity: number;
  installationNotes: string | null;
  salesName: string | null;
  salesPhone: string | null;
  salesEmail: string | null;
  productDueDate: string | null;
  productDueTime: string | null;
  designDueDate: string | null;
  createdDate: string | null;
}

export interface ProofData {
  invoiceNumber: string | null;
  customerName: string | null;
  projectName: string | null;
  signTypes: string[];
  dimensions: string[];
  quantity: number;
}

export interface InstallTimeEstimate {
  estimatedHours: number;
  estimatedMinutes: number;
  reasoning: string;
  complexity: "simple" | "moderate" | "complex";
  recommendedCrewSize: number;
  estimatedTravelMinutes?: number;
}

export interface ParsedEventData {
  workOrder: WorkOrderData;
  installTime: InstallTimeEstimate;
  suggestedDate: string | null;
  suggestedStartTime: string | null;
}

async function convertPdfToImages(pdfPath: string): Promise<string[]> {
  const outputDir = path.dirname(pdfPath);
  const baseName = path.basename(pdfPath, ".pdf");
  const outputPattern = path.join(outputDir, `${baseName}-page`);

  try {
    await execAsync(`pdftoppm -png -r 150 "${pdfPath}" "${outputPattern}"`);
    
    const files = fs.readdirSync(outputDir);
    const imageFiles = files
      .filter(f => f.startsWith(`${baseName}-page`) && f.endsWith(".png"))
      .sort()
      .map(f => path.join(outputDir, f));
    
    return imageFiles;
  } catch (error) {
    console.error("PDF to image conversion failed (pdftoppm may not be installed):", error);
    return [];
  }
}

async function imageToBase64(imagePath: string): Promise<string> {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

async function extractWithPdfText(pdfPath: string, systemPrompt: string): Promise<string> {
  let pdfParse: any;
  try {
    pdfParse = require("pdf-parse");
  } catch (requireErr) {
    console.error("pdf-parse require failed, trying dynamic import:", requireErr);
    const pdfParseModule = await import("pdf-parse");
    pdfParse = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule;
  }
  if (typeof pdfParse !== 'function') {
    console.error("pdf-parse resolved to non-function:", typeof pdfParse, Object.keys(pdfParse || {}));
    throw new Error("pdf-parse module did not resolve to a callable function");
  }
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(pdfBuffer);
  const pdfText = pdfData.text;

  if (!pdfText || pdfText.trim().length === 0) {
    console.warn("PDF text extraction returned empty content");
    return "{}";
  }

  console.log(`Extracted ${pdfText.length} characters from PDF via pdf-parse`);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please extract the work order information from this document text:\n\n${pdfText.substring(0, 15000)}`,
      },
    ],
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });

  return response.choices[0]?.message?.content || "{}";
}

export async function extractWorkOrderData(pdfPath: string, additionalPdfPaths: string[] = []): Promise<WorkOrderData> {
  const allPdfPaths = [pdfPath, ...additionalPdfPaths];
  let allImageFiles: string[] = [];
  
  for (const pp of allPdfPaths) {
    try {
      const imgs = await convertPdfToImages(pp);
      allImageFiles.push(...imgs);
    } catch (error) {
      console.error(`PDF conversion error for ${pp}:`, error);
    }
  }
  
  console.log(`Converted ${allPdfPaths.length} PDF(s) into ${allImageFiles.length} page image(s)`);
  
  let useFileUpload = allImageFiles.length === 0;

  const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = [];
  
  if (!useFileUpload) {
    for (const imagePath of allImageFiles.slice(0, 10)) {
      const base64 = await imageToBase64(imagePath);
      imageContents.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64}`,
          detail: "high"
        }
      });
    }
  }

  const systemPrompt = `You are a document parser for FASTSIGNS of Waltham work orders and invoices. You may receive MULTIPLE documents at once (work orders, invoices, proof/design images). Analyze ALL provided pages/images together to extract the most complete information.

These documents typically have:

WORK ORDER FORMAT (XXX-XXXXX):
- Header: "WORK ORDER" followed by number like "401-50752"
- "Salesperson:" name (e.g., "Brendan Donovan")
- "Order Contact" section with name, phone, email (this is the POC)
- "Bill To" section with billing address and company name
- "Installed" section with INSTALLATION ADDRESS (use this for location)
- "Order Description" with location/project name
- "Product Quantity" and "Product Name" fields
- "PARTS" section with dimensions like "6" w x 8" h"

INVOICE FORMAT (XXX-XXXXX):
- Header: the single word "INVOICE" followed by an invoice number on the next line like "401-50896" (same XXX-XXXXX pattern as work orders, but the document is titled INVOICE not WORK ORDER)
- "Bill To:" section with the customer/company billing address
- "Installed:" section with the installation address (use this for location)
- "DESCRIPTION:" line summarizing the work
- May include line items, totals, and "Date Due" / "Invoice Date" fields
- The invoice number IS the job identifier for this install — extract it as invoiceNumber.

PROOF/DESIGN/ESTIMATE FORMAT:
- May have "INVOICE NUMBER" or "Estimate #" like "EST-50752"
- Customer name at bottom
- PROJECT name
- Dimensions and quantities shown on design

EXTRACTION RULES:
1. For workOrderNumber: ONLY set this when the document header literally says "WORK ORDER" followed by an XXX-XXXXX number. Do not guess from invoices.
2. For invoiceNumber: Set this when (a) the document header is "INVOICE" followed by an XXX-XXXXX number (e.g., "401-50896"), OR (b) you see an explicit "INVOICE NUMBER:" / "Invoice #" / "Estimate #" label (e.g., "EST-50752"). Prefer the standalone "INVOICE" header number when both could apply.
3. For customerName: Look in "Bill To" section company name
4. For pocName: Look in "Order Contact" section for the contact name
5. For customerPhone: Look in "Order Contact" section - format like (XXX) XXX-XXXX
6. For customerEmail: CRITICAL - Look in the "Order Contact" section on the VERY FIRST PAGE ONLY. The email is often split across TWO lines - the username part (like "john.doe") appears on one line, and "@domain.com" appears on the NEXT line below it. You MUST combine these two parts into one email address. This first-page Order Contact email takes PRIORITY over any other email found on subsequent pages. If you see a different email on page 2/3/4 (like in the "Order Contact" on later product pages), still use the email from page 1
7. For salesName: Look for "Salesperson:" field
8. For INSTALLATION address: Use the "Installed:" section address, NOT the "Bill To" address
9. For signTypes: Extract product names like "ADA Signs", "Channel Letters", "Window Graphics"
10. For dimensions: Look for patterns like "6" x 8"" or "6" w x 8" h"
11. For quantity: Look for "Product Quantity:" or "QTY" values - SUM all quantities
12. For installationNotes: Include special notes about installation, materials, braille, etc.
13. For productDueDate: Look for "Product Due:" field on ALL pages. If multiple pages have different Product Due dates, use the EARLIEST date (the soonest one). This is the date the first product is ready for installation. Format as YYYY-MM-DD
14. For productDueTime: From the EARLIEST "Product Due:" field, extract the time portion. Format as HH:MM in 24-hour format (e.g., "15:00" for 3:00 pm). IMPORTANT: Convert the time accurately - "3:00 pm" = "15:00", "9:00 am" = "09:00"
15. For designDueDate: Look for "Design Due:" field. Format as YYYY-MM-DD
16. For createdDate: Look for "Created:" field. Format as YYYY-MM-DD

Return your response as a JSON object with these exact fields:
{
  "workOrderNumber": string or null (e.g., "401-50752"),
  "invoiceNumber": string or null (e.g., "EST-50752"),
  "customerName": string or null (company from Bill To),
  "customerPhone": string or null,
  "customerEmail": string or null,
  "pocName": string or null (contact name from Order Contact),
  "address": string or null (street address from Installed section),
  "city": string or null,
  "state": string or null (use 2-letter code like "MA"),
  "postalCode": string or null,
  "description": string or null (order description),
  "signTypes": string[] (list of sign types),
  "dimensions": string[] (list of dimensions),
  "quantity": number (total quantity of all items),
  "installationNotes": string or null,
  "salesName": string or null,
  "salesPhone": string or null,
  "salesEmail": string or null,
  "productDueDate": string or null (YYYY-MM-DD format, from "Product Due:" field),
  "productDueTime": string or null (HH:MM 24-hour format, from "Product Due:" field),
  "designDueDate": string or null (YYYY-MM-DD format, from "Design Due:" field),
  "createdDate": string or null (YYYY-MM-DD format, from "Created:" field)
}`;

  let content: string;

  if (useFileUpload) {
    console.log("Using text-based PDF processing (pdftoppm not available)");
    let combinedText = "";
    for (const pp of allPdfPaths) {
      try {
        let pdfParse: any;
        try {
          pdfParse = require("pdf-parse");
        } catch (requireErr) {
          const pdfParseModule = await import("pdf-parse");
          pdfParse = typeof pdfParseModule.default === 'function' ? pdfParseModule.default : pdfParseModule;
        }
        if (typeof pdfParse === 'function') {
          const pdfBuffer = fs.readFileSync(pp);
          const pdfData = await pdfParse(pdfBuffer);
          if (pdfData.text && pdfData.text.trim().length > 0) {
            combinedText += `\n--- FILE: ${path.basename(pp)} ---\n${pdfData.text}`;
          }
        }
      } catch (err) {
        console.error(`Failed to parse text from ${pp}:`, err);
      }
    }
    if (combinedText.trim().length > 0) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Please extract the work order information from these ${allPdfPaths.length} document(s):\n\n${combinedText.substring(0, 15000)}`,
          },
        ],
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });
      content = response.choices[0]?.message?.content || "{}";
    } else {
      content = "{}";
    }
  } else {
    const docLabel = allPdfPaths.length > 1
      ? `Please extract the work order information from these ${allPdfPaths.length} documents (work order + proof/design files). Combine information from all pages:`
      : "Please extract the work order information from this document:";
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: docLabel },
            ...imageContents
          ]
        }
      ],
      max_tokens: 2000,
      response_format: { type: "json_object" }
    });

    content = response.choices[0]?.message?.content || "{}";
  }
  
  for (const imagePath of allImageFiles) {
    try { fs.unlinkSync(imagePath); } catch {}
  }

  try {
    const parsed = JSON.parse(content);
    return {
      workOrderNumber: parsed.workOrderNumber || null,
      invoiceNumber: parsed.invoiceNumber || null,
      customerName: parsed.customerName || null,
      customerPhone: parsed.customerPhone || null,
      customerEmail: parsed.customerEmail || null,
      pocName: parsed.pocName || null,
      address: parsed.address || null,
      city: parsed.city || null,
      state: parsed.state || null,
      postalCode: parsed.postalCode || null,
      description: parsed.description || null,
      signTypes: parsed.signTypes || [],
      dimensions: parsed.dimensions || [],
      quantity: parsed.quantity || 1,
      installationNotes: parsed.installationNotes || null,
      salesName: parsed.salesName || null,
      salesPhone: parsed.salesPhone || null,
      salesEmail: parsed.salesEmail || null,
      productDueDate: parsed.productDueDate || null,
      productDueTime: parsed.productDueTime || null,
      designDueDate: parsed.designDueDate || null,
      createdDate: parsed.createdDate || null,
    };
  } catch {
    return {
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
      description: null,
      signTypes: [],
      dimensions: [],
      quantity: 1,
      installationNotes: null,
      salesName: null,
      salesPhone: null,
      salesEmail: null,
      productDueDate: null,
      productDueTime: null,
      designDueDate: null,
      createdDate: null,
    };
  }
}

export async function calculateInstallTime(workOrder: WorkOrderData, userPrompt: string, ownerSettings?: OwnerSettings): Promise<InstallTimeEstimate> {
  const ownerContext = ownerSettings ? `
OWNER/BUSINESS SETTINGS (use these for accurate estimates):
- Business Address (departure point for travel): ${ownerSettings.businessAddress || "Not specified"}
- Installation Service Range: ${ownerSettings.installationRange || "Not specified"}
- Charge Travel Time: ${ownerSettings.chargeTravelTime || "Not specified"}
- Setup/Cleanup Time to add: ${ownerSettings.setupCleanupTime || "Not specified"}
- Has Bucket Truck: ${ownerSettings.hasBucketTruck || "Not specified"}
- Max Ladder Height: ${ownerSettings.ladderMaxHeight || "Not specified"}
${ownerSettings.installTimeStandards ? `- Owner's Install Time Standards: ${ownerSettings.installTimeStandards}` : ""}
${ownerSettings.additionalNotes ? `- Owner's Additional Notes: ${ownerSettings.additionalNotes}` : ""}
${ownerSettings.signTypes?.length ? `- Sign Types This Business Handles: ${ownerSettings.signTypes.join(", ")}` : ""}
` : "";

  const prompt = `You are an expert sign installation time estimator for FASTSIGNS of Waltham. Based on the work order details, owner settings, and any additional context, estimate how long the installation will take.

Work Order Details:
- Sign Types: ${workOrder.signTypes.join(", ") || "Not specified"}
- Dimensions: ${workOrder.dimensions.join(", ") || "Not specified"}
- Quantity: ${workOrder.quantity}
- Description: ${workOrder.description || "Not specified"}
- Installation Notes: ${workOrder.installationNotes || "None"}
- Installation Address: ${[workOrder.address, workOrder.city, workOrder.state, workOrder.postalCode].filter(Boolean).join(", ") || "Not specified"}
${ownerContext}
User's Additional Context: ${userPrompt}

FASTSIGNS INSTALLATION TIME GUIDELINES (use owner's standards above if provided, otherwise use these defaults):
- ADA Signs (with braille): 10-15 min per sign for simple foam tape mount
- ADA Signs (complex mounting): 20-30 min per sign
- Channel Letters: 2-4 hours for standard set (higher = more time)
- Monument Signs: 4-8 hours depending on size
- Window Graphics/Vinyl: 30-60 min per window
- Vehicle Wraps: 4-8 hours per vehicle
- Banners: 15-30 min each
- Dimensional Letters (acrylic): 30-60 min per set
- Wayfinding Signs: 15-20 min each

Consider these factors:
1. Sign type complexity
2. Height and accessibility (ladder vs lift needed)
3. Surface type (drywall/masonry/glass/exterior)
4. Number of items to install
5. Travel time from business address to installation location (estimate based on addresses provided)
6. Crew size needed
7. Setup and cleanup time (per owner settings if provided)

For the example: 4 ADA signs (3 at 6x8", 1 at 4x6") with foam tape = ~45 min to 1 hour install time

IMPORTANT: Include estimated travel time in your reasoning. If the owner's business address and the job installation address are both provided, estimate the driving time between them and factor it into the total.

Return a JSON object:
{
  "estimatedHours": number (whole hours),
  "estimatedMinutes": number (0, 15, 30, or 45),
  "reasoning": string (brief explanation including travel time estimate),
  "complexity": "simple" | "moderate" | "complex",
  "recommendedCrewSize": number (1-4),
  "estimatedTravelMinutes": number (estimated one-way travel time in minutes, 0 if unknown)
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a FASTSIGNS installation time calculator. Always respond with valid JSON." },
      { role: "user", content: prompt }
    ],
    max_tokens: 500,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    const parsed = JSON.parse(content);
    return {
      estimatedHours: parsed.estimatedHours || 1,
      estimatedMinutes: parsed.estimatedMinutes || 0,
      reasoning: parsed.reasoning || "Standard installation estimate",
      complexity: parsed.complexity || "moderate",
      recommendedCrewSize: parsed.recommendedCrewSize || 2,
      estimatedTravelMinutes: parsed.estimatedTravelMinutes || 0,
    };
  } catch {
    return {
      estimatedHours: 2,
      estimatedMinutes: 0,
      reasoning: "Default estimate - could not parse AI response",
      complexity: "moderate",
      recommendedCrewSize: 2
    };
  }
}

export async function parseUserPrompt(prompt: string): Promise<{ preferredDate: string | null; preferredTime: string | null }> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `Extract any date and time preferences from the user's message. Today is ${new Date().toISOString().split('T')[0]}.

Return JSON:
{
  "preferredDate": "YYYY-MM-DD" or null,
  "preferredTime": "HH:MM" (24-hour) or null
}

Examples:
- "install next Tuesday at 9am" -> {"preferredDate": "2026-01-27", "preferredTime": "09:00"}
- "schedule for January 25th" -> {"preferredDate": "2026-01-25", "preferredTime": null}
- "morning install" -> {"preferredDate": null, "preferredTime": "09:00"}`
      },
      { role: "user", content: prompt }
    ],
    max_tokens: 200,
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content || "{}";
  
  try {
    return JSON.parse(content);
  } catch {
    return { preferredDate: null, preferredTime: null };
  }
}

export async function extractProofData(pdfPath: string): Promise<ProofData> {
  let imageFiles: string[] = [];
  
  try {
    imageFiles = await convertPdfToImages(pdfPath);
  } catch (error) {
    console.error("PDF conversion error:", error);
  }
  
  let useFileUpload = imageFiles.length === 0;

  const proofSystemPrompt = `You are a document parser for FASTSIGNS proof/design documents. Extract the following:

1. invoiceNumber: Look for "INVOICE NUMBER:" followed by "EST-XXXXX" or similar pattern
2. customerName: Look for "CUSTOMER:" field
3. projectName: Look for "PROJECT:" field
4. signTypes: Extract sign/product types from design (e.g., "ADA Signs", "Dimensional Letters")
5. dimensions: Look for dimension patterns like "6" x 8"" or "6"w x 8"h"
6. quantity: Look for "QTY" values

Return JSON:
{
  "invoiceNumber": string or null,
  "customerName": string or null,
  "projectName": string or null,
  "signTypes": string[],
  "dimensions": string[],
  "quantity": number
}`;

  let content: string;

  if (useFileUpload) {
    console.log("Using text-based PDF processing for proof");
    content = await extractWithPdfText(pdfPath, proofSystemPrompt);
  } else {
    const imageContents: OpenAI.Chat.ChatCompletionContentPart[] = [];
    
    for (const imagePath of imageFiles.slice(0, 2)) {
      const base64 = await imageToBase64(imagePath);
      imageContents.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64}`,
          detail: "high"
        }
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: proofSystemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Please extract the proof information from this document:" },
            ...imageContents
          ]
        }
      ],
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    content = response.choices[0]?.message?.content || "{}";
  }
  
  for (const imagePath of imageFiles) {
    try { fs.unlinkSync(imagePath); } catch {}
  }

  try {
    const parsed = JSON.parse(content);
    return {
      invoiceNumber: parsed.invoiceNumber || null,
      customerName: parsed.customerName || null,
      projectName: parsed.projectName || null,
      signTypes: parsed.signTypes || [],
      dimensions: parsed.dimensions || [],
      quantity: parsed.quantity || 1
    };
  } catch {
    return {
      invoiceNumber: null,
      customerName: null,
      projectName: null,
      signTypes: [],
      dimensions: [],
      quantity: 1
    };
  }
}

export interface AssistantScheduleResult {
  estimatedHours: number;
  estimatedMinutes: number;
  complexity: string;
  recommendedCrewSize: number;
  reasoning: string;
  suggestedDate: string | null;
  suggestedTime: string | null;
  additionalNotes: string | null;
}

export async function generateScheduleWithAssistant(
  workOrderData: WorkOrderData,
  userPrompt: string,
  adminAssistantId?: string | null,
  ownerSettings?: OwnerSettings
): Promise<AssistantScheduleResult> {
  const effectiveAssistantId = adminAssistantId || ASSISTANT_ID;
  if (!effectiveAssistantId) {
    console.warn("No assistant ID available, falling back to standard AI");
    const installTime = await calculateInstallTime(workOrderData, userPrompt, ownerSettings);
    const datePrefs = userPrompt && userPrompt.trim().length > 0
      ? await parseUserPrompt(userPrompt)
      : { preferredDate: null, preferredTime: null };
    return {
      estimatedHours: installTime.estimatedHours,
      estimatedMinutes: installTime.estimatedMinutes,
      complexity: installTime.complexity,
      recommendedCrewSize: installTime.recommendedCrewSize,
      reasoning: installTime.reasoning,
      suggestedDate: datePrefs.preferredDate || workOrderData.productDueDate || null,
      suggestedTime: datePrefs.preferredTime || workOrderData.productDueTime || null,
      additionalNotes: null,
    };
  }

  try {
    const thread = await openai.beta.threads.create();

    const hasUserDatePreference = userPrompt && userPrompt.trim().length > 0 && /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|\d{1,2}(st|nd|rd|th)?|morning|afternoon|evening|night|\d{1,2}\s*(am|pm)|at\s+\d)/i.test(userPrompt);

    const dateInstructions = hasUserDatePreference
      ? `The user has specified date/time preferences in their request below - USE THOSE as the priority for suggestedDate and suggestedTime.`
      : workOrderData.productDueDate
        ? `IMPORTANT: The user has NOT specified any date/time preference. The work order has a "Product Due" date of ${workOrderData.productDueDate}${workOrderData.productDueTime ? ` at ${workOrderData.productDueTime}` : ""}. Use the Product Due date as the suggestedDate (this is when the product is ready for installation). For suggestedTime, use the Product Due time if available, otherwise default to 09:00. You MUST return these dates - do NOT return null for suggestedDate.`
        : `The user has NOT specified any date/time preference and no Product Due date was found in the work order. Use today's date or the next business day as the suggestedDate with a default time of 09:00.`;

    const ownerContext = ownerSettings ? `
Business/Owner Settings:
- Business Address (departure point): ${ownerSettings.businessAddress || "N/A"}
- Installation Range: ${ownerSettings.installationRange || "N/A"}
- Charge Travel Time: ${ownerSettings.chargeTravelTime || "N/A"}
- Setup/Cleanup Time: ${ownerSettings.setupCleanupTime || "N/A"}
- Has Bucket Truck: ${ownerSettings.hasBucketTruck || "N/A"}
- Max Ladder Height: ${ownerSettings.ladderMaxHeight || "N/A"}
${ownerSettings.installTimeStandards ? `- Install Time Standards: ${ownerSettings.installTimeStandards}` : ""}
${ownerSettings.additionalNotes ? `- Additional Notes: ${ownerSettings.additionalNotes}` : ""}
` : "";

    const messageContent = `Please analyze this FASTSIGNS work order and provide scheduling recommendations.

Work Order Details:
- Work Order #: ${workOrderData.workOrderNumber || "N/A"}
- Invoice #: ${workOrderData.invoiceNumber || "N/A"}
- Customer: ${workOrderData.customerName || "N/A"}
- Installation Address: ${[workOrderData.address, workOrderData.city, workOrderData.state, workOrderData.postalCode].filter(Boolean).join(", ") || "N/A"}
- Sign Types: ${workOrderData.signTypes.length > 0 ? workOrderData.signTypes.join(", ") : "Not specified"}
- Dimensions: ${workOrderData.dimensions.length > 0 ? workOrderData.dimensions.join(", ") : "Not specified"}
- Quantity: ${workOrderData.quantity}
- Description: ${workOrderData.description || "N/A"}
- Installation Notes: ${workOrderData.installationNotes || "None"}
- Product Due Date: ${workOrderData.productDueDate || "N/A"}${workOrderData.productDueTime ? ` at ${workOrderData.productDueTime}` : ""}
- Design Due Date: ${workOrderData.designDueDate || "N/A"}
- Order Created: ${workOrderData.createdDate || "N/A"}
${ownerContext}
${dateInstructions}

IMPORTANT: Estimate travel time from the business address to the installation address and include it in your reasoning and time estimate.

User Request: ${userPrompt || "No specific request - use work order dates"}

Today's date: ${new Date().toISOString().split("T")[0]}

Please respond with a JSON object containing:
{
  "estimatedHours": number,
  "estimatedMinutes": number (0, 15, 30, or 45),
  "complexity": "simple" | "moderate" | "complex",
  "recommendedCrewSize": number (1-4),
  "reasoning": "brief explanation of your estimate",
  "suggestedDate": "YYYY-MM-DD" (REQUIRED - use Product Due date from work order if user didn't specify a preference),
  "suggestedTime": "HH:MM" (24-hour format, use Product Due time or default 09:00),
  "additionalNotes": "any additional scheduling notes" or null
}`;

    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: messageContent,
    });

    let run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: effectiveAssistantId,
    });

    const startTime = Date.now();
    const timeout = 60000;
    while (run.status === "queued" || run.status === "in_progress") {
      if (Date.now() - startTime > timeout) {
        console.error("Assistant run timed out");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await openai.beta.threads.runs.retrieve(run.id, { thread_id: thread.id });
    }

    if (run.status === "completed") {
      const messages = await openai.beta.threads.messages.list(thread.id);
      const assistantMessage = messages.data.find((m) => m.role === "assistant");

      if (assistantMessage && assistantMessage.content[0]?.type === "text") {
        const responseText = assistantMessage.content[0].text.value;

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
              estimatedHours: parsed.estimatedHours || 1,
              estimatedMinutes: parsed.estimatedMinutes || 0,
              complexity: parsed.complexity || "moderate",
              recommendedCrewSize: parsed.recommendedCrewSize || 2,
              reasoning: parsed.reasoning || "Assistant estimate",
              suggestedDate: parsed.suggestedDate || null,
              suggestedTime: parsed.suggestedTime || null,
              additionalNotes: parsed.additionalNotes || null,
            };
          } catch (parseError) {
            console.error("Failed to parse assistant JSON response:", parseError);
          }
        }
      }
    } else {
      console.error("Assistant run failed with status:", run.status);
    }
  } catch (error) {
    console.error("Assistant API error, falling back to standard AI:", error);
  }

  const installTime = await calculateInstallTime(workOrderData, userPrompt, ownerSettings);
  const datePrefs = userPrompt && userPrompt.trim().length > 0
    ? await parseUserPrompt(userPrompt)
    : { preferredDate: null, preferredTime: null };
  return {
    estimatedHours: installTime.estimatedHours,
    estimatedMinutes: installTime.estimatedMinutes,
    complexity: installTime.complexity,
    recommendedCrewSize: installTime.recommendedCrewSize,
    reasoning: installTime.reasoning,
    suggestedDate: datePrefs.preferredDate || workOrderData.productDueDate || null,
    suggestedTime: datePrefs.preferredTime || workOrderData.productDueTime || null,
    additionalNotes: null,
  };
}
