import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, serial, integer, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// User roles
export const userRoleEnum = z.enum(["user", "admin", "super_admin"]);
export type UserRole = z.infer<typeof userRoleEnum>;

// Job titless
export const JOB_TITLE_OPTIONS = [
  "Designer",
  "Install Manager",
  "Installer",
  "Production",
  "Project Manager",
  "Sales",
  "Sub-Contract Installer",
] as const;

// Users table with username/password auth and roles
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull().default("user"),
  isMaster: text("is_master").notNull().default("false"),
  tempPassword: text("temp_password"),
  jobTitle: text("job_title"),
  location: text("location"),
  createdBy: integer("created_by"),
  faceDescriptor: text("face_descriptor"),
  facePhoto: text("face_photo"),
  faceEnabled: boolean("face_enabled").notNull().default(false),
  faceRegisteredAt: timestamp("face_registered_at"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  openaiAssistantId: text("openai_assistant_id"),
  googleId: text("google_id"),
  googleEmail: text("google_email"),
  googleEnabled: boolean("google_enabled").notNull().default(false),
  signsuiteiqUserId: integer("signsuiteiq_user_id").unique(),
  signsuiteiqAdminId: integer("signsuiteiq_admin_id"),
  paymentRequired: boolean("payment_required").notNull().default(false),
  paymentCompleted: boolean("payment_completed").notNull().default(false),
  senderFirstName: text("sender_first_name"),
  senderFromEmail: text("sender_from_email"),
  senderReplyTo: text("sender_reply_to"),
  senderCompanyAddress: text("sender_company_address"),
  senderCity: text("sender_city"),
  senderCountry: text("sender_country"),
  senderNickname: text("sender_nickname"),
  senderVerified: boolean("sender_verified").notNull().default(false),
  sendgridSenderId: integer("sendgrid_sender_id"),
  pdfLogoUrl: text("pdf_logo_url"),
  pdfTemplateUrl: text("pdf_template_url"),
  pdfCompanyName: text("pdf_company_name"),
  pdfCompanyAddress: text("pdf_company_address"),
  pdfCompanyPhone: text("pdf_company_phone"),
  pdfCompanyEmail: text("pdf_company_email"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: timestamp("deleted_at"),
});

// Project tags
export const TAG_OPTIONS = [
  "ADA",
  "Channel Letters",
  "Dimensional Letters",
  "Door Lettering",
  "Drop Offs",
  "Exterior Signs",
  "Light Box",
  "Parking Signs",
  "Post and Panel Signs",
  "Site Signs",
  "Site Survey",
  "Trade Show Graphics",
  "Traffic Signs",
  "Vehicle Graphics",
  "Wall Graphics",
  "Window Graphics",
] as const;

export type TagOption = typeof TAG_OPTIONS[number];

// Projects table
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  imageUrls: text("image_urls").array().notNull().default(sql`ARRAY[]::text[]`),
  description: text("description"),
  jobLabel: text("job_label"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  aiSuggestedTags: text("ai_suggested_tags").array().default(sql`ARRAY[]::text[]`),
  hasIssue: boolean("has_issue").notNull().default(false),
  issueDescription: text("issue_description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Address and location fields for weather/map integration
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  hasFinishedPhotos: boolean("has_finished_photos").notNull().default(false),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
}));

// Calendar events (for simple calendar view)
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  jobDescription: text("job_description"),
  date: timestamp("date").notNull(),
  projectId: integer("project_id").references(() => projects.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: text("status").default("SCHEDULED"),
  address: text("address"),
  hasIssue: boolean("has_issue").notNull().default(false),
  issueDescription: text("issue_description"),
  workJobNumber: text("work_job_number"),
  confirmationToken: text("confirmation_token"),
  createdBy: integer("created_by"),
  weatherTemp: integer("weather_temp"),
  weatherFeelsLike: integer("weather_feels_like"),
  weatherCondition: text("weather_condition"),
  weatherHumidity: integer("weather_humidity"),
  weatherWindSpeed: integer("weather_wind_speed"),
  weatherIcon: text("weather_icon"),
  weatherFetchedAt: timestamp("weather_fetched_at"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  secondaryPocName: text("secondary_poc_name"),
  secondaryPocPhone: text("secondary_poc_phone"),
  secondaryPocEmail: text("secondary_poc_email"),
});

// Weather cache table for reducing API calls
export const weatherCache = pgTable("weather_cache", {
  id: serial("id").primaryKey(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  timeBucket: text("time_bucket").notNull(),
  provider: text("provider").notNull(),
  payloadJson: text("payload_json").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Jobs table - stores work order and customer information
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  workOrderNumber: text("work_order_number"),
  invoiceNumber: text("invoice_number"),
  jobName: text("job_name"),
  description: text("description"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  formattedAddress: text("formatted_address"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  customerName: text("customer_name"),
  pocName: text("poc_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  secondaryPocName: text("secondary_poc_name"),
  secondaryPocPhone: text("secondary_poc_phone"),
  secondaryPocEmail: text("secondary_poc_email"),
  salesName: text("sales_name"),
  salesEmail: text("sales_email"),
  salesPhone: text("sales_phone"),
  notes: text("notes"),
  status: text("status").default("DRAFT"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Install Events table - scheduling for jobs
export const installEvents = pgTable("install_events", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id).notNull(),
  calendarEventId: integer("calendar_event_id").references(() => calendarEvents.id),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  status: text("status").default("SCHEDULED"),
  assignedInstallerId: integer("assigned_installer_id").references(() => users.id),
  gptEstimateMinutes: integer("gpt_estimate_minutes"),
  estimateConfidence: text("estimate_confidence"),
  estimateSummary: text("estimate_summary"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Attachments table - work orders and proofs
export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => jobs.id).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type"),
  category: text("category").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Notification logs table - email tracking
export const notificationLogs = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  toEmail: text("to_email").notNull(),
  ccEmails: text("cc_emails"),
  subject: text("subject"),
  status: text("status").notNull(),
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  jobId: integer("job_id").references(() => jobs.id),
  eventId: integer("event_id").references(() => installEvents.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Job relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  installEvents: many(installEvents),
  attachments: many(attachments),
  notificationLogs: many(notificationLogs),
}));

export const installEventsRelations = relations(installEvents, ({ one }) => ({
  job: one(jobs, {
    fields: [installEvents.jobId],
    references: [jobs.id],
  }),
  calendarEvent: one(calendarEvents, {
    fields: [installEvents.calendarEventId],
    references: [calendarEvents.id],
  }),
  assignedInstaller: one(users, {
    fields: [installEvents.assignedInstallerId],
    references: [users.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  job: one(jobs, {
    fields: [attachments.jobId],
    references: [jobs.id],
  }),
}));

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  job: one(jobs, {
    fields: [notificationLogs.jobId],
    references: [jobs.id],
  }),
  event: one(installEvents, {
    fields: [notificationLogs.eventId],
    references: [installEvents.id],
  }),
}));

// Attachment categories
export const ATTACHMENT_CATEGORIES = ["WORK_ORDER", "PROOF"] as const;
export type AttachmentCategory = typeof ATTACHMENT_CATEGORIES[number];

// Job status options
export const JOB_STATUS_OPTIONS = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type JobStatus = typeof JOB_STATUS_OPTIONS[number];

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
});

export const insertWeatherCacheSchema = createInsertSchema(weatherCache).omit({
  id: true,
  createdAt: true,
});

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInstallEventSchema = createInsertSchema(installEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAttachmentSchema = createInsertSchema(attachments).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationLogSchema = createInsertSchema(notificationLogs).omit({
  id: true,
  createdAt: true,
});

// Login schema
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Create user schema (for admin to add users)
export const createUserSchema = z.object({
  username: z.string().min(2, "Username must be at least 2 characters"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  role: userRoleEnum.default("user"),
  location: z.string().optional(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertWeatherCache = z.infer<typeof insertWeatherCacheSchema>;
export type WeatherCache = typeof weatherCache.$inferSelect;
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobs.$inferSelect;
export type InsertInstallEvent = z.infer<typeof insertInstallEventSchema>;
export type InstallEvent = typeof installEvents.$inferSelect;
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;
export type InsertNotificationLog = z.infer<typeof insertNotificationLogSchema>;
export type NotificationLog = typeof notificationLogs.$inferSelect;

// Event status options
export const EVENT_STATUS_OPTIONS = [
  "SCHEDULED",
  "CONFIRMED", 
  "NEEDS_RESCHEDULE",
  "COMPLETED",
  "ISSUE",
] as const;
export type EventStatus = typeof EVENT_STATUS_OPTIONS[number];

// Event assignments - many-to-many between calendar events and users
export const eventAssignments = pgTable("event_assignments", {
  id: serial("id").primaryKey(),
  calendarEventId: integer("calendar_event_id").references(() => calendarEvents.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  assignedAt: timestamp("assigned_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const eventAssignmentsRelations = relations(eventAssignments, ({ one }) => ({
  calendarEvent: one(calendarEvents, {
    fields: [eventAssignments.calendarEventId],
    references: [calendarEvents.id],
  }),
  user: one(users, {
    fields: [eventAssignments.userId],
    references: [users.id],
  }),
}));

export const insertEventAssignmentSchema = createInsertSchema(eventAssignments).omit({
  id: true,
  assignedAt: true,
});

export type InsertEventAssignment = z.infer<typeof insertEventAssignmentSchema>;
export type EventAssignment = typeof eventAssignments.$inferSelect;

// Availability blocks - per-user unavailable time (holiday, leave, meeting, etc.)
// so that the user cannot be assigned to bookings overlapping the window.
export const AVAILABILITY_CATEGORIES = [
  "holiday",
  "leave",
  "meeting",
  "personal",
  "other",
] as const;

export const availabilityBlocks = pgTable("availability_blocks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  createdBy: integer("created_by").notNull().references(() => users.id),
  category: text("category").notNull().default("other"),
  reason: text("reason"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  // Optional override label shown in the Team time off list. Editable only by
  // an Install Manager — it never changes the underlying user account name.
  displayName: text("display_name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const availabilityBlocksRelations = relations(availabilityBlocks, ({ one }) => ({
  user: one(users, {
    fields: [availabilityBlocks.userId],
    references: [users.id],
  }),
}));

export const insertAvailabilityBlockSchema = createInsertSchema(availabilityBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAvailabilityBlock = z.infer<typeof insertAvailabilityBlockSchema>;
export type AvailabilityBlock = typeof availabilityBlocks.$inferSelect;

// Reschedule requests - when customers request to reschedule a booking
export const rescheduleRequests = pgTable("reschedule_requests", {
  id: serial("id").primaryKey(),
  calendarEventId: integer("calendar_event_id").references(() => calendarEvents.id).notNull(),
  confirmationToken: text("confirmation_token").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertRescheduleRequestSchema = createInsertSchema(rescheduleRequests).omit({
  id: true,
  createdAt: true,
});

export type InsertRescheduleRequest = z.infer<typeof insertRescheduleRequestSchema>;
export type RescheduleRequest = typeof rescheduleRequests.$inferSelect;

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

export const calendarFilterColors = pgTable("calendar_filter_colors", {
  id: serial("id").primaryKey(),
  statusKey: text("status_key").notNull().unique(),
  color: text("color").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCalendarFilterColorSchema = createInsertSchema(calendarFilterColors).omit({
  id: true,
  updatedAt: true,
});

export type InsertCalendarFilterColor = z.infer<typeof insertCalendarFilterColorSchema>;
export type CalendarFilterColor = typeof calendarFilterColors.$inferSelect;

export const jobTimers = pgTable("job_timers", {
  id: serial("id").primaryKey(),
  calendarEventId: integer("calendar_event_id").notNull().references(() => calendarEvents.id),
  userId: integer("user_id").notNull().references(() => users.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  totalSeconds: integer("total_seconds"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertJobTimerSchema = createInsertSchema(jobTimers).omit({
  id: true,
  createdAt: true,
});

export type InsertJobTimer = z.infer<typeof insertJobTimerSchema>;
export type JobTimer = typeof jobTimers.$inferSelect;

export const onboardingForms = pgTable("onboarding_forms", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  userName: text("user_name"),
  userEmail: text("user_email"),
  userPhone: text("user_phone"),
  userLocation: text("user_location"),
  businessAddress: text("business_address"),
  installationRange: text("installation_range"),
  chargeTravelTime: text("charge_travel_time"),
  setupCleanupTime: text("setup_cleanup_time"),
  teamSize: text("team_size"),
  schedulingPOC: text("scheduling_poc"),
  calendarOwner: text("calendar_owner"),
  subInstallerCount: text("sub_installer_count"),
  subInstallerCoordinator: text("sub_installer_coordinator"),
  customerNotification: text("customer_notification"),
  hasBucketTruck: text("has_bucket_truck"),
  bucketTruckMinTime: text("bucket_truck_min_time"),
  bucketTruckTwoInstallers: text("bucket_truck_two_installers"),
  ladderMaxHeight: text("ladder_max_height"),
  ladderTwoPeople: text("ladder_two_people"),
  vehicleGraphics: text("vehicle_graphics"),
  hasGarage: text("has_garage"),
  doesWraps: text("does_wraps"),
  installsPosts: text("installs_posts"),
  signTypes: text("sign_types").array().default(sql`ARRAY[]::text[]`),
  pricingProductList: text("pricing_product_list"),
  installTimeStandards: text("install_time_standards"),
  additionalNotes: text("additional_notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOnboardingFormSchema = createInsertSchema(onboardingForms).omit({
  id: true,
  createdAt: true,
});

export type InsertOnboardingForm = z.infer<typeof insertOnboardingFormSchema>;
export type OnboardingForm = typeof onboardingForms.$inferSelect;

export const businessDetails = pgTable("business_details", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  businessName: text("business_name"),
  businessAddress: text("business_address"),
  businessCity: text("business_city"),
  businessState: text("business_state"),
  businessZip: text("business_zip"),
  contactNumber: text("contact_number"),
  businessEmail: text("business_email"),
  website: text("website"),
  taxId: text("tax_id"),
  businessType: text("business_type"),
  yearEstablished: text("year_established"),
  numberOfEmployees: text("number_of_employees"),
  additionalNotes: text("additional_notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertBusinessDetailsSchema = createInsertSchema(businessDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBusinessDetails = z.infer<typeof insertBusinessDetailsSchema>;
export type BusinessDetails = typeof businessDetails.$inferSelect;

export const assistantFiles = pgTable("assistant_files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  openaiFileId: text("openai_file_id").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAssistantFileSchema = createInsertSchema(assistantFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertAssistantFile = z.infer<typeof insertAssistantFileSchema>;
export type AssistantFile = typeof assistantFiles.$inferSelect;

// Activity logs table for super admin audit trail
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  userEmail: text("user_email"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  resourceId: text("resource_id"),
  resourceType: text("resource_type"),
  metadata: text("metadata"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Subscription plans table
export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: text("price").notNull(),
  originalPrice: text("original_price"),
  eventLimit: integer("event_limit").notNull(),
  bufferLimit: integer("buffer_limit").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

// Admin subscriptions table - which plan each admin is on
export const adminSubscriptions = pgTable("admin_subscriptions", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  planNotification: text("plan_notification"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAdminSubscriptionSchema = createInsertSchema(adminSubscriptions).omit({ id: true, createdAt: true });
export type InsertAdminSubscription = z.infer<typeof insertAdminSubscriptionSchema>;
export type AdminSubscription = typeof adminSubscriptions.$inferSelect;

export const installerNotifications = pgTable("installer_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  calendarEventId: integer("calendar_event_id").notNull().references(() => calendarEvents.id),
  status: text("status").notNull().default("pending"),
  onMyWayAt: timestamp("on_my_way_at"),
  readAt: timestamp("read_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const installerNotificationsRelations = relations(installerNotifications, ({ one }) => ({
  user: one(users, {
    fields: [installerNotifications.userId],
    references: [users.id],
  }),
  calendarEvent: one(calendarEvents, {
    fields: [installerNotifications.calendarEventId],
    references: [calendarEvents.id],
  }),
}));

export const insertInstallerNotificationSchema = createInsertSchema(installerNotifications).omit({
  id: true,
  createdAt: true,
});

export type InsertInstallerNotification = z.infer<typeof insertInstallerNotificationSchema>;
export type InstallerNotification = typeof installerNotifications.$inferSelect;

export const globalTags = pgTable("global_tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 20 }).default("#3b82f6"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGlobalTagSchema = createInsertSchema(globalTags).omit({
  id: true,
  createdAt: true,
});

export type InsertGlobalTag = z.infer<typeof insertGlobalTagSchema>;
export type GlobalTag = typeof globalTags.$inferSelect;

export const ownerTags = pgTable("owner_tags", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const ownerTagsRelations = relations(ownerTags, ({ one }) => ({
  owner: one(users, {
    fields: [ownerTags.ownerId],
    references: [users.id],
  }),
}));

export const insertOwnerTagSchema = createInsertSchema(ownerTags).omit({
  id: true,
  createdAt: true,
});

export type InsertOwnerTag = z.infer<typeof insertOwnerTagSchema>;
export type OwnerTag = typeof ownerTags.$inferSelect;

export const QUESTION_TYPE_OPTIONS = ["text", "textarea", "radio", "checkbox", "select", "number"] as const;

export const onboardingQuestions = pgTable("onboarding_questions", {
  id: serial("id").primaryKey(),
  stepName: text("step_name").notNull(),
  stepTitle: text("step_title").notNull(),
  stepIcon: text("step_icon").notNull().default("HelpCircle"),
  stepDescription: text("step_description").default(""),
  questionLabel: text("question_label").notNull(),
  questionKey: text("question_key").notNull(),
  questionType: text("question_type").notNull().default("text"),
  options: text("options").default(""),
  placeholder: text("placeholder").default(""),
  required: boolean("required").default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  stepOrder: integer("step_order").notNull().default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertOnboardingQuestionSchema = createInsertSchema(onboardingQuestions).omit({
  id: true,
  createdAt: true,
});

export type InsertOnboardingQuestion = z.infer<typeof insertOnboardingQuestionSchema>;
export type OnboardingQuestion = typeof onboardingQuestions.$inferSelect;

export const EMAIL_TEMPLATE_TYPES = [
  "schedule_confirmation",
  "reschedule_notification",
  "on_my_way",
  "booking_assignment",
  "issue_reported",
  "welcome_email",
  "password_reset",
] as const;

export type EmailTemplateType = (typeof EMAIL_TEMPLATE_TYPES)[number];

export const emailTemplatesConfig = pgTable("email_templates_config", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  emailType: text("email_type").notNull(),
  subject: text("subject"),
  bodyHtml: text("body_html"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEmailTemplateConfigSchema = createInsertSchema(emailTemplatesConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailTemplateConfig = z.infer<typeof insertEmailTemplateConfigSchema>;
export type EmailTemplateConfig = typeof emailTemplatesConfig.$inferSelect;

export const emailSignatures = pgTable("email_signatures", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  companyName: text("company_name"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEmailSignatureSchema = createInsertSchema(emailSignatures).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmailSignature = z.infer<typeof insertEmailSignatureSchema>;
export type EmailSignature = typeof emailSignatures.$inferSelect;

export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  calendarEventId: integer("calendar_event_id").references(() => calendarEvents.id),
  jobName: text("job_name").notNull(),
  address: text("address"),
  description: text("description"),
  generalNotes: text("general_notes"),
  assessmentData: jsonb("assessment_data"),
  status: text("status").notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSurveySchema = createInsertSchema(surveys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSurvey = z.infer<typeof insertSurveySchema>;
export type Survey = typeof surveys.$inferSelect;

export const surveyPhotos = pgTable("survey_photos", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  originalImageUrl: text("original_image_url").notNull(),
  annotatedImageUrl: text("annotated_image_url"),
  note: text("note"),
  measurements: jsonb("measurements"),
  hasAnnotations: boolean("has_annotations").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSurveyPhotoSchema = createInsertSchema(surveyPhotos).omit({
  id: true,
  createdAt: true,
});

export type InsertSurveyPhoto = z.infer<typeof insertSurveyPhotoSchema>;
export type SurveyPhoto = typeof surveyPhotos.$inferSelect;

// Global app settings (key/value), managed by super_admin
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Asset Manager ───────────────────────────────────────────────────────────

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  title: text("title"),
  description: text("description"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  source: text("source"),
  aiTaggedAt: timestamp("ai_tagged_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  projectName: text("project_name"),
  projectAddress: text("project_address"),
  jobNumber: text("job_number"),
  capturedBy: text("captured_by"),
  sourceDisplay: text("source_display"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
});

export const insertAssetSchema = createInsertSchema(assets).omit({
  id: true,
  createdAt: true,
});
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const assetManagerAccess = pgTable("asset_manager_access", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.id).unique(),
  enabled: boolean("enabled").notNull().default(true),
  enabledAt: timestamp("enabled_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  companycamApiKey: text("companycam_api_key"),
  companycamLastSyncedAt: timestamp("companycam_last_synced_at"),
  googleDriveRefreshToken: text("google_drive_refresh_token"),
  googleDriveEmail: text("google_drive_email"),
  googleDriveFolderId: text("google_drive_folder_id"),
  googleDriveFolderName: text("google_drive_folder_name"),
  googleDriveLastSyncedAt: timestamp("google_drive_last_synced_at"),
});

export const insertAssetManagerAccessSchema = createInsertSchema(assetManagerAccess).omit({
  id: true,
  enabledAt: true,
});
export type InsertAssetManagerAccess = z.infer<typeof insertAssetManagerAccessSchema>;
export type AssetManagerAccess = typeof assetManagerAccess.$inferSelect;

export const assetTagLibrary = pgTable("asset_tag_library", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").notNull().references(() => users.id),
  tagName: text("tag_name").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  uniqueAdminTag: uniqueIndex("asset_tag_library_admin_tag_unique").on(table.adminId, table.tagName),
}));

export const insertAssetTagLibrarySchema = createInsertSchema(assetTagLibrary).omit({
  id: true,
  createdAt: true,
});
export type InsertAssetTagLibrary = z.infer<typeof insertAssetTagLibrarySchema>;
export type AssetTagLibrary = typeof assetTagLibrary.$inferSelect;

// ─── In-app Feedback ─────────────────────────────────────────────────────────

export const feedbackItems = pgTable("feedback_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  pageUrl: text("page_url").notNull(),
  pageTitle: text("page_title"),
  feedbackType: text("feedback_type").notNull().default("bug"),
  notes: text("notes"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFeedbackItemSchema = createInsertSchema(feedbackItems).omit({
  id: true,
  createdAt: true,
});
export type InsertFeedbackItem = z.infer<typeof insertFeedbackItemSchema>;
export type FeedbackItem = typeof feedbackItems.$inferSelect;
