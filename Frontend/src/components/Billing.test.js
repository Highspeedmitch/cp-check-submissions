import { api } from "../services/api";
import { apiRequestForMethod } from "./Billing";

jest.mock("../services/api", () => ({
  api: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

test("billing POST actions always send a JSON object", async () => {
  api.post.mockResolvedValue({ ok: true });

  await apiRequestForMethod("POST", "/api/billing/invoice-1/approve");

  expect(api.post).toHaveBeenCalledWith(
    "/api/billing/invoice-1/approve",
    {}
  );
});

test("billing actions preserve explicit request bodies", async () => {
  api.put.mockResolvedValue({ ok: true });

  await apiRequestForMethod("PUT", "/api/billing/invoice-1/amount", {
    amountCents: 12500,
  });

  expect(api.put).toHaveBeenCalledWith(
    "/api/billing/invoice-1/amount",
    { amountCents: 12500 }
  );
});
