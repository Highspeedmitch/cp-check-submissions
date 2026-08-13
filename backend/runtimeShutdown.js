const { captureBackendException, flushBackendMonitoring } = require("./monitoring");

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25 * 1000;

function stopWorker(worker) {
  if (typeof worker === "function") return worker();
  return worker?.stop?.();
}

function drainWorker(worker) {
  return worker?.drain?.() || Promise.resolve();
}

function closeHttpServer(server) {
  if (!server?.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections?.();
  });
}

function waitWithTimeout(promise, timeoutMs) {
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(
      `Graceful shutdown exceeded ${timeoutMs}ms.`
    )), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}

function createShutdownCoordinator({
  server = null,
  timers = [],
  workers = [],
  disconnect,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  logger = console,
  setExitCode = (code) => { process.exitCode = code; },
} = {}) {
  let shutdownPromise = null;

  return function shutdown(signal = "shutdown") {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.log(`Received ${signal}; starting graceful shutdown.`);
      timers.filter(Boolean).forEach((timer) => {
        clearInterval(timer);
        clearTimeout(timer);
      });

      const serverClosed = closeHttpServer(server);
      workers.filter(Boolean).forEach(stopWorker);

      let exitCode = 0;
      try {
        await waitWithTimeout(Promise.all([
          serverClosed,
          ...workers.filter(Boolean).map(drainWorker),
        ]), timeoutMs);
      } catch (error) {
        exitCode = 1;
        logger.error("Graceful shutdown drain failed:", error);
        captureBackendException(error, {
          tags: { component: "runtime", phase: "shutdown-drain" },
          extra: { signal },
        });
        server?.closeAllConnections?.();
      }

      try {
        await disconnect?.();
      } catch (error) {
        exitCode = 1;
        logger.error("Database disconnect failed during shutdown:", error);
        captureBackendException(error, {
          tags: { component: "runtime", phase: "shutdown-database" },
          extra: { signal },
        });
      }

      try {
        await flushBackendMonitoring(2000);
      } catch (error) {
        exitCode = 1;
        logger.error("Monitoring flush failed during shutdown:", error);
      }
      setExitCode(exitCode);
      logger.log(exitCode === 0
        ? "Graceful shutdown completed."
        : "Shutdown completed with errors.");
      return { exitCode };
    })();
    return shutdownPromise;
  };
}

function installShutdownHandlers(shutdown, processObject = process) {
  const handleTerm = () => { void shutdown("SIGTERM"); };
  const handleInterrupt = () => { void shutdown("SIGINT"); };
  processObject.once("SIGTERM", handleTerm);
  processObject.once("SIGINT", handleInterrupt);
  return () => {
    processObject.removeListener("SIGTERM", handleTerm);
    processObject.removeListener("SIGINT", handleInterrupt);
  };
}

module.exports = {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  closeHttpServer,
  createShutdownCoordinator,
  installShutdownHandlers,
  waitWithTimeout,
};
