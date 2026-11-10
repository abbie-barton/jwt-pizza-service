const config = require("./config");

// Metrics stored in memory
const methodCounts = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
let totalRequests = 0;
let latencyTime = 0;
let latencyCount = 0;

// Middleware to track requests
function requestTracker(req, res, next) {
  const start = Date.now();
  totalRequests += 1;
  if (req.method in methodCounts) {
    methodCounts[req.method]++;
  }
  res.on("finish", () => {
    const time = Date.now() - start;
    latencyTime += time;
    latencyCount += 1;
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
  const latencyAvg = latencyCount > 0 ? Math.round(latencyTime / latencyCount) : 0;
  metrics.push(
    createMetric("latency", latencyAvg, "ms", "gauge", "asInt", {}),
  );
  latencyTime = 0;
  latencyCount = 0;

  sendMetricToGrafana(metrics);
}, 10000);

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

module.exports = { requestTracker };
