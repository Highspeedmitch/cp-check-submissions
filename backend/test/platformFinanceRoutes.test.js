const test = require("node:test");
const assert = require("node:assert/strict");
const platformFinanceRouter = require("../Routes/platformFinance");
const { currentMonth, previousMonth, normalizedCostInput } = require("../Routes/platformFinance");

test("platform finance exposes overview and operating-cost management routes", () => {
  const routes = platformFinanceRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  assert.deepEqual(routes, [
    { path: "/overview", methods: ["get"] },
    { path: "/costs", methods: ["post"] },
    { path: "/costs/:id", methods: ["put"] },
    { path: "/costs/:id", methods: ["delete"] },
  ]);
});

test("operating cost input is normalized and validated", () => {
  assert.deepEqual(normalizedCostInput({
    name: "  AWS hosting  ",
    category: "aws",
    amountCents: 4125,
    startMonth: "2026-08",
    recurrence: "monthly",
    classification: "actual",
  }), {
    name: "AWS hosting",
    amountCents: 4125,
    startMonth: "2026-08",
    category: "aws",
    recurrence: "monthly",
    classification: "actual",
  });
  assert.throws(() => normalizedCostInput({
    name: "AWS",
    amountCents: 0,
    startMonth: "2026-08",
  }), /positive cost amount/i);
});

test("the default financial month uses UTC", () => {
  assert.equal(currentMonth(new Date("2027-01-01T00:30:00.000Z")), "2027-01");
  assert.equal(previousMonth("2027-01"), "2026-12");
});
