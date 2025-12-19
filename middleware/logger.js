// Request logging middleware
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request details
  console.log(`\n📨 ${req.method} ${req.path}`);
  console.log(`   Headers: ${JSON.stringify(req.headers, null, 2)}`);
  if (Object.keys(req.body).length > 0) {
    console.log(`   Body: ${JSON.stringify(req.body, null, 2)}`);
  }

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    console.log(
      `✅ Response Status: ${res.statusCode} - Duration: ${duration}ms`
    );
    console.log(`   Data: ${JSON.stringify(data, null, 2)}\n`);

    return originalJson.call(this, data);
  };

  next();
};

// Error logging middleware
export const errorLogger = (err, req, res, next) => {
  console.error(`\n❌ Error: ${err.message}`);
  console.error(`   URL: ${req.method} ${req.path}`);
  console.error(`   Stack: ${err.stack}\n`);

  next(err);
};

// Request ID middleware
export const requestIdMiddleware = (req, res, next) => {
  const requestId = req.headers["x-request-id"] || generateRequestId();
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
};

// Generate request ID
const generateRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export default requestLogger;
