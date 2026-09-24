import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "InstalliQ.ai API Documentation",
      version: "1.0.0",
      description: "Complete API documentation for InstalliQ.ai - AI-Powered Field Proof for FASTSIGNS of Waltham",
      contact: {
        name: "InstalliQ Team",
      },
    },
    servers: [
      {
        url: "/",
        description: "Current server",
      },
    ],
    tags: [
      { name: "Authentication", description: "Login, signup, session, password management" },
      { name: "Two-Factor Auth", description: "2FA setup, verification, and management" },
      { name: "Face Recognition", description: "Face login and registration" },
      { name: "Google OAuth", description: "Google sign-in integration" },
      { name: "Password Reset", description: "Request and complete password resets" },
      { name: "Onboarding", description: "Multi-step onboarding form" },
      { name: "User Management", description: "Admin user CRUD operations" },
      { name: "Projects", description: "Project management and photo uploads" },
      { name: "Image Analysis", description: "AI-powered image analysis and tagging" },
      { name: "Calendar Events", description: "Event scheduling and management" },
      { name: "AI Extraction", description: "PDF/image work order data extraction" },
      { name: "Jobs", description: "Job and work order management" },
      { name: "Install Events", description: "Installation event tracking" },
      { name: "Attachments", description: "File attachments for jobs" },
      { name: "Weather", description: "Weather forecasting and geocoding" },
      { name: "Notifications", description: "Email notifications and confirmations" },
      { name: "Reschedule", description: "Booking reschedule requests" },
      { name: "Installer Notifications", description: "In-app notifications for installers" },
      { name: "Calendar Filters", description: "Calendar filter color customization" },
      { name: "Job Timers", description: "Job time tracking" },
      { name: "AI Assistant", description: "OpenAI Assistant settings and file management" },
      { name: "Admin Tools", description: "Super admin tools and migrations" },
    ],
    components: {
      securitySchemes: {
        sessionAuth: {
          type: "apiKey",
          in: "cookie",
          name: "connect.sid",
          description: "Session-based authentication cookie",
        },
      },
    },
    paths: {
      "/api/auth/me": {
        get: {
          tags: ["Authentication"],
          summary: "Get current authenticated user",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns current user object" },
            401: { description: "Not authenticated" },
          },
        },
      },
      "/api/auth/signup": {
        post: {
          tags: ["Authentication"],
          summary: "Create a new user account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password", "name", "email"],
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    name: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "User created successfully" },
            400: { description: "Validation error" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "Login with email/phone and password",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password"],
                  properties: {
                    username: { type: "string", description: "Email or phone number" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful, returns user object" },
            401: { description: "Invalid credentials" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Authentication"],
          summary: "Logout current session",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Logged out successfully" },
          },
        },
      },
      "/api/auth/face-login": {
        post: {
          tags: ["Face Recognition"],
          summary: "Login using face recognition",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["descriptor"],
                  properties: {
                    descriptor: { type: "array", items: { type: "number" }, description: "128-d face embedding" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Face login successful" },
            401: { description: "No matching face found" },
          },
        },
      },
      "/api/auth/face-register": {
        post: {
          tags: ["Face Recognition"],
          summary: "Register face for face login",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["descriptor"],
                  properties: {
                    descriptor: { type: "array", items: { type: "number" } },
                    photo: { type: "string", description: "Base64 encoded face photo" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Face registered successfully" },
          },
        },
      },
      "/api/auth/face-disable": {
        post: {
          tags: ["Face Recognition"],
          summary: "Disable face login",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Face login disabled" },
          },
        },
      },
      "/api/auth/face-status": {
        get: {
          tags: ["Face Recognition"],
          summary: "Check if face login is enabled",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns face login status" },
          },
        },
      },
      "/api/auth/google/available": {
        get: {
          tags: ["Google OAuth"],
          summary: "Check if Google OAuth is configured",
          responses: {
            200: { description: "Returns availability status" },
          },
        },
      },
      "/api/auth/google/status": {
        get: {
          tags: ["Google OAuth"],
          summary: "Check if Google account is linked",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns Google link status" },
          },
        },
      },
      "/api/auth/google": {
        get: {
          tags: ["Google OAuth"],
          summary: "Initiate Google OAuth login flow",
          responses: {
            302: { description: "Redirects to Google consent page" },
          },
        },
      },
      "/api/auth/google/callback": {
        get: {
          tags: ["Google OAuth"],
          summary: "Google OAuth callback handler",
          parameters: [
            { name: "code", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            302: { description: "Redirects to app after authentication" },
          },
        },
      },
      "/api/auth/google/2fa-verify": {
        post: {
          tags: ["Google OAuth"],
          summary: "Verify 2FA code after Google OAuth login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "code"],
                  properties: {
                    userId: { type: "integer" },
                    code: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "2FA verified, login complete" },
          },
        },
      },
      "/api/auth/google/unlink": {
        post: {
          tags: ["Google OAuth"],
          summary: "Unlink Google account",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Google account unlinked" },
          },
        },
      },
      "/api/auth/2fa/setup": {
        post: {
          tags: ["Two-Factor Auth"],
          summary: "Initialize 2FA setup (generates QR code)",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns QR code URL and secret key" },
          },
        },
      },
      "/api/auth/2fa/verify": {
        post: {
          tags: ["Two-Factor Auth"],
          summary: "Verify and enable 2FA with TOTP code",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["code"],
                  properties: {
                    code: { type: "string", description: "6-digit TOTP code" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "2FA enabled successfully" },
          },
        },
      },
      "/api/auth/2fa/disable": {
        post: {
          tags: ["Two-Factor Auth"],
          summary: "Disable 2FA (requires password confirmation)",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["password"],
                  properties: {
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "2FA disabled" },
          },
        },
      },
      "/api/auth/2fa/status": {
        get: {
          tags: ["Two-Factor Auth"],
          summary: "Check 2FA enabled status",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns 2FA status" },
          },
        },
      },
      "/api/auth/2fa/validate-login": {
        post: {
          tags: ["Two-Factor Auth"],
          summary: "Validate 2FA code during login",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "code"],
                  properties: {
                    userId: { type: "integer" },
                    code: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login complete" },
            401: { description: "Invalid 2FA code" },
          },
        },
      },
      "/api/auth/request-password-reset": {
        post: {
          tags: ["Password Reset"],
          summary: "Request a password reset email",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Reset email sent if account exists" },
          },
        },
      },
      "/api/auth/validate-reset-token": {
        get: {
          tags: ["Password Reset"],
          summary: "Validate a password reset token",
          parameters: [
            { name: "token", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Token is valid" },
            400: { description: "Token is invalid or expired" },
          },
        },
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Password Reset"],
          summary: "Reset password using token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["token", "password"],
                  properties: {
                    token: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Password reset successful" },
          },
        },
      },
      "/api/auth/change-password": {
        post: {
          tags: ["Authentication"],
          summary: "Change password (requires current password)",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["currentPassword", "newPassword"],
                  properties: {
                    currentPassword: { type: "string" },
                    newPassword: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Password changed" },
            401: { description: "Current password incorrect" },
          },
        },
      },
      "/api/onboarding": {
        get: {
          tags: ["Onboarding"],
          summary: "Get onboarding form data",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns onboarding form data" },
          },
        },
        post: {
          tags: ["Onboarding"],
          summary: "Submit onboarding form",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Multi-section onboarding form data (Business Info, Team & Scheduling, Capabilities, Products, Install Standards)",
                },
              },
            },
          },
          responses: {
            200: { description: "Onboarding saved" },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["User Management"],
          summary: "List all users (filtered by role)",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "includeDeleted", in: "query", schema: { type: "boolean" } },
          ],
          responses: {
            200: { description: "Returns array of users" },
            403: { description: "Admin access required" },
          },
        },
        post: {
          tags: ["User Management"],
          summary: "Create a new user",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["username", "password", "name", "role"],
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                    name: { type: "string" },
                    role: { type: "string", enum: ["user", "admin"] },
                    email: { type: "string" },
                    phone: { type: "string" },
                    location: { type: "string" },
                    jobTitle: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "User created" },
          },
        },
      },
      "/api/admin/users/export-csv": {
        get: {
          tags: ["User Management"],
          summary: "Export users as CSV",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "CSV file download" },
          },
        },
      },
      "/api/admin/assignable-users": {
        get: {
          tags: ["User Management"],
          summary: "List users assignable to calendar events",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of assignable users" },
          },
        },
      },
      "/api/admin/users/deleted": {
        get: {
          tags: ["User Management"],
          summary: "List archived (soft-deleted) users",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of deleted users" },
          },
        },
      },
      "/api/admin/users/{id}/restore": {
        post: {
          tags: ["User Management"],
          summary: "Restore a soft-deleted user",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "User restored" },
          },
        },
      },
      "/api/admin/users/{adminId}/members": {
        get: {
          tags: ["User Management"],
          summary: "Get users created by a specific admin",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "adminId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns array of users" },
          },
        },
      },
      "/api/admin/users/{id}": {
        patch: {
          tags: ["User Management"],
          summary: "Update a user",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string" },
                    phone: { type: "string" },
                    role: { type: "string" },
                    location: { type: "string" },
                    jobTitle: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "User updated" },
          },
        },
        delete: {
          tags: ["User Management"],
          summary: "Soft-delete a user",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "User archived" },
          },
        },
      },
      "/api/admin/users/{id}/reset-password": {
        post: {
          tags: ["User Management"],
          summary: "Admin reset user password",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["newPassword"],
                  properties: {
                    newPassword: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Password reset" },
          },
        },
      },
      "/api/projects": {
        get: {
          tags: ["Projects"],
          summary: "List all projects",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of projects" },
          },
        },
        post: {
          tags: ["Projects"],
          summary: "Create a new project with images",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    tags: { type: "string" },
                    jobLabel: { type: "string" },
                    images: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Project created" },
          },
        },
      },
      "/api/projects/export": {
        post: {
          tags: ["Projects"],
          summary: "Export projects data",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    format: { type: "string", enum: ["csv", "pdf"] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Export file download" },
          },
        },
      },
      "/api/projects/{id}": {
        get: {
          tags: ["Projects"],
          summary: "Get project by ID",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns project object" },
          },
        },
        patch: {
          tags: ["Projects"],
          summary: "Update project details",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    description: { type: "string" },
                    tags: { type: "string" },
                    jobLabel: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Project updated" },
          },
        },
        delete: {
          tags: ["Projects"],
          summary: "Delete a project",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Project deleted" },
          },
        },
      },
      "/api/projects/{id}/images": {
        post: {
          tags: ["Projects"],
          summary: "Add images to existing project",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    images: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Images added" },
          },
        },
      },
      "/api/projects/{id}/location": {
        patch: {
          tags: ["Projects"],
          summary: "Update project location",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Location updated" },
          },
        },
      },
      "/api/projects/{id}/pdf": {
        get: {
          tags: ["Projects"],
          summary: "Generate PDF report for project",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "PDF file download" },
          },
        },
      },
      "/api/projects/{id}/email": {
        post: {
          tags: ["Projects"],
          summary: "Email project report",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["recipients"],
                  properties: {
                    recipients: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Email sent" },
          },
        },
      },
      "/api/projects/{id}/report-issue": {
        post: {
          tags: ["Projects"],
          summary: "Report an issue on a project",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Issue reported" },
          },
        },
      },
      "/api/analyze-image": {
        post: {
          tags: ["Image Analysis"],
          summary: "Analyze image with AI for auto-tagging",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    image: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Returns AI-generated tags and description" },
          },
        },
      },
      "/api/calendar-events": {
        get: {
          tags: ["Calendar Events"],
          summary: "List all calendar events",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of calendar events" },
          },
        },
        post: {
          tags: ["Calendar Events"],
          summary: "Create a calendar event",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "startTime", "endTime"],
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    startTime: { type: "string", format: "date-time" },
                    endTime: { type: "string", format: "date-time" },
                    location: { type: "string" },
                    status: { type: "string" },
                    customerName: { type: "string" },
                    customerPhone: { type: "string" },
                    customerEmail: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Event created" },
          },
        },
      },
      "/api/calendar-events/with-attachments": {
        post: {
          tags: ["Calendar Events"],
          summary: "Create calendar event with file attachments",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    startTime: { type: "string" },
                    endTime: { type: "string" },
                    files: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Event created with attachments" },
          },
        },
      },
      "/api/calendar-events/{id}": {
        patch: {
          tags: ["Calendar Events"],
          summary: "Update a calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Event updated" },
          },
        },
        delete: {
          tags: ["Calendar Events"],
          summary: "Delete a calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Event deleted" },
          },
        },
      },
      "/api/calendar-events/{id}/details": {
        get: {
          tags: ["Calendar Events"],
          summary: "Get detailed event info with job and attachments",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns event with full details" },
          },
        },
      },
      "/api/calendar-events/{id}/add-files": {
        post: {
          tags: ["Calendar Events"],
          summary: "Add files to existing calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    files: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Files added" },
          },
        },
      },
      "/api/calendar-events/{id}/assignments": {
        get: {
          tags: ["Calendar Events"],
          summary: "Get user assignments for event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns assignments" },
          },
        },
        post: {
          tags: ["Calendar Events"],
          summary: "Assign users to a calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userIds"],
                  properties: {
                    userIds: { type: "array", items: { type: "integer" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Users assigned" },
          },
        },
      },
      "/api/calendar-events/{id}/send-assignment-emails": {
        post: {
          tags: ["Calendar Events"],
          summary: "Send email notifications to assigned users",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Emails sent" },
          },
        },
      },
      "/api/calendar-events/{id}/report-issue": {
        post: {
          tags: ["Calendar Events"],
          summary: "Report issue on a calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Issue reported" },
          },
        },
      },
      "/api/calendar-events/export": {
        post: {
          tags: ["Calendar Events"],
          summary: "Export calendar events data",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Export file download" },
          },
        },
      },
      "/api/calendar-events/extract-file-data": {
        post: {
          tags: ["AI Extraction"],
          summary: "Extract data from uploaded work order file (PDF/image)",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary", description: "PDF or image file" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Returns extracted work order data (customer, address, sign types, etc.)" },
          },
        },
      },
      "/api/calendar-events/from-pdf": {
        post: {
          tags: ["AI Extraction"],
          summary: "Create events from PDF work orders with AI extraction",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    pdfs: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Events created from extracted PDF data" },
          },
        },
      },
      "/api/intake/create-from-prompt": {
        post: {
          tags: ["AI Extraction"],
          summary: "Create event from natural language prompt with file attachments",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    prompt: { type: "string", description: "Natural language scheduling request" },
                    files: { type: "array", items: { type: "string", format: "binary" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Event created from prompt" },
          },
        },
      },
      "/api/jobs": {
        get: {
          tags: ["Jobs"],
          summary: "List all jobs",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of jobs" },
          },
        },
        post: {
          tags: ["Jobs"],
          summary: "Create a new job",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    woNumber: { type: "string" },
                    invoiceNumber: { type: "string" },
                    customer: { type: "string" },
                    salesperson: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Job created" },
          },
        },
      },
      "/api/jobs/{id}": {
        get: {
          tags: ["Jobs"],
          summary: "Get job by ID",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns job object" },
          },
        },
        patch: {
          tags: ["Jobs"],
          summary: "Update a job",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Job updated" },
          },
        },
        delete: {
          tags: ["Jobs"],
          summary: "Delete a job",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Job deleted" },
          },
        },
      },
      "/api/jobs/{jobId}/attachments": {
        get: {
          tags: ["Attachments"],
          summary: "Get attachments for a job",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns array of attachments" },
          },
        },
        post: {
          tags: ["Attachments"],
          summary: "Add attachment to job",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            201: { description: "Attachment added" },
          },
        },
      },
      "/api/jobs/{jobId}/upload-photos": {
        post: {
          tags: ["Attachments"],
          summary: "Upload completion photos for a job",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "jobId", in: "path", required: true, schema: { type: "integer" } },
          ],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    photos: { type: "array", items: { type: "string", format: "binary" }, maxItems: 10 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Photos uploaded" },
          },
        },
      },
      "/api/install-events": {
        get: {
          tags: ["Install Events"],
          summary: "List all install events",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of install events" },
          },
        },
        post: {
          tags: ["Install Events"],
          summary: "Create an install event",
          security: [{ sessionAuth: [] }],
          responses: {
            201: { description: "Install event created" },
          },
        },
      },
      "/api/install-events/{id}": {
        patch: {
          tags: ["Install Events"],
          summary: "Update an install event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Install event updated" },
          },
        },
      },
      "/api/weather": {
        get: {
          tags: ["Weather"],
          summary: "Get weather for a location",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lon", in: "query", required: true, schema: { type: "number" } },
          ],
          responses: {
            200: { description: "Returns weather data" },
          },
        },
      },
      "/api/weather/forecast": {
        get: {
          tags: ["Weather"],
          summary: "Get multi-day weather forecast",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lon", in: "query", required: true, schema: { type: "number" } },
          ],
          responses: {
            200: { description: "Returns forecast data" },
          },
        },
      },
      "/api/weather/default-location": {
        get: {
          tags: ["Weather"],
          summary: "Get default weather location (Waltham, MA)",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns default coordinates" },
          },
        },
      },
      "/api/geocode": {
        post: {
          tags: ["Weather"],
          summary: "Geocode an address to coordinates",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["address"],
                  properties: {
                    address: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Returns lat/lon coordinates" },
          },
        },
      },
      "/api/confirm-booking/{token}": {
        get: {
          tags: ["Notifications"],
          summary: "Confirm a booking via email token",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Booking confirmed" },
          },
        },
      },
      "/api/booking-calendar/{token}": {
        get: {
          tags: ["Notifications"],
          summary: "Get booking calendar page via token",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Returns booking calendar page" },
          },
        },
      },
      "/api/notifications/send-schedule-confirmation": {
        post: {
          tags: ["Notifications"],
          summary: "Send schedule confirmation email to customer",
          security: [{ sessionAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["eventId"],
                  properties: {
                    eventId: { type: "integer" },
                    recipientEmail: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Confirmation email sent" },
          },
        },
      },
      "/api/reschedule-booking/{token}": {
        get: {
          tags: ["Reschedule"],
          summary: "Get reschedule form via token",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Returns reschedule form" },
          },
        },
        post: {
          tags: ["Reschedule"],
          summary: "Submit reschedule request",
          parameters: [
            { name: "token", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    preferredDate: { type: "string" },
                    reason: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Reschedule request submitted" },
          },
        },
      },
      "/api/reschedule-requests": {
        get: {
          tags: ["Reschedule"],
          summary: "List all reschedule requests",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of reschedule requests" },
          },
        },
      },
      "/api/reschedule-requests/{id}": {
        patch: {
          tags: ["Reschedule"],
          summary: "Update a reschedule request",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Request updated" },
          },
        },
      },
      "/api/reschedule-requests/archive": {
        post: {
          tags: ["Reschedule"],
          summary: "Archive reschedule requests (bulk)",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ids"],
                  properties: {
                    ids: { type: "array", items: { type: "integer" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Requests archived" },
          },
        },
      },
      "/api/reschedule-requests/restore": {
        post: {
          tags: ["Reschedule"],
          summary: "Restore archived reschedule requests",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ids"],
                  properties: {
                    ids: { type: "array", items: { type: "integer" } },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Requests restored" },
          },
        },
      },
      "/api/installer-notifications": {
        get: {
          tags: ["Installer Notifications"],
          summary: "Get installer notifications for current user",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns array of notifications" },
          },
        },
      },
      "/api/installer-notifications/{id}": {
        get: {
          tags: ["Installer Notifications"],
          summary: "Get single installer notification",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns notification" },
          },
        },
        patch: {
          tags: ["Installer Notifications"],
          summary: "Update notification (mark read, status update)",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Notification updated" },
          },
        },
      },
      "/api/calendar-filter-colors": {
        get: {
          tags: ["Calendar Filters"],
          summary: "Get calendar filter colors",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns filter color settings" },
          },
        },
      },
      "/api/calendar-filter-colors/{statusKey}": {
        patch: {
          tags: ["Calendar Filters"],
          summary: "Update calendar filter color",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "statusKey", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["color"],
                  properties: {
                    color: { type: "string", description: "Hex color code" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Color updated" },
          },
        },
      },
      "/api/job-timers/{calendarEventId}": {
        get: {
          tags: ["Job Timers"],
          summary: "Get job timer for a calendar event",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "calendarEventId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns timer data" },
          },
        },
      },
      "/api/job-timers/{calendarEventId}/start": {
        post: {
          tags: ["Job Timers"],
          summary: "Start job timer",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "calendarEventId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Timer started" },
          },
        },
      },
      "/api/job-timers/{calendarEventId}/stop": {
        post: {
          tags: ["Job Timers"],
          summary: "Stop job timer",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "calendarEventId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Timer stopped" },
          },
        },
      },
      "/api/assistant/settings": {
        get: {
          tags: ["AI Assistant"],
          summary: "Get AI Assistant settings for current user",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Returns assistant settings" },
          },
        },
      },
      "/api/assistant/admin/{adminId}/settings": {
        get: {
          tags: ["AI Assistant"],
          summary: "Get AI Assistant settings for specific admin (Super Admin only)",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "adminId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Returns assistant settings" },
          },
        },
      },
      "/api/assistant/instructions": {
        put: {
          tags: ["AI Assistant"],
          summary: "Update AI Assistant instructions",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["instructions"],
                  properties: {
                    instructions: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Instructions updated" },
          },
        },
      },
      "/api/assistant/admin/{adminId}/instructions": {
        put: {
          tags: ["AI Assistant"],
          summary: "Update AI Assistant instructions for specific admin",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "adminId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Instructions updated" },
          },
        },
      },
      "/api/assistant/files": {
        post: {
          tags: ["AI Assistant"],
          summary: "Upload knowledge file to AI Assistant",
          security: [{ sessionAuth: [] }],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "File uploaded to vector store" },
          },
        },
      },
      "/api/assistant/admin/{adminId}/files": {
        post: {
          tags: ["AI Assistant"],
          summary: "Upload knowledge file for specific admin's assistant",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "adminId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "File uploaded" },
          },
        },
      },
      "/api/assistant/files/vector-store/{openaiFileId}": {
        delete: {
          tags: ["AI Assistant"],
          summary: "Delete file from vector store",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "openaiFileId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: {
            200: { description: "File deleted from vector store" },
          },
        },
      },
      "/api/assistant/files/{fileId}": {
        delete: {
          tags: ["AI Assistant"],
          summary: "Delete knowledge file",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "fileId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "File deleted" },
          },
        },
      },
      "/api/assistant/create": {
        post: {
          tags: ["AI Assistant"],
          summary: "Create personalized AI Assistant",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Assistant created" },
          },
        },
      },
      "/api/assistant/admin/{adminId}/create": {
        post: {
          tags: ["AI Assistant"],
          summary: "Create AI Assistant for specific admin",
          security: [{ sessionAuth: [] }],
          parameters: [
            { name: "adminId", in: "path", required: true, schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Assistant created" },
          },
        },
      },
      "/api/admin/migrate-images-to-cloud": {
        post: {
          tags: ["Admin Tools"],
          summary: "Migrate local images to cloud storage (Super Admin only)",
          security: [{ sessionAuth: [] }],
          responses: {
            200: { description: "Migration complete" },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
