const env = process.env;

export const NODE_ENV = env.NODE_ENV || "development";
export const isProduction = NODE_ENV === "production";
export const isDevelopment = NODE_ENV === "development";
export const isStaging = NODE_ENV === "staging";

export const config = {
  port: parseInt(env.PORT || "5000", 10),
  nodeEnv: NODE_ENV,
  isProduction,
  isDevelopment,

  db: {
    url: env.DIGITALOCEAN_DATABASE_URL || env.DATABASE_URL || "",
    ssl: !!env.DIGITALOCEAN_DATABASE_URL,
  },

  session: {
    secret: env.SESSION_SECRET || "",
  },

  smtp: {
    host: env.SMTP_HOST || "smtp0001.neo.space",
    port: parseInt(env.SMTP_PORT || "587", 10),
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.SMTP_FROM || env.SMTP_USER || "info@installiq.ai",
  },

  sendgrid: {
    apiKey: env.SENDGRID_API_KEY || "",
  },

  openai: {
    apiKey: env.OPENAI_API_KEY || "",
    assistantId: env.OPENAI_ASSISTANT_ID || "",
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID || "",
    clientSecret: env.GOOGLE_CLIENT_SECRET || "",
  },

  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || "",
    keySecret: env.RAZORPAY_KEY_SECRET || "",
  },

  doSpaces: {
    endpoint: env.DO_SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com",
    bucket: env.DO_SPACES_BUCKET || "productionstorage",
    cdnUrl: env.DO_SPACES_CDN_URL || "https://productionstorage.nyc3.digitaloceanspaces.com",
    key: env.DO_SPACES_KEY || "",
    secret: env.DO_SPACES_SECRET || "",
  },

  weather: {
    apiKey: env.OPENWEATHER_API_KEY || "",
  },

  baseUrl: env.BASE_URL || "",

  app: {
    name: "InstalliQ.ai",
    supportEmail: "info@installiq.ai",
    timezone: "America/New_York",
  },
} as const;

interface EnvRule {
  key: string;
  required: boolean;
  description: string;
}

const ENV_RULES: EnvRule[] = [
  { key: "DATABASE_URL", required: false, description: "PostgreSQL connection string (fallback if DIGITALOCEAN_DATABASE_URL not set)" },
  { key: "DIGITALOCEAN_DATABASE_URL", required: false, description: "DigitalOcean managed PostgreSQL connection string" },
  { key: "SESSION_SECRET", required: true, description: "Secret for signing session cookies (min 32 chars recommended)" },
  { key: "SMTP_USER", required: false, description: "SMTP username for outbound email" },
  { key: "SMTP_PASS", required: false, description: "SMTP password for outbound email" },
  { key: "OPENAI_API_KEY", required: false, description: "OpenAI API key for AI features (image analysis, scheduling)" },
  { key: "GOOGLE_CLIENT_ID", required: false, description: "Google OAuth client ID for calendar integration" },
  { key: "GOOGLE_CLIENT_SECRET", required: false, description: "Google OAuth client secret" },
  { key: "SENDGRID_API_KEY", required: false, description: "SendGrid API key for email sender verification" },
  { key: "DO_SPACES_KEY", required: false, description: "DigitalOcean Spaces access key for file storage" },
  { key: "DO_SPACES_SECRET", required: false, description: "DigitalOcean Spaces secret key" },
  { key: "RAZORPAY_KEY_ID", required: false, description: "Razorpay key for payment processing" },
  { key: "RAZORPAY_KEY_SECRET", required: false, description: "Razorpay secret for payment processing" },
  { key: "OPENWEATHER_API_KEY", required: false, description: "OpenWeather API key for weather forecasts" },
  { key: "SIGNSUITEIQ_SSO_SECRET", required: false, description: "Secret key for CompanyCam API token encryption (AES-256-GCM) — required only if CompanyCam integration is used" },
];

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.db.url) {
    errors.push("DATABASE: Neither DIGITALOCEAN_DATABASE_URL nor DATABASE_URL is set");
  }

  for (const rule of ENV_RULES) {
    const value = process.env[rule.key];
    if (rule.required && !value) {
      errors.push(`REQUIRED: ${rule.key} — ${rule.description}`);
    } else if (!rule.required && !value) {
      warnings.push(`OPTIONAL: ${rule.key} not set — ${rule.description}`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function printEnvReport() {
  const { valid, errors, warnings } = validateEnv();

  console.log(`\n=== Environment: ${NODE_ENV.toUpperCase()} ===`);

  if (errors.length > 0) {
    console.error("\nMissing required environment variables:");
    errors.forEach((e) => console.error(`  ✗ ${e}`));
  }

  if (warnings.length > 0 && isDevelopment) {
    console.warn("\nOptional environment variables not set:");
    warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  }

  if (valid) {
    console.log("\n✓ All required environment variables are set");
  } else {
    console.error(`\n✗ ${errors.length} required variable(s) missing — app may not function correctly`);
    if (isProduction) {
      console.error("FATAL: Cannot start in production with missing required variables");
      process.exit(1);
    }
  }

  console.log("");
}
