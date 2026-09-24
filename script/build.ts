import { build as esbuild, type Plugin } from "esbuild";
import { rm, readFile, cp } from "fs/promises";
import { execSync } from "child_process";

const allowlist = [
  "@aws-sdk/client-s3",
  "@aws-sdk/s3-request-presigner",
  "bcryptjs",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "date-fns-tz",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "otpauth",
  "pdfkit",
  "pg",
  "uuid",
  "ws",
  "xlsx",
  "zod",
];

const nativeModulePlugin: Plugin = {
  name: "native-module-resolver",
  setup(build) {
    build.onResolve({ filter: /lightningcss/ }, () => ({ external: true }));
    build.onResolve({ filter: /\.node$/ }, () => ({ external: true }));
  },
};

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  execSync("node --max-old-space-size=1536 node_modules/.bin/vite build", {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  externals.push("lightningcss", "@swc/core", "fsevents");

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    treeShaking: true,
    external: externals,
    plugins: [nativeModulePlugin],
    logLevel: "info",
  });

  //test
  // PDFKit looks for font metrics relative to __dirname (dist/data/*.afm)
  console.log("copying pdfkit font data...");
  await cp("node_modules/pdfkit/js/data", "dist/data", { recursive: true });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
