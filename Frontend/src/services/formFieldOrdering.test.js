import {
  canReorderField,
  orderFieldsByKeys,
  reorderFields,
  reorderTargetKey,
} from "./formFieldOrdering";

const field = (key, options = {}) => ({
  key,
  label: key,
  section: "Condition",
  locked: false,
  ...options,
});

test("reorders unlocked fields within the same section and locked segment", () => {
  const fields = [
    field("identity", { locked: true }),
    field("first"),
    field("second"),
    field("notes", { section: "Notes" }),
  ];

  expect(reorderFields(fields, "second", "first").map((item) => item.key)).toEqual([
    "identity", "second", "first", "notes",
  ]);
  expect(reorderTargetKey(fields, "second", -1)).toBe("first");
});

test("does not move fields across a locked field or a section boundary", () => {
  const fields = [
    field("before"),
    field("identity", { locked: true }),
    field("after"),
    field("notes", { section: "Notes" }),
  ];

  expect(canReorderField(fields, "before", "after")).toBe(false);
  expect(canReorderField(fields, "after", "notes")).toBe(false);
  expect(reorderFields(fields, "before", "after")).toBe(fields);
});

test("reconciles a saved order while retaining locked anchors", () => {
  const fields = [
    field("before"),
    field("identity", { locked: true }),
    field("first"),
    field("second"),
  ];

  expect(orderFieldsByKeys(fields, ["second", "first", "identity", "before"])
    .map((item) => item.key)).toEqual(["before", "identity", "second", "first"]);
});
