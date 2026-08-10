const fs = require("fs");
const path = require("path");

const frontendRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(frontendRoot, "..", "docs", "knowledge-base");
const outputRoot = path.resolve(frontendRoot, "public", "help");
const manifestPath = path.resolve(frontendRoot, "src", "content", "helpArticles.json");

function fail(message) {
  console.error(`Knowledge-base sync failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(sourceRoot)) fail(`Source directory not found: ${sourceRoot}`);
if (!fs.existsSync(manifestPath)) fail(`Article manifest not found: ${manifestPath}`);

const articles = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const slugs = new Set();
const files = new Set();
const validRoles = new Set(["admin", "property_manager", "user", "client", "contractor", "cleaner"]);
const validAccountScopes = new Set(["organization", "afterlight_resource"]);
const validOrganizationTypes = new Set(["COM", "STR", "LTR", "RES"]);
const validPlatformRoles = new Set(["platform_admin"]);
const validResourceTypes = new Set(["contractor", "employee", "owner"]);
const validCapabilities = new Set(["customer_contractor_billing"]);

function validateValues(article, property, validValues) {
  if (!article[property]) return;
  if (!Array.isArray(article[property])) fail(`${article.slug} has invalid ${property}.`);
  const invalid = article[property].filter((value) => !validValues.has(value));
  if (invalid.length) fail(`${article.slug} has invalid ${property}: ${invalid.join(", ")}`);
}

function validateLocalReferences(fileName, markdown) {
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const reference = match[1].trim().replace(/^<|>$/g, "");
    if (!reference || reference.startsWith("#") || /^https?:\/\//i.test(reference)) continue;
    const target = path.resolve(sourceRoot, reference.split("#")[0]);
    if (!target.startsWith(`${sourceRoot}${path.sep}`) || !fs.existsSync(target)) {
      fail(`${fileName} contains a missing or unsafe local reference: ${reference}`);
    }
  }
}

for (const article of articles) {
  if (!article.slug || slugs.has(article.slug)) fail(`Duplicate or missing slug: ${article.slug || "(empty)"}`);
  if (!article.file || files.has(article.file)) fail(`Duplicate or missing file: ${article.file || "(empty)"}`);
  for (const property of ["title", "summary", "category", "estimatedTime"]) {
    if (!String(article[property] || "").trim()) fail(`${article.slug} has no ${property}.`);
  }
  if (!Array.isArray(article.roles) || !article.roles.length) fail(`${article.slug} has no roles.`);
  if (!Array.isArray(article.accountScopes) || !article.accountScopes.length) fail(`${article.slug} has no account scopes.`);
  if (article.platformRoles && !Array.isArray(article.platformRoles)) fail(`${article.slug} has invalid platform roles.`);
  if (!Array.isArray(article.orgTypes) || !article.orgTypes.length) fail(`${article.slug} has no organization types.`);
  if (!Array.isArray(article.keywords) || !article.keywords.length) fail(`${article.slug} has no search keywords.`);
  validateValues(article, "roles", validRoles);
  validateValues(article, "accountScopes", validAccountScopes);
  validateValues(article, "orgTypes", validOrganizationTypes);
  validateValues(article, "platformRoles", validPlatformRoles);
  validateValues(article, "resourceTypes", validResourceTypes);
  validateValues(article, "capabilities", validCapabilities);
  const articlePath = path.join(sourceRoot, article.file);
  if (!fs.existsSync(articlePath)) fail(`${article.file} does not exist.`);
  const markdown = fs.readFileSync(articlePath, "utf8");
  const sourceTitle = markdown.match(/^#\s+([^\r\n]+)/)?.[1]?.trim();
  if (sourceTitle !== article.title) {
    fail(`${article.file} title does not match its manifest title.`);
  }
  validateLocalReferences(article.file, markdown);
  if (!markdown.includes("(README.md)")) fail(`${article.file} has no knowledge-base return link.`);
  slugs.add(article.slug);
  files.add(article.file);
}

const sourceMarkdownFiles = fs.readdirSync(sourceRoot)
  .filter((fileName) => fileName.endsWith(".md") && fileName !== "README.md");
for (const fileName of sourceMarkdownFiles) {
  if (!files.has(fileName)) fail(`${fileName} is not registered in the article manifest.`);
}

const readmePath = path.join(sourceRoot, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
validateLocalReferences("README.md", readme);
const indexedFiles = new Set(
  [...readme.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)].map((match) => match[1])
);
for (const fileName of files) {
  if (!indexedFiles.has(fileName)) fail(`${fileName} is not listed in the knowledge-base index.`);
}

function sourceFilesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesBelow(target);
    return /\.(?:js|jsx)$/.test(entry.name) ? [target] : [];
  });
}

for (const sourcePath of sourceFilesBelow(path.join(frontendRoot, "src"))) {
  const source = fs.readFileSync(sourcePath, "utf8");
  for (const match of source.matchAll(/ContextualHelpLink\s+slug=["']([^"']+)["']/g)) {
    if (!slugs.has(match[1])) {
      fail(`${path.relative(frontendRoot, sourcePath)} uses an unknown help slug: ${match[1]}`);
    }
  }
}

const relativeOutput = path.relative(frontendRoot, outputRoot);
if (relativeOutput !== path.join("public", "help")) {
  fail(`Refusing to replace unexpected output directory: ${outputRoot}`);
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });

for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".md")) {
    fs.copyFileSync(path.join(sourceRoot, entry.name), path.join(outputRoot, entry.name));
  }
}

fs.cpSync(path.join(sourceRoot, "images"), path.join(outputRoot, "images"), { recursive: true });
console.log(`Synced ${articles.length} help articles to ${outputRoot}`);
