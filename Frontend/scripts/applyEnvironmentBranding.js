const fs = require("fs");
const path = require("path");

const environment = String(process.env.REACT_APP_DEPLOY_ENV || "")
  .trim()
  .toLowerCase();

if (!new Set(["dev", "development"]).has(environment)) {
  console.log("Production branding retained (REACT_APP_DEPLOY_ENV is not development). ");
  process.exit(0);
}

const frontendRoot = path.resolve(__dirname, "..");
const publicDir = path.join(frontendRoot, "public");
const buildDir = path.join(frontendRoot, "build");

if (!fs.existsSync(buildDir)) {
  throw new Error("The build directory does not exist. Run this script after react-scripts build.");
}

const iconMappings = [
  ["dev-favicon-16.png", "favicon-16.png"],
  ["dev-favicon-32.png", "favicon-32.png"],
  ["dev-apple-touch-icon.png", "apple-touch-icon.png"],
  ["dev-logo192.png", "logo192.png"],
  ["dev-logo512.png", "logo512.png"],
  ["dev-maskable-512.png", "maskable-512.png"],
  ["dev-android-chrome-512x512.png", "android-chrome-512x512.png"],
];

iconMappings.forEach(([source, destination]) => {
  fs.copyFileSync(path.join(publicDir, source), path.join(buildDir, destination));
});

const manifestPath = path.join(buildDir, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.short_name = "Afterlight DEV";
manifest.name = "Afterlight DEV - Property Intelligence";
manifest.description = `Development environment. ${manifest.description}`;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const indexPath = path.join(buildDir, "index.html");
let indexHtml = fs.readFileSync(indexPath, "utf8");
indexHtml = indexHtml
  .replace(
    '<meta name="apple-mobile-web-app-title" content="Afterlight"/>',
    '<meta name="apple-mobile-web-app-title" content="Afterlight DEV"/>'
  )
  .replace("<title>Afterlight</title>", "<title>Afterlight DEV</title>");
fs.writeFileSync(indexPath, indexHtml);

const serviceWorkerPath = path.join(buildDir, "service-worker.js");
if (fs.existsSync(serviceWorkerPath)) {
  const serviceWorker = fs
    .readFileSync(serviceWorkerPath, "utf8")
    .replaceAll("afterlight-shell-v1", "afterlight-dev-shell-v2")
    .replaceAll("afterlight-runtime-v1", "afterlight-dev-runtime-v2");
  fs.writeFileSync(serviceWorkerPath, serviceWorker);
}

console.log("Applied Afterlight development branding to the production build output.");
