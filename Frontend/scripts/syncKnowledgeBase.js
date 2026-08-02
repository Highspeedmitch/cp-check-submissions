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
  if (!Array.isArray(article.roles) || !article.roles.length) fail(`${article.slug} has no roles.`);
  if (!Array.isArray(article.accountScopes) || !article.accountScopes.length) fail(`${article.slug} has no account scopes.`);
  if (article.platformRoles && !Array.isArray(article.platformRoles)) fail(`${article.slug} has invalid platform roles.`);
  if (!Array.isArray(article.orgTypes) || !article.orgTypes.length) fail(`${article.slug} has no organization types.`);
  const articlePath = path.join(sourceRoot, article.file);
  if (!fs.existsSync(articlePath)) fail(`${article.file} does not exist.`);
  const markdown = fs.readFileSync(articlePath, "utf8");
  const sourceTitle = markdown.match(/^#\s+([^\r\n]+)/)?.[1]?.trim();
  if (sourceTitle !== article.title) {
    fail(`${article.file} title does not match its manifest title.`);
  }
  validateLocalReferences(article.file, markdown);
  slugs.add(article.slug);
  files.add(article.file);
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
