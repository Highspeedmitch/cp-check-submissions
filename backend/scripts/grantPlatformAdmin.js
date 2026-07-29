require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/user");

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run grant-platform-admin -- admin@example.com");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { platformRole: "platform_admin" } },
    { new: true }
  ).select("_id email platformRole");
  if (!user) throw new Error(`No user exists with email ${email}.`);
  console.log(`Granted platform administrator access to ${user.email}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
