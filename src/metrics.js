const config = require("./config");

// Metrics stored in memory
const methodCounts = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
let totalRequests = 0;
let latencyTime = 0;
let latencyCount = 0;
let pizzaLatencyTime = 0;
let pizzaLatencyCount = 0;
const activeUsers = new Map();
const ACTIVE_MS = 300000; // 5 mins
let authAttempts = { success: 0, failed: 0 };

// Middleware to track requests
function requestTracker(req, res, next) {
  const path = req.originalUrl.split("?")[0];
  const start = Date.now();
  totalRequests += 1;
  if (req.method in methodCounts) {
    methodCounts[req.method]++;
  }
  res.on("finish", () => {
    const time = Date.now() - start;
    latencyTime += time;
    latencyCount += 1;
    if (req.user) {
      activeUsers.set(req.user.id, Date.now());
    }
    if (
      path === "/api/auth" &&
      (req.method === "PUT" || req.method === "POST")
    ) {
      if (req.statusCode >= 200 && res.statusCode < 300) {
        authAttempts.success += 1;
      } else {
        authAttempts.failed += 1;
      }
    }
  });
  next();
}

// Periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  // total requests
  metrics.push(
    createMetric("requests", totalRequests, "1", "sum", "asInt", {
      method: "ALL",
    }),
  );
  // individual methods
  Object.keys(methodCounts).forEach((method) => {
    metrics.push(
      createMetric("requests", methodCounts[method], "1", "sum", "asInt", {
        method,
      }),
    );
  });
  // latency
  const latencyAvg =
    latencyCount > 0 ? Math.round(latencyTime / latencyCount) : 0;
  metrics.push(createMetric("latency", latencyAvg, "ms", "gauge", "asInt", {}));
  latencyTime = 0;
  latencyCount = 0;
  // pizza latency
  if (pizzaLatencyCount > 0) {
    const pizzaLatencyAvg = Math.round(pizzaLatencyTime / pizzaLatencyCount);
    metrics.push(
      createMetric(
        "pizza_latency",
        pizzaLatencyAvg,
        "ms",
        "gauge",
        "asInt",
        {},
      ),
    );
  }
  pizzaLatencyTime = 0;
  pizzaLatencyCount = 0;
  // active users
  activeUsers.forEach((lastSeen, userId) => {
    if (lastSeen < Date.now() - ACTIVE_MS) {
      activeUsers.delete(userId);
    }
  });
  metrics.push(
    createMetric("active_users", activeUsers.size, "1", "gauge", "asInt", {}),
  );
  // authentication attempts
  metrics.push(
    createMetric(
      "authentication_attempts",
      authAttempts.success,
      "1",
      "sum",
      "asInt",
      { status: "success" },
    ),
  );
  metrics.push(
    createMetric(
      "authentication_attempts",
      authAttempts.failed,
      "1",
      "sum",
      "asInt",
      { status: "failed" },
    ),
  );

  sendMetricToGrafana(metrics);
}, 10000).unref();

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes,
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

function pizzaCreationLatency(ms) {
  pizzaLatencyTime += ms;
  pizzaLatencyCount += 1;
}

module.exports = { requestTracker, pizzaCreationLatency };
