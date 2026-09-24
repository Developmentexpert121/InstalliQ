import {
  users,
  projects,
  calendarEvents,
  jobs,
  installEvents,
  attachments,
  notificationLogs,
  passwordResetTokens,
  eventAssignments,
  rescheduleRequests,
  type User,
  type InsertUser,
  type Project,
  type InsertProject,
  type CalendarEvent,
  type InsertCalendarEvent,
  type Job,
  type InsertJob,
  type InstallEvent,
  type InsertInstallEvent,
  type Attachment,
  type InsertAttachment,
  type NotificationLog,
  type InsertNotificationLog,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type EventAssignment,
  type InsertEventAssignment,
  type RescheduleRequest,
  type InsertRescheduleRequest,
  calendarFilterColors,
  type CalendarFilterColor,
  jobTimers,
  type JobTimer,
  installerNotifications,
  type InstallerNotification,
  type InsertInstallerNotification,
  businessDetails,
  type BusinessDetails,
  type InsertBusinessDetails,
  globalTags,
  type GlobalTag,
  type InsertGlobalTag,
  ownerTags,
  type OwnerTag,
  type InsertOwnerTag,
  onboardingQuestions,
  type OnboardingQuestion,
  type InsertOnboardingQuestion,
  emailTemplatesConfig,
  type EmailTemplateConfig,
  type InsertEmailTemplateConfig,
  emailSignatures,
  type EmailSignature,
  type InsertEmailSignature,
  surveys,
  type Survey,
  type InsertSurvey,
  surveyPhotos,
  type SurveyPhoto,
  appSettings,
  type AppSetting,
  type InsertSurveyPhoto,
  feedbackItems,
  type FeedbackItem,
  type InsertFeedbackItem,
  availabilityBlocks,
  type AvailabilityBlock,
  type InsertAvailabilityBlock,
} from "@shared/schema";
import { db } from "./db";
import {
  eq,
  desc,
  ilike,
  or,
  sql,
  and,
  inArray,
  isNull,
  gt,
  lt,
  lte,
  gte,
} from "drizzle-orm";

// A minimal, non-sensitive projection of a user used when embedding the owner of
// an availability block in API responses. Never include password hashes, temp
// passwords, or other sensitive columns here.
export type SafeAvailabilityUser = {
  id: number;
  name: string;
  email: string | null;
  role: string;
  jobTitle: string | null;
};

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserBySignsuiteiqUserId(signsuiteiqUserId: number): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  // Projects
  getProject(id: number): Promise<Project | undefined>;
  getAllProjects(userId?: number): Promise<Project[]>;
  getProjectsByUserIds(userIds: number[]): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(
    id: number,
    data: Partial<InsertProject>,
  ): Promise<Project | undefined>;
  deleteProject(id: number): Promise<void>;
  searchProjects(query: string): Promise<Project[]>;

  // Calendar Events
  getCalendarEvent(id: number): Promise<CalendarEvent | undefined>;
  getCalendarEventsByProjectId(projectId: number): Promise<CalendarEvent[]>;
  getAllCalendarEvents(): Promise<CalendarEvent[]>;
  getCalendarEventsByCreator(createdById: number): Promise<CalendarEvent[]>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(
    id: number,
    data: Partial<InsertCalendarEvent>,
  ): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: number): Promise<void>;

  getCalendarEventByWorkOrderNumber(workOrderNumber: string, createdBy: number): Promise<CalendarEvent | undefined>;
  getCalendarEventByWorkOrderNumberInTeam(workOrderNumber: string, adminId: number): Promise<CalendarEvent | undefined>;
  getCalendarEventByConfirmationToken(
    token: string,
  ): Promise<CalendarEvent | undefined>;

  // Jobs
  getJob(id: number): Promise<Job | undefined>;
  getJobByWorkOrderNumber(workOrderNumber: string): Promise<Job | undefined>;
  getAllJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: number, data: Partial<InsertJob>): Promise<Job | undefined>;
  deleteJob(id: number): Promise<void>;

  // Install Events
  getInstallEvent(id: number): Promise<InstallEvent | undefined>;
  getInstallEventsByJobId(jobId: number): Promise<InstallEvent[]>;
  getAllInstallEvents(): Promise<InstallEvent[]>;
  createInstallEvent(event: InsertInstallEvent): Promise<InstallEvent>;
  updateInstallEvent(
    id: number,
    data: Partial<InsertInstallEvent>,
  ): Promise<InstallEvent | undefined>;
  deleteInstallEvent(id: number): Promise<void>;

  // Attachments
  getAttachment(id: number): Promise<Attachment | undefined>;
  getAttachmentsByJobId(jobId: number): Promise<Attachment[]>;
  getAllAttachments(): Promise<Attachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<Attachment>;
  updateAttachment(
    id: number,
    data: Partial<InsertAttachment>,
  ): Promise<Attachment | undefined>;
  deleteAttachment(id: number): Promise<void>;

  // Notification Logss
  createNotificationLog(log: InsertNotificationLog): Promise<NotificationLog>;
  getNotificationLogsByJobId(jobId: number): Promise<NotificationLog[]>;

  // Password Reset Tokens
  createPasswordResetToken(
    token: InsertPasswordResetToken,
  ): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: number): Promise<void>;
  updateUserPassword(
    userId: number,
    hashedPassword: string,
    tempPassword?: string,
  ): Promise<void>;
  clearTempPassword(userId: number): Promise<void>;

  // Event Assignments
  getEventAssignments(
    calendarEventId: number,
  ): Promise<(EventAssignment & { user: User })[]>;
  getAllEventAssignments(): Promise<EventAssignment[]>;
  setEventAssignments(
    calendarEventId: number,
    userIds: number[],
  ): Promise<EventAssignment[]>;
  getCalendarEventsForUser(userId: number): Promise<CalendarEvent[]>;

  // Availability blocks
  getAvailabilityBlock(id: number): Promise<AvailabilityBlock | undefined>;
  getAvailabilityBlocksForUsers(
    userIds: number[],
    range?: { from?: Date; to?: Date },
  ): Promise<(AvailabilityBlock & { user: SafeAvailabilityUser })[]>;
  getOverlappingBlocksForUser(
    userId: number,
    startAt: Date,
    endAt: Date,
  ): Promise<AvailabilityBlock[]>;
  createAvailabilityBlock(block: InsertAvailabilityBlock): Promise<AvailabilityBlock>;
  updateAvailabilityBlock(
    id: number,
    updates: Partial<InsertAvailabilityBlock>,
  ): Promise<AvailabilityBlock | undefined>;
  deleteAvailabilityBlock(id: number): Promise<void>;

  // Deleted Users
  getDeletedUsers(): Promise<User[]>;
  restoreUser(id: number): Promise<User | undefined>;
  permanentDeleteUsers(ids: number[]): Promise<void>;

  // App settings (super_admin global key/value)
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;

  // Face Recognition
  updateUserFaceData(
    userId: number,
    faceDescriptor: string,
    faceEnabled: boolean,
    facePhoto?: string,
  ): Promise<void>;
  clearUserFaceData(userId: number): Promise<void>;
  getUsersWithFaceEnabled(): Promise<User[]>;

  // Reschedule Requests
  createRescheduleRequest(
    request: InsertRescheduleRequest,
  ): Promise<RescheduleRequest>;
  getAllRescheduleRequests(
    includeArchived?: boolean,
  ): Promise<RescheduleRequest[]>;
  getRescheduleRequestById(id: number): Promise<RescheduleRequest | undefined>;
  getRescheduleRequestsByEventId(
    calendarEventId: number,
  ): Promise<RescheduleRequest[]>;
  updateRescheduleRequest(
    id: number,
    data: Partial<InsertRescheduleRequest>,
  ): Promise<RescheduleRequest | undefined>;
  archiveRescheduleRequests(ids: number[]): Promise<void>;
  restoreRescheduleRequests(ids: number[]): Promise<void>;
  permanentDeleteRescheduleRequests(ids: number[]): Promise<void>;

  getCalendarFilterColors(): Promise<CalendarFilterColor[]>;
  updateCalendarFilterColor(
    statusKey: string,
    color: string,
  ): Promise<CalendarFilterColor>;

  // Job Timers
  getJobTimer(
    calendarEventId: number,
    userId: number,
  ): Promise<JobTimer | undefined>;
  getJobTimersByEvent(calendarEventId: number): Promise<JobTimer[]>;
  startJobTimer(calendarEventId: number, userId: number): Promise<JobTimer>;
  stopJobTimer(
    calendarEventId: number,
    userId: number,
  ): Promise<JobTimer | undefined>;
  stopAllActiveTimersForEvent(calendarEventId: number): Promise<number>;

  // Installer Notifications
  createInstallerNotification(
    notification: InsertInstallerNotification,
  ): Promise<InstallerNotification>;
  getInstallerNotificationsForUser(
    userId: number,
  ): Promise<(InstallerNotification & { calendarEvent: CalendarEvent })[]>;
  getInstallerNotification(
    id: number,
  ): Promise<
    (InstallerNotification & { calendarEvent: CalendarEvent }) | undefined
  >;
  updateInstallerNotification(
    id: number,
    data: Partial<InsertInstallerNotification>,
  ): Promise<InstallerNotification | undefined>;
  deleteExpiredInstallerNotifications(): Promise<number>;
  getInstallerNotificationByEventAndUser(
    calendarEventId: number,
    userId: number,
  ): Promise<InstallerNotification | undefined>;

  // Business Details
  getBusinessDetailsByAdminId(adminId: number): Promise<BusinessDetails | undefined>;
  createBusinessDetails(details: InsertBusinessDetails): Promise<BusinessDetails>;
  updateBusinessDetails(adminId: number, data: Partial<InsertBusinessDetails>): Promise<BusinessDetails | undefined>;

  // Global Tags (Super Admin)
  getGlobalTags(): Promise<GlobalTag[]>;
  createGlobalTag(tag: InsertGlobalTag): Promise<GlobalTag>;
  updateGlobalTag(id: number, data: Partial<InsertGlobalTag>): Promise<GlobalTag | undefined>;
  deleteGlobalTag(id: number): Promise<void>;

  // Owner Tags
  getOwnerTags(ownerId: number): Promise<OwnerTag[]>;
  createOwnerTag(tag: InsertOwnerTag): Promise<OwnerTag>;
  updateOwnerTag(id: number, data: Partial<InsertOwnerTag>, ownerId?: number): Promise<OwnerTag | undefined>;
  deleteOwnerTag(id: number, ownerId?: number): Promise<void>;

  // Onboarding Questions
  getOnboardingQuestions(): Promise<OnboardingQuestion[]>;
  getActiveOnboardingQuestions(): Promise<OnboardingQuestion[]>;
  createOnboardingQuestion(question: InsertOnboardingQuestion): Promise<OnboardingQuestion>;
  updateOnboardingQuestion(id: number, data: Partial<InsertOnboardingQuestion>): Promise<OnboardingQuestion | undefined>;
  deleteOnboardingQuestion(id: number): Promise<void>;

  // Email Templates Config
  getEmailTemplatesByAdminId(adminId: number): Promise<EmailTemplateConfig[]>;
  getEmailTemplate(adminId: number, emailType: string): Promise<EmailTemplateConfig | undefined>;
  upsertEmailTemplate(data: InsertEmailTemplateConfig): Promise<EmailTemplateConfig>;
  deleteEmailTemplate(adminId: number, emailType: string): Promise<void>;

  // Email Signatures
  getEmailSignatureByAdminId(adminId: number): Promise<EmailSignature | undefined>;
  upsertEmailSignature(data: InsertEmailSignature): Promise<EmailSignature>;

  // Surveys
  getSurvey(id: number): Promise<Survey | undefined>;
  getSurveysByCreator(createdBy: number): Promise<Survey[]>;
  getSurveyByCalendarEventId(calendarEventId: number): Promise<Survey | undefined>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: number, data: Partial<InsertSurvey>): Promise<Survey | undefined>;
  deleteSurvey(id: number): Promise<void>;

  // Survey Photos
  getSurveyPhotos(surveyId: number): Promise<SurveyPhoto[]>;
  getSurveyPhoto(id: number): Promise<SurveyPhoto | undefined>;
  createSurveyPhoto(photo: InsertSurveyPhoto): Promise<SurveyPhoto>;
  updateSurveyPhoto(id: number, data: Partial<InsertSurveyPhoto>): Promise<SurveyPhoto | undefined>;
  deleteSurveyPhoto(id: number): Promise<void>;

  // Feedback Items
  createFeedbackItem(item: InsertFeedbackItem): Promise<FeedbackItem>;
  listFeedbackItems(status?: string): Promise<(FeedbackItem & { userName?: string; userEmail?: string })[]>;
  updateFeedbackItemStatus(id: number, status: string): Promise<FeedbackItem | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(ilike(users.username, username), isNull(users.deletedAt)));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(ilike(users.email, email), isNull(users.deletedAt)));
    return user || undefined;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalizedPhone = phone.replace(/\D/g, "");
    const allUsers = await db
      .select()
      .from(users)
      .where(isNull(users.deletedAt));
    const match = allUsers.find(
      (u) => u.phone && u.phone.replace(/\D/g, "") === normalizedPhone,
    );
    return match || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.googleId, googleId), isNull(users.deletedAt)));
    return user || undefined;
  }

  async getUserBySignsuiteiqUserId(signsuiteiqUserId: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.signsuiteiqUserId, signsuiteiqUserId), isNull(users.deletedAt)));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(isNull(users.deletedAt))
      .orderBy(desc(users.createdAt));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(
    id: number,
    data: Partial<InsertUser>,
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteUser(id: number): Promise<void> {
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, id));
  }

  async getDeletedUsers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(sql`${users.deletedAt} IS NOT NULL`)
      .orderBy(desc(users.deletedAt));
  }

  async restoreUser(id: number): Promise<User | undefined> {
    const [restored] = await db
      .update(users)
      .set({ deletedAt: null })
      .where(eq(users.id, id))
      .returning();
    return restored || undefined;
  }

  async permanentDeleteUsers(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    // Only hard-delete users that are already soft-deleted (in archive).
    // Cascade-clean dependent rows in one transaction so the delete can succeed
    // even when the user has linked records. For nullable FKs we null them out
    // (preserving history); for non-null FKs we delete the owned rows. We
    // introspect information_schema first so schema drift between code and the
    // live DB does not abort the transaction.
    const NULLABLE_FKS: Array<[string, string]> = [
      ["projects", "user_id"],
      ["jobs", "assigned_installer_id"],
      ["install_events", "assigned_installer_id"],
      ["activity_logs", "user_id"],
      ["surveys", "created_by"],
      ["calendar_events", "created_by"],
      ["feedback_items", "user_id"],
      // users.created_by has no FK constraint, but null it so orphaned
      // sub-users don't point at a deleted parent.
      ["users", "created_by"],
    ];
    const OWNED_TABLES: Array<[string, string]> = [
      ["event_assignments", "user_id"],
      ["password_reset_tokens", "user_id"],
      ["job_timers", "user_id"],
      ["onboarding_forms", "user_id"],
      ["business_details", "admin_id"],
      ["assistant_files", "user_id"],
      ["admin_subscriptions", "admin_id"],
      ["installer_notifications", "user_id"],
      ["email_templates_config", "admin_id"],
      ["email_signatures", "admin_id"],
      ["calendar_filter_colors", "user_id"],
      ["asset_manager_access", "owner_id"],
      ["asset_tag_library", "admin_id"],
      // Asset Manager assets belong to the admin (admin_id) and were uploaded
      // by a specific user (uploaded_by_user_id, NOT NULL). Delete by both so
      // archiving either an owner or an installer doesn't leave dangling FKs.
      ["assets", "admin_id"],
      ["assets", "uploaded_by_user_id"],
    ];

    const allPairs = [...NULLABLE_FKS, ...OWNED_TABLES];
    const existing = await db.execute(sql`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ${sql.join(
            allPairs.map(([t, c]) => sql`(${t}, ${c})`),
            sql`, `,
          )}
        )
    `);
    const existingPairs = new Set<string>(
      (existing.rows as Array<{ table_name: string; column_name: string }>).map(
        (r) => `${r.table_name}.${r.column_name}`,
      ),
    );

    await db.transaction(async (tx) => {
      const archived = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, ids), sql`${users.deletedAt} IS NOT NULL`));
      const archivedIds = archived.map((r) => r.id);
      if (archivedIds.length === 0) return;
      const idList = sql.raw(`(${archivedIds.join(",")})`);

      for (const [table, col] of NULLABLE_FKS) {
        if (!existingPairs.has(`${table}.${col}`)) continue;
        await tx.execute(
          sql`UPDATE ${sql.raw(table)} SET ${sql.raw(col)} = NULL WHERE ${sql.raw(col)} IN ${idList}`,
        );
      }
      for (const [table, col] of OWNED_TABLES) {
        if (!existingPairs.has(`${table}.${col}`)) continue;
        await tx.execute(
          sql`DELETE FROM ${sql.raw(table)} WHERE ${sql.raw(col)} IN ${idList}`,
        );
      }

      await tx
        .delete(users)
        .where(and(inArray(users.id, archivedIds), sql`${users.deletedAt} IS NOT NULL`));
    });
  }

  async getAppSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return row?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }

  // Projects
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    return project || undefined;
  }

  async getAllProjects(userId?: number): Promise<Project[]> {
    if (userId) {
      return db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(desc(projects.createdAt));
    }
    return db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProjectsByUserIds(userIds: number[]): Promise<Project[]> {
    if (userIds.length === 0) return [];
    return db
      .select()
      .from(projects)
      .where(inArray(projects.userId, userIds))
      .orderBy(desc(projects.createdAt));
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(
    id: number,
    data: Partial<InsertProject>,
  ): Promise<Project | undefined> {
    const [updated] = await db
      .update(projects)
      .set(data)
      .where(eq(projects.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteProject(id: number): Promise<void> {
    // First, find and delete related calendar events (which will cascade to install_events/jobs/attachments)
    const relatedEvents = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.projectId, id));

    for (const event of relatedEvents) {
      await this.deleteCalendarEvent(event.id);
    }

    // Now delete the project
    await db.delete(projects).where(eq(projects.id, id));
  }

  async searchProjects(query: string): Promise<Project[]> {
    const searchTerm = `%${query}%`;
    return db
      .select()
      .from(projects)
      .where(
        or(
          ilike(projects.description, searchTerm),
          ilike(projects.jobLabel, searchTerm),
        ),
      )
      .orderBy(desc(projects.createdAt));
  }

  // Calendar Events
  async getCalendarEvent(id: number): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id));
    return event || undefined;
  }

  async getCalendarEventsByProjectId(
    projectId: number,
  ): Promise<CalendarEvent[]> {
    return db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.projectId, projectId));
  }

  async getAllCalendarEvents(): Promise<CalendarEvent[]> {
    return db.select().from(calendarEvents).orderBy(desc(calendarEvents.date));
  }

  async getCalendarEventsByCreator(
    createdById: number,
  ): Promise<CalendarEvent[]> {
    return db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.createdBy, createdById))
      .orderBy(desc(calendarEvents.date));
  }

  async getCalendarEventByWorkOrderNumber(workOrderNumber: string, createdBy: number): Promise<CalendarEvent | undefined> {
    const normalized = workOrderNumber.trim().toLowerCase();
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(
        sql`LOWER(TRIM(${calendarEvents.workJobNumber})) = ${normalized}`,
        eq(calendarEvents.createdBy, createdBy)
      ))
      .limit(1);
    return event;
  }

  async getCalendarEventByWorkOrderNumberInTeam(workOrderNumber: string, adminId: number): Promise<CalendarEvent | undefined> {
    const normalized = workOrderNumber.trim().toLowerCase();
    const teamUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.id, adminId), eq(users.createdBy, adminId)));
    const teamUserIds = teamUsers.map(u => u.id);
    if (teamUserIds.length === 0) return undefined;
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(
        sql`LOWER(TRIM(${calendarEvents.workJobNumber})) = ${normalized}`,
        inArray(calendarEvents.createdBy, teamUserIds)
      ))
      .limit(1);
    return event;
  }

  async generateWorkJobNumber(): Promise<string> {
    const [result] = await db
      .select({ maxId: sql<number>`COALESCE(MAX(id), 0)` })
      .from(calendarEvents);
    const nextNum = (result?.maxId || 0) + 1;
    return `WJ-${String(nextNum).padStart(5, "0")}`;
  }

  async createCalendarEvent(
    event: InsertCalendarEvent,
  ): Promise<CalendarEvent> {
    if (!event.workJobNumber) {
      event.workJobNumber = await this.generateWorkJobNumber();
    }
    const [newEvent] = await db
      .insert(calendarEvents)
      .values(event)
      .returning();
    return newEvent;
  }

  async updateCalendarEvent(
    id: number,
    data: Partial<InsertCalendarEvent>,
  ): Promise<CalendarEvent | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(cleanData).length === 0) {
      return this.getCalendarEvent(id);
    }
    const [updated] = await db
      .update(calendarEvents)
      .set(cleanData)
      .where(eq(calendarEvents.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteCalendarEvent(id: number): Promise<void> {
    // First, find and delete related install_events and their associated jobs/attachments
    const relatedInstallEvents = await db
      .select()
      .from(installEvents)
      .where(eq(installEvents.calendarEventId, id));

    for (const installEvent of relatedInstallEvents) {
      // Delete notification logs for this job (must be before job deletion)
      await db
        .delete(notificationLogs)
        .where(eq(notificationLogs.jobId, installEvent.jobId));
      // Delete attachments for this job
      await db
        .delete(attachments)
        .where(eq(attachments.jobId, installEvent.jobId));
      // Delete the install event
      await db
        .delete(installEvents)
        .where(eq(installEvents.id, installEvent.id));
      // Delete the job
      await db.delete(jobs).where(eq(jobs.id, installEvent.jobId));
    }

    // Delete related job timers
    await db.delete(jobTimers).where(eq(jobTimers.calendarEventId, id));
    // Delete related event assignments
    await db
      .delete(eventAssignments)
      .where(eq(eventAssignments.calendarEventId, id));
    // Delete related reschedule requests
    await db
      .delete(rescheduleRequests)
      .where(eq(rescheduleRequests.calendarEventId, id));
    // Delete related installer notifications
    await db
      .delete(installerNotifications)
      .where(eq(installerNotifications.calendarEventId, id));
    // Now delete the calendar event
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  async getCalendarEventByConfirmationToken(
    token: string,
  ): Promise<CalendarEvent | undefined> {
    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.confirmationToken, token));
    return event || undefined;
  }

  // Jobs
  async getJob(id: number): Promise<Job | undefined> {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job || undefined;
  }

  async getJobByWorkOrderNumber(
    workOrderNumber: string,
  ): Promise<Job | undefined> {
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.workOrderNumber, workOrderNumber));
    return job || undefined;
  }

  async getAllJobs(): Promise<Job[]> {
    return db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [newJob] = await db.insert(jobs).values(job).returning();
    return newJob;
  }

  async updateJob(
    id: number,
    data: Partial<InsertJob>,
  ): Promise<Job | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(cleanData).length === 0) {
      return this.getJob(id);
    }
    const [updated] = await db
      .update(jobs)
      .set({
        ...cleanData,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteJob(id: number): Promise<void> {
    await db.delete(jobs).where(eq(jobs.id, id));
  }

  // Install Events
  async getInstallEvent(id: number): Promise<InstallEvent | undefined> {
    const [event] = await db
      .select()
      .from(installEvents)
      .where(eq(installEvents.id, id));
    return event || undefined;
  }

  async getInstallEventsByJobId(jobId: number): Promise<InstallEvent[]> {
    return db
      .select()
      .from(installEvents)
      .where(eq(installEvents.jobId, jobId))
      .orderBy(desc(installEvents.startTime));
  }

  async getAllInstallEvents(): Promise<InstallEvent[]> {
    return db
      .select()
      .from(installEvents)
      .orderBy(desc(installEvents.startTime));
  }

  async createInstallEvent(event: InsertInstallEvent): Promise<InstallEvent> {
    const [newEvent] = await db.insert(installEvents).values(event).returning();
    return newEvent;
  }

  async updateInstallEvent(
    id: number,
    data: Partial<InsertInstallEvent>,
  ): Promise<InstallEvent | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(cleanData).length === 0) {
      return this.getInstallEvent(id);
    }
    const [updated] = await db
      .update(installEvents)
      .set({
        ...cleanData,
        updatedAt: new Date(),
      })
      .where(eq(installEvents.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteInstallEvent(id: number): Promise<void> {
    await db.delete(installEvents).where(eq(installEvents.id, id));
  }

  // Attachments
  async getAttachment(id: number): Promise<Attachment | undefined> {
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id));
    return attachment || undefined;
  }

  async getAttachmentsByJobId(jobId: number): Promise<Attachment[]> {
    return db.select().from(attachments).where(eq(attachments.jobId, jobId));
  }

  async getAllAttachments(): Promise<Attachment[]> {
    return db.select().from(attachments);
  }

  async createAttachment(attachment: InsertAttachment): Promise<Attachment> {
    const [newAttachment] = await db
      .insert(attachments)
      .values(attachment)
      .returning();
    return newAttachment;
  }

  async updateAttachment(
    id: number,
    data: Partial<InsertAttachment>,
  ): Promise<Attachment | undefined> {
    const [updated] = await db
      .update(attachments)
      .set(data)
      .where(eq(attachments.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteAttachment(id: number): Promise<void> {
    await db.delete(attachments).where(eq(attachments.id, id));
  }

  // Notification Logs
  async createNotificationLog(
    log: InsertNotificationLog,
  ): Promise<NotificationLog> {
    const [newLog] = await db.insert(notificationLogs).values(log).returning();
    return newLog;
  }

  async getNotificationLogsByJobId(jobId: number): Promise<NotificationLog[]> {
    return db
      .select()
      .from(notificationLogs)
      .where(eq(notificationLogs.jobId, jobId));
  }

  // Password Reset Tokens
  async createPasswordResetToken(
    token: InsertPasswordResetToken,
  ): Promise<PasswordResetToken> {
    const [newToken] = await db
      .insert(passwordResetTokens)
      .values(token)
      .returning();
    return newToken;
  }

  async getPasswordResetToken(
    token: string,
  ): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken || undefined;
  }

  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, id));
  }

  async updateUserPassword(
    userId: number,
    hashedPassword: string,
    tempPassword?: string,
  ): Promise<void> {
    const updateData: any = { password: hashedPassword };
    if (tempPassword) {
      updateData.tempPassword = tempPassword;
    }
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }

  async clearTempPassword(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ tempPassword: null })
      .where(eq(users.id, userId));
  }

  // Event Assignments
  async getEventAssignments(
    calendarEventId: number,
  ): Promise<(EventAssignment & { user: User })[]> {
    const rows = await db
      .select({
        id: eventAssignments.id,
        calendarEventId: eventAssignments.calendarEventId,
        userId: eventAssignments.userId,
        assignedAt: eventAssignments.assignedAt,
        user: users,
      })
      .from(eventAssignments)
      .innerJoin(
        users,
        and(eq(eventAssignments.userId, users.id), isNull(users.deletedAt)),
      )
      .where(eq(eventAssignments.calendarEventId, calendarEventId));
    return rows.map((r) => ({
      id: r.id,
      calendarEventId: r.calendarEventId,
      userId: r.userId,
      assignedAt: r.assignedAt,
      user: r.user,
    }));
  }

  async getAllEventAssignments(): Promise<EventAssignment[]> {
    return db.select().from(eventAssignments);
  }

  async setEventAssignments(
    calendarEventId: number,
    userIds: number[],
  ): Promise<EventAssignment[]> {
    await db
      .delete(eventAssignments)
      .where(eq(eventAssignments.calendarEventId, calendarEventId));
    if (userIds.length === 0) return [];
    const values = userIds.map((userId) => ({ calendarEventId, userId }));
    return db.insert(eventAssignments).values(values).returning();
  }

  async getCalendarEventsForUser(userId: number): Promise<CalendarEvent[]> {
    const assignedEventIds = db
      .select({ id: eventAssignments.calendarEventId })
      .from(eventAssignments)
      .where(eq(eventAssignments.userId, userId));
    return db
      .select()
      .from(calendarEvents)
      .where(inArray(calendarEvents.id, assignedEventIds))
      .orderBy(desc(calendarEvents.date));
  }

  // Availability blocks
  async getAvailabilityBlock(id: number): Promise<AvailabilityBlock | undefined> {
    const [row] = await db
      .select()
      .from(availabilityBlocks)
      .where(eq(availabilityBlocks.id, id));
    return row;
  }

  async getAvailabilityBlocksForUsers(
    userIds: number[],
    range?: { from?: Date; to?: Date },
  ): Promise<(AvailabilityBlock & { user: SafeAvailabilityUser })[]> {
    if (userIds.length === 0) return [];
    const conditions = [inArray(availabilityBlocks.userId, userIds)];
    // Overlap with the requested window: block.startAt <= to AND block.endAt >= from
    if (range?.to) conditions.push(lte(availabilityBlocks.startAt, range.to));
    if (range?.from) conditions.push(gte(availabilityBlocks.endAt, range.from));
    const rows = await db
      .select({
        id: availabilityBlocks.id,
        userId: availabilityBlocks.userId,
        createdBy: availabilityBlocks.createdBy,
        category: availabilityBlocks.category,
        reason: availabilityBlocks.reason,
        startAt: availabilityBlocks.startAt,
        endAt: availabilityBlocks.endAt,
        allDay: availabilityBlocks.allDay,
        displayName: availabilityBlocks.displayName,
        createdAt: availabilityBlocks.createdAt,
        updatedAt: availabilityBlocks.updatedAt,
        // Only expose non-sensitive user fields (never password/temp-password).
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          jobTitle: users.jobTitle,
        },
      })
      .from(availabilityBlocks)
      .innerJoin(users, eq(availabilityBlocks.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(availabilityBlocks.startAt));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      createdBy: r.createdBy,
      category: r.category,
      reason: r.reason,
      startAt: r.startAt,
      endAt: r.endAt,
      allDay: r.allDay,
      displayName: r.displayName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      user: r.user,
    }));
  }

  async getOverlappingBlocksForUser(
    userId: number,
    startAt: Date,
    endAt: Date,
  ): Promise<AvailabilityBlock[]> {
    return db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.userId, userId),
          lt(availabilityBlocks.startAt, endAt),
          gt(availabilityBlocks.endAt, startAt),
        ),
      );
  }

  async createAvailabilityBlock(
    block: InsertAvailabilityBlock,
  ): Promise<AvailabilityBlock> {
    const [row] = await db.insert(availabilityBlocks).values(block).returning();
    return row;
  }

  async updateAvailabilityBlock(
    id: number,
    updates: Partial<InsertAvailabilityBlock>,
  ): Promise<AvailabilityBlock | undefined> {
    const [row] = await db
      .update(availabilityBlocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(availabilityBlocks.id, id))
      .returning();
    return row;
  }

  async deleteAvailabilityBlock(id: number): Promise<void> {
    await db.delete(availabilityBlocks).where(eq(availabilityBlocks.id, id));
  }

  // Face Recognition
  async updateUserFaceData(
    userId: number,
    faceDescriptor: string,
    faceEnabled: boolean,
    facePhoto?: string,
  ): Promise<void> {
    const updateData: any = {
      faceDescriptor,
      faceEnabled,
      faceRegisteredAt: new Date(),
    };
    if (facePhoto !== undefined) {
      updateData.facePhoto = facePhoto;
    }
    await db.update(users).set(updateData).where(eq(users.id, userId));
  }

  async clearUserFaceData(userId: number): Promise<void> {
    await db
      .update(users)
      .set({
        faceDescriptor: null,
        facePhoto: null,
        faceEnabled: false,
        faceRegisteredAt: null,
      })
      .where(eq(users.id, userId));
  }

  async getUsersWithFaceEnabled(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(and(eq(users.faceEnabled, true), isNull(users.deletedAt)));
  }

  // Reschedule Requests
  async createRescheduleRequest(
    request: InsertRescheduleRequest,
  ): Promise<RescheduleRequest> {
    const [newRequest] = await db
      .insert(rescheduleRequests)
      .values(request)
      .returning();
    return newRequest;
  }

  async getAllRescheduleRequests(
    includeArchived?: boolean,
  ): Promise<RescheduleRequest[]> {
    if (includeArchived) {
      return db
        .select()
        .from(rescheduleRequests)
        .orderBy(desc(rescheduleRequests.createdAt));
    }
    return db
      .select()
      .from(rescheduleRequests)
      .where(isNull(rescheduleRequests.archivedAt))
      .orderBy(desc(rescheduleRequests.createdAt));
  }

  async getRescheduleRequestById(
    id: number,
  ): Promise<RescheduleRequest | undefined> {
    const [request] = await db
      .select()
      .from(rescheduleRequests)
      .where(eq(rescheduleRequests.id, id));
    return request || undefined;
  }

  async getRescheduleRequestsByEventId(
    calendarEventId: number,
  ): Promise<RescheduleRequest[]> {
    return db
      .select()
      .from(rescheduleRequests)
      .where(eq(rescheduleRequests.calendarEventId, calendarEventId))
      .orderBy(desc(rescheduleRequests.createdAt));
  }

  async updateRescheduleRequest(
    id: number,
    data: Partial<InsertRescheduleRequest>,
  ): Promise<RescheduleRequest | undefined> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined),
    );
    if (Object.keys(cleanData).length === 0) return undefined;
    const [updated] = await db
      .update(rescheduleRequests)
      .set(cleanData)
      .where(eq(rescheduleRequests.id, id))
      .returning();
    return updated || undefined;
  }

  async archiveRescheduleRequests(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(rescheduleRequests)
      .set({ archivedAt: new Date() })
      .where(inArray(rescheduleRequests.id, ids));
  }

  async restoreRescheduleRequests(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db
      .update(rescheduleRequests)
      .set({ archivedAt: null })
      .where(inArray(rescheduleRequests.id, ids));
  }

  async permanentDeleteRescheduleRequests(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    // Only permit hard-deletion of requests that are already archived.
    await db
      .delete(rescheduleRequests)
      .where(
        and(
          inArray(rescheduleRequests.id, ids),
          sql`${rescheduleRequests.archivedAt} IS NOT NULL`,
        ),
      );
  }

  async getCalendarFilterColors(): Promise<CalendarFilterColor[]> {
    return db.select().from(calendarFilterColors);
  }

  async updateCalendarFilterColor(
    statusKey: string,
    color: string,
  ): Promise<CalendarFilterColor> {
    const [existing] = await db
      .select()
      .from(calendarFilterColors)
      .where(eq(calendarFilterColors.statusKey, statusKey));
    if (existing) {
      const [updated] = await db
        .update(calendarFilterColors)
        .set({ color, updatedAt: new Date() })
        .where(eq(calendarFilterColors.statusKey, statusKey))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(calendarFilterColors)
      .values({ statusKey, color })
      .returning();
    return created;
  }

  async getJobTimer(
    calendarEventId: number,
    userId: number,
  ): Promise<JobTimer | undefined> {
    const [timer] = await db
      .select()
      .from(jobTimers)
      .where(
        and(
          eq(jobTimers.calendarEventId, calendarEventId),
          eq(jobTimers.userId, userId),
        ),
      )
      .orderBy(desc(jobTimers.createdAt))
      .limit(1);
    return timer || undefined;
  }

  async getJobTimersByEvent(calendarEventId: number): Promise<JobTimer[]> {
    return db
      .select()
      .from(jobTimers)
      .where(eq(jobTimers.calendarEventId, calendarEventId))
      .orderBy(desc(jobTimers.createdAt));
  }

  async startJobTimer(
    calendarEventId: number,
    userId: number,
  ): Promise<JobTimer> {
    const [timer] = await db
      .insert(jobTimers)
      .values({
        calendarEventId,
        userId,
        startTime: new Date(),
        status: "active",
      })
      .returning();
    return timer;
  }

  async stopJobTimer(
    calendarEventId: number,
    userId: number,
  ): Promise<JobTimer | undefined> {
    const [active] = await db
      .select()
      .from(jobTimers)
      .where(
        and(
          eq(jobTimers.calendarEventId, calendarEventId),
          eq(jobTimers.userId, userId),
          eq(jobTimers.status, "active"),
        ),
      )
      .orderBy(desc(jobTimers.createdAt))
      .limit(1);
    if (!active) return undefined;
    const endTime = new Date();
    const totalSeconds = Math.floor(
      (endTime.getTime() - active.startTime.getTime()) / 1000,
    );
    const [updated] = await db
      .update(jobTimers)
      .set({ endTime, totalSeconds, status: "completed" })
      .where(eq(jobTimers.id, active.id))
      .returning();
    return updated;
  }

  async stopAllActiveTimersForEvent(calendarEventId: number): Promise<number> {
    const activeTimers = await db
      .select()
      .from(jobTimers)
      .where(
        and(
          eq(jobTimers.calendarEventId, calendarEventId),
          eq(jobTimers.status, "active"),
        ),
      );
    const endTime = new Date();
    let stopped = 0;
    for (const timer of activeTimers) {
      const totalSeconds = Math.floor(
        (endTime.getTime() - timer.startTime.getTime()) / 1000,
      );
      await db
        .update(jobTimers)
        .set({ endTime, totalSeconds, status: "completed" })
        .where(eq(jobTimers.id, timer.id));
      stopped++;
    }
    return stopped;
  }

  // Installer Notifications
  async createInstallerNotification(
    notification: InsertInstallerNotification,
  ): Promise<InstallerNotification> {
    const [created] = await db
      .insert(installerNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getInstallerNotificationsForUser(
    userId: number,
  ): Promise<(InstallerNotification & { calendarEvent: CalendarEvent })[]> {
    const now = new Date();
    const results = await db
      .select({
        notification: installerNotifications,
        calendarEvent: calendarEvents,
      })
      .from(installerNotifications)
      .innerJoin(
        calendarEvents,
        eq(installerNotifications.calendarEventId, calendarEvents.id),
      )
      .where(
        and(
          eq(installerNotifications.userId, userId),
          gt(installerNotifications.expiresAt, now),
        ),
      )
      .orderBy(desc(installerNotifications.createdAt));

    return results.map((r) => ({
      ...r.notification,
      calendarEvent: r.calendarEvent,
    }));
  }

  async getInstallerNotification(
    id: number,
  ): Promise<
    (InstallerNotification & { calendarEvent: CalendarEvent }) | undefined
  > {
    const [result] = await db
      .select({
        notification: installerNotifications,
        calendarEvent: calendarEvents,
      })
      .from(installerNotifications)
      .innerJoin(
        calendarEvents,
        eq(installerNotifications.calendarEventId, calendarEvents.id),
      )
      .where(eq(installerNotifications.id, id));

    if (!result) return undefined;
    return {
      ...result.notification,
      calendarEvent: result.calendarEvent,
    };
  }

  async updateInstallerNotification(
    id: number,
    data: Partial<InsertInstallerNotification>,
  ): Promise<InstallerNotification | undefined> {
    const [updated] = await db
      .update(installerNotifications)
      .set(data)
      .where(eq(installerNotifications.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteExpiredInstallerNotifications(): Promise<number> {
    const now = new Date();
    const expired = await db
      .select({ id: installerNotifications.id })
      .from(installerNotifications)
      .where(sql`${installerNotifications.expiresAt} <= ${now}`);
    if (expired.length === 0) return 0;
    await db.delete(installerNotifications).where(
      inArray(
        installerNotifications.id,
        expired.map((e) => e.id),
      ),
    );
    return expired.length;
  }

  async getInstallerNotificationByEventAndUser(
    calendarEventId: number,
    userId: number,
  ): Promise<InstallerNotification | undefined> {
    const [result] = await db
      .select()
      .from(installerNotifications)
      .where(
        and(
          eq(installerNotifications.calendarEventId, calendarEventId),
          eq(installerNotifications.userId, userId),
        ),
      );
    return result || undefined;
  }

  async getBusinessDetailsByAdminId(adminId: number): Promise<BusinessDetails | undefined> {
    const [result] = await db
      .select()
      .from(businessDetails)
      .where(eq(businessDetails.adminId, adminId));
    return result || undefined;
  }

  async createBusinessDetails(details: InsertBusinessDetails): Promise<BusinessDetails> {
    const [created] = await db.insert(businessDetails).values(details).returning();
    return created;
  }

  async updateBusinessDetails(adminId: number, data: Partial<InsertBusinessDetails>): Promise<BusinessDetails | undefined> {
    const [updated] = await db
      .update(businessDetails)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(businessDetails.adminId, adminId))
      .returning();
    return updated || undefined;
  }

  async getGlobalTags(): Promise<GlobalTag[]> {
    return db
      .select()
      .from(globalTags)
      .orderBy(globalTags.name);
  }

  async createGlobalTag(tag: InsertGlobalTag): Promise<GlobalTag> {
    const [created] = await db.insert(globalTags).values(tag).returning();
    return created;
  }

  async updateGlobalTag(id: number, data: Partial<InsertGlobalTag>): Promise<GlobalTag | undefined> {
    const [updated] = await db
      .update(globalTags)
      .set(data)
      .where(eq(globalTags.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteGlobalTag(id: number): Promise<void> {
    await db.delete(globalTags).where(eq(globalTags.id, id));
  }

  async getOwnerTags(ownerId: number): Promise<OwnerTag[]> {
    return db
      .select()
      .from(ownerTags)
      .where(eq(ownerTags.ownerId, ownerId))
      .orderBy(desc(ownerTags.createdAt));
  }

  async createOwnerTag(tag: InsertOwnerTag): Promise<OwnerTag> {
    const [created] = await db.insert(ownerTags).values(tag).returning();
    return created;
  }

  async updateOwnerTag(id: number, data: Partial<InsertOwnerTag>, ownerId?: number): Promise<OwnerTag | undefined> {
    const conditions = ownerId
      ? and(eq(ownerTags.id, id), eq(ownerTags.ownerId, ownerId))
      : eq(ownerTags.id, id);
    const [updated] = await db
      .update(ownerTags)
      .set(data)
      .where(conditions!)
      .returning();
    return updated || undefined;
  }

  async deleteOwnerTag(id: number, ownerId?: number): Promise<void> {
    const conditions = ownerId
      ? and(eq(ownerTags.id, id), eq(ownerTags.ownerId, ownerId))
      : eq(ownerTags.id, id);
    await db.delete(ownerTags).where(conditions!);
  }

  async getOnboardingQuestions(): Promise<OnboardingQuestion[]> {
    return db.select().from(onboardingQuestions).orderBy(onboardingQuestions.stepOrder, onboardingQuestions.sortOrder);
  }

  async getActiveOnboardingQuestions(): Promise<OnboardingQuestion[]> {
    return db.select().from(onboardingQuestions).where(eq(onboardingQuestions.isActive, true)).orderBy(onboardingQuestions.stepOrder, onboardingQuestions.sortOrder);
  }

  async createOnboardingQuestion(question: InsertOnboardingQuestion): Promise<OnboardingQuestion> {
    const [created] = await db.insert(onboardingQuestions).values(question).returning();
    return created;
  }

  async updateOnboardingQuestion(id: number, data: Partial<InsertOnboardingQuestion>): Promise<OnboardingQuestion | undefined> {
    const [updated] = await db.update(onboardingQuestions).set(data).where(eq(onboardingQuestions.id, id)).returning();
    return updated || undefined;
  }

  async deleteOnboardingQuestion(id: number): Promise<void> {
    await db.delete(onboardingQuestions).where(eq(onboardingQuestions.id, id));
  }

  async getEmailTemplatesByAdminId(adminId: number): Promise<EmailTemplateConfig[]> {
    return db.select().from(emailTemplatesConfig).where(eq(emailTemplatesConfig.adminId, adminId));
  }

  async getEmailTemplate(adminId: number, emailType: string): Promise<EmailTemplateConfig | undefined> {
    const [template] = await db.select().from(emailTemplatesConfig)
      .where(and(eq(emailTemplatesConfig.adminId, adminId), eq(emailTemplatesConfig.emailType, emailType)));
    return template || undefined;
  }

  async upsertEmailTemplate(data: InsertEmailTemplateConfig): Promise<EmailTemplateConfig> {
    const existing = await this.getEmailTemplate(data.adminId, data.emailType);
    if (existing) {
      const [updated] = await db.update(emailTemplatesConfig)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(emailTemplatesConfig.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(emailTemplatesConfig).values(data).returning();
    return created;
  }

  async deleteEmailTemplate(adminId: number, emailType: string): Promise<void> {
    await db.delete(emailTemplatesConfig)
      .where(and(eq(emailTemplatesConfig.adminId, adminId), eq(emailTemplatesConfig.emailType, emailType)));
  }

  async getEmailSignatureByAdminId(adminId: number): Promise<EmailSignature | undefined> {
    const [sig] = await db.select().from(emailSignatures).where(eq(emailSignatures.adminId, adminId));
    return sig || undefined;
  }

  async upsertEmailSignature(data: InsertEmailSignature): Promise<EmailSignature> {
    const existing = await this.getEmailSignatureByAdminId(data.adminId);
    if (existing) {
      const [updated] = await db.update(emailSignatures)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(emailSignatures.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(emailSignatures).values(data).returning();
    return created;
  }

  async getSurvey(id: number): Promise<Survey | undefined> {
    const [survey] = await db.select().from(surveys).where(eq(surveys.id, id));
    return survey || undefined;
  }

  async getSurveysByCreator(createdBy: number): Promise<Survey[]> {
    return db.select().from(surveys).where(eq(surveys.createdBy, createdBy)).orderBy(desc(surveys.createdAt));
  }

  async getSurveyByCalendarEventId(calendarEventId: number): Promise<Survey | undefined> {
    const [survey] = await db.select().from(surveys).where(eq(surveys.calendarEventId, calendarEventId));
    return survey || undefined;
  }

  async createSurvey(survey: InsertSurvey): Promise<Survey> {
    const [created] = await db.insert(surveys).values(survey).returning();
    return created;
  }

  async updateSurvey(id: number, data: Partial<InsertSurvey>): Promise<Survey | undefined> {
    const [updated] = await db.update(surveys).set({ ...data, updatedAt: new Date() }).where(eq(surveys.id, id)).returning();
    return updated || undefined;
  }

  async deleteSurvey(id: number): Promise<void> {
    await db.delete(surveyPhotos).where(eq(surveyPhotos.surveyId, id));
    await db.delete(surveys).where(eq(surveys.id, id));
  }

  async getSurveyPhotos(surveyId: number): Promise<SurveyPhoto[]> {
    return db.select().from(surveyPhotos).where(eq(surveyPhotos.surveyId, surveyId)).orderBy(surveyPhotos.sortOrder);
  }

  async getSurveyPhoto(id: number): Promise<SurveyPhoto | undefined> {
    const [photo] = await db.select().from(surveyPhotos).where(eq(surveyPhotos.id, id));
    return photo || undefined;
  }

  async createSurveyPhoto(photo: InsertSurveyPhoto): Promise<SurveyPhoto> {
    const [created] = await db.insert(surveyPhotos).values(photo).returning();
    return created;
  }

  async updateSurveyPhoto(id: number, data: Partial<InsertSurveyPhoto>): Promise<SurveyPhoto | undefined> {
    const [updated] = await db.update(surveyPhotos).set(data).where(eq(surveyPhotos.id, id)).returning();
    return updated || undefined;
  }

  async deleteSurveyPhoto(id: number): Promise<void> {
    await db.delete(surveyPhotos).where(eq(surveyPhotos.id, id));
  }

  // Feedback Items
  async createFeedbackItem(item: InsertFeedbackItem): Promise<FeedbackItem> {
    const [created] = await db.insert(feedbackItems).values(item).returning();
    return created;
  }

  async listFeedbackItems(status?: string): Promise<(FeedbackItem & { userName?: string; userEmail?: string })[]> {
    const rows = await db.select().from(feedbackItems).orderBy(desc(feedbackItems.createdAt));
    const filtered = status && status !== "all" ? rows.filter(r => r.status === status) : rows;
    const userIds = [...new Set(filtered.map(r => r.userId).filter((id): id is number => id != null))];
    const userMap = new Map<number, { name: string; email: string | null }>();
    if (userIds.length > 0) {
      const fetchedUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds));
      for (const u of fetchedUsers) userMap.set(u.id, { name: u.name, email: u.email });
    }
    return filtered.map(r => ({
      ...r,
      userName: r.userId ? userMap.get(r.userId)?.name : undefined,
      userEmail: r.userId ? userMap.get(r.userId)?.email ?? undefined : undefined,
    }));
  }

  async updateFeedbackItemStatus(id: number, status: string): Promise<FeedbackItem | undefined> {
    const [updated] = await db.update(feedbackItems).set({ status }).where(eq(feedbackItems.id, id)).returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
