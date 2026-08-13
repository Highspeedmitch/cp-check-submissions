const { captureBackendException } = require("../monitoring");

function defaultErrorHandler(name, error) {
  console.error(`${name} polling error:`, error?.message || error);
  captureBackendException(error, {
    tags: { component: "background-worker", worker: name, phase: "poll" },
  });
}

function startPollingWorker({
  name,
  pollMs,
  runOnce,
  onError = (error) => defaultErrorHandler(name, error),
  now = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (!name || typeof runOnce !== "function") {
    throw new TypeError("A polling worker requires a name and runOnce function.");
  }

  let stopped = false;
  let timer = null;
  let activePoll = null;
  const status = {
    name,
    startedAt: now(),
    lastPollStartedAt: null,
    lastPollCompletedAt: null,
    lastPollSucceededAt: null,
    lastPollFailedAt: null,
    lastError: "",
  };

  function schedule(delayMs) {
    if (stopped) return;
    timer = setTimer(poll, delayMs);
    timer?.unref?.();
  }

  async function poll() {
    if (stopped) return;
    status.lastPollStartedAt = now();
    const execution = (async () => {
      try {
        const processed = await runOnce();
        status.lastPollSucceededAt = now();
        status.lastError = "";
        return Boolean(processed);
      } catch (error) {
        status.lastPollFailedAt = now();
        status.lastError = String(error?.message || error || "Unknown polling error").slice(0, 500);
        try {
          onError(error);
        } catch (reportingError) {
          console.error(`${name} error reporter failed:`, reportingError?.message || reportingError);
        }
        return false;
      } finally {
        status.lastPollCompletedAt = now();
      }
    })();
    activePoll = execution;
    const processed = await execution;
    if (activePoll === execution) activePoll = null;
    schedule(processed ? 0 : pollMs);
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
  }

  stop.stop = stop;
  stop.drain = async () => {
    while (activePoll) {
      const pending = activePoll;
      await pending;
      if (activePoll === pending) activePoll = null;
    }
  };
  stop.getStatus = () => ({
    ...status,
    stopped,
    polling: Boolean(activePoll),
  });

  void poll();
  return stop;
}

module.exports = { startPollingWorker };
