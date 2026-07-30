const test = require("node:test");
const assert = require("node:assert/strict");
const { purgeExpiredProspectAssessments } = require("../services/prospectRetention");

test("purges database records only after their PDF is removed", async () => {
  let deletedIds = [];
  const query = {
    select() { return this; },
    async lean() {
      return [{ _id: "first", pdfKey: "first.pdf" }, { _id: "second", pdfKey: "second.pdf" }];
    },
  };
  const count = await purgeExpiredProspectAssessments(new Date(), {
    AssessmentModel: {
      find: () => query,
      deleteMany: async ({ _id }) => { deletedIds = _id.$in; },
    },
    s3Client: {
      deleteObject: ({ Key }) => ({
        promise: async () => {
          if (Key === "second.pdf") throw new Error("temporary storage failure");
        },
      }),
    },
  });
  assert.equal(count, 1);
  assert.deepEqual(deletedIds, ["first"]);
});
