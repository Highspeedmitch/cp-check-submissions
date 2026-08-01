import { activatePwaUpdate, getPwaRegistration } from "./pwa";

test("registers the shared service worker used by offline support and push", async () => {
  const registration = { waiting: null };
  const serviceWorker = { register: jest.fn().mockResolvedValue(registration) };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  });

  await expect(getPwaRegistration()).resolves.toBe(registration);
  expect(serviceWorker.register).toHaveBeenCalledWith("/service-worker.js");
});

test("activates a waiting application update", () => {
  const postMessage = jest.fn();
  activatePwaUpdate({ waiting: { postMessage } });
  expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
});
