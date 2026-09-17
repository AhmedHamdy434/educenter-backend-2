/**
 *  * =========================================================================================
 * 🚀 NestJS Advanced Load & Stress Testing Tool (Node.js 18+ Native Fetch)
 * =========================================================================================
 * 
 * يتضمن السكربت نمطين رئيسيين:
 * 1. ⏱️ Sustained Load Mode (الحمل المستمر لمدة 30-60 ثانية):
 *    - قياس استقرار استهلاك الذاكرة (RAM Heap) واتصالات قاعدة البيانات (DB Connections).
 *    - تقارير حية ومباشرة كل 5 ثوانٍ لمراقبة هبوط الأداء (Performance Drift).
 * 
 * 2. ⚡ Stress Testing Mode (اختبار كسر السقف ومعرفة نقطة الانهيار):
 *    - اختبار مستويات تزامن عالية (مثلاً: 32, 64, 128, 256).
 *    - تشخيص تلقائي لسبب الاختناق: هل هو في الـ DB Connection Pool الخاص بـ Prisma/PostgreSQL
 *      أم في الـ Node.js Event Loop أم في حماية الـ Rate Limiting (HTTP 429).
 * 
 * 💡 كيفية التشغيل:
 * - النمط التلقائي: npm run test:load
 * - حمل مستمر لمدة 45 ثانية عند 32 تزامن:
 *   node scripts/load-test.js --mode=sustained --concurrency=32 --duration=45
 * - كسر السقف بمستويات 64، 128، 256:
 *   node scripts/load-test.js --mode=stress --levels=64,128,256
 * =========================================================================================
 */

const fs = require('fs');
const path = require('path');
const { performance, monitorEventLoopDelay } = require('perf_hooks');

// =========================================================================================
// ⚙️ معالجة معاملات سطر الأوامر (CLI ARGUMENTS PARSER)
// =========================================================================================

function parseCliArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key.toLowerCase()] = value !== undefined ? value : true;
    }
  }
  return args;
}

const cliArgs = parseCliArgs();

// قراءة المنفذ تلقائياً من ملف .env إن وجد
let defaultPort = '5000';
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const portMatch = envContent.match(/^PORT\s*=\s*(\d+)/m);
    if (portMatch) defaultPort = portMatch[1];
  }
} catch {}

// =========================================================================================
// ⚙️ الإعدادات القابلة للتخصيص (CONFIGURATION)
// =========================================================================================

const CONFIG = {
  // 1. رابط السيرفر الأساسي (Backend URL)
  BACKEND_URL: cliArgs.url || process.env.BACKEND_URL || `http://localhost:${defaultPort}`,

  // 2. نمط الاختبار المطلوب:
  // - 'SUSTAINED_LOAD': حمل مستمر لمدة محددة عند تزامن ثابت لمراقبة الذاكرة والـ DB
  // - 'STRESS_STEPPED': اختبار كسر السقف والتدرج (64 -> 128 -> 256) لمعرفة نقطة الانهيار
  TEST_MODE: (cliArgs.mode || process.env.TEST_MODE || 'SUSTAINED_LOAD').toUpperCase() === 'STRESS' 
    ? 'STRESS_STEPPED' 
    : (cliArgs.mode?.toUpperCase() === 'SUSTAINED' ? 'SUSTAINED_LOAD' : 'SUSTAINED_LOAD'),

  // ---------------------------------------------------------------------------------------
  // إعدادات نمط الحمل المستمر (SUSTAINED LOAD CONFIG)
  // ---------------------------------------------------------------------------------------
  SUSTAINED: {
    // مستوى التزامن المستمر (مثلاً: 32 أو 64)
    CONCURRENCY: parseInt(cliArgs.concurrency || '32', 10),

    // المدة الإجمالية بالثواني (مثلاً: 30 إلى 60 ثانية)
    DURATION_SECONDS: parseInt(cliArgs.duration || '45', 10),

    // فترة طباعة التقرير الحي المباشر (بالثواني)
    PROGRESS_INTERVAL_SEC: 5,
  },

  // ---------------------------------------------------------------------------------------
  // إعدادات نمط كسر السقف ونقطة الانهيار (STRESS STEPPED CONFIG)
  // ---------------------------------------------------------------------------------------
  STRESS: {
    // مستويات التزامن المستهدفة
    CONCURRENCY_LEVELS: cliArgs.levels 
      ? cliArgs.levels.split(',').map((n) => parseInt(n.trim(), 10))
      : [32, 64, 128, 256],

    // نوع تنفيذ كل مستوى:
    // 'DURATION': تشغيل كل مستوى تزامن لعدد محدد من الثواني (موصى به لمحاكاة حقيقية)
    // 'ITERATIONS': تشغيل عدد جولات ثابت لكل مستخدم افتراضي
    STAGE_TYPE: 'DURATION',
    STAGE_DURATION_SEC: parseInt(cliArgs.stageduration || '12', 10), // 12 ثانية لكل مستوى
    ITERATIONS_PER_USER: 15, // في حال اختيار 'ITERATIONS'

    // فترة استراحة بين كل مستوى والذي يليه (بالميلي ثانية)
    COOLDOWN_MS: 3000,
  },

  // 3. إعدادات تسجيل الدخول (Authentication)
  AUTH: {
    LOGIN_PATH: '/api/auth/login',
    METHOD: 'POST',
    formatBody: (user) => ({
      identifier: user.email || user.username || user.identifier,
      password: user.password,
    }),
    extractToken: (responseJson) => {
      return (
        responseJson?.data?.accessToken ||
        responseJson?.accessToken ||
        responseJson?.data?.token ||
        responseJson?.token ||
        responseJson?.data?.access_token ||
        responseJson?.access_token ||
        null
      );
    },
  },

  // 4. قائمة المستخدمين الحقيقيين
  USERS: [
    { email: 't@t.com', password: '123456' },
    { email: 's@s.com', password: '123456' },
    { email: 'a@a.com', password: '123456' },
  ],

  // 5. الـ Endpoints المستهدفة لكل جولة
  ENDPOINTS: [
    {
      name: 'Center Profile',
      path: '/api/centers/me',
      method: 'GET',
      headers: {},
      body: null,
    },
    {
      name: 'Groups List',
      path: '/api/groups?page=1&limit=10',
      method: 'GET',
      headers: {},
      body: null,
    },
  ],

  // 6. أقصى مهلة للطلب الواحد (Timeout)
  REQUEST_TIMEOUT_MS: 15000, // 15 ثانية

  // 7. مسار ملف تقرير CSV
  CSV_OUTPUT_PATH: path.join(__dirname, `load_test_report_${Date.now()}.csv`),
};

// =========================================================================================
// 🛠️ دوال مساعدة (HELPER FUNCTIONS)
// =========================================================================================

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calculatePercentile(sortedValues, percentile) {
  if (!sortedValues || sortedValues.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
  return sortedValues[safeIndex];
}

function getMemoryUsageMb() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
  };
}

/**
 * تصنيف نوع الخطأ لتسهيل قراءة التقرير وتشخيص العطل
 */
function classifyError(status, errorObj, responseText = '') {
  const snippet = (responseText || '').toLowerCase();

  // فحص أخطاء مسبح اتصالات قاعدة البيانات (Prisma / PostgreSQL Pool)
  if (
    snippet.includes('p2024') ||
    snippet.includes('timed out fetching a new connection from the connection pool') ||
    snippet.includes('too many clients already') ||
    snippet.includes('connection slots are reserved') ||
    snippet.includes('connection pool')
  ) {
    return {
      category: 'DB_POOL_EXHAUSTED',
      label: 'DB Pool Exhausted (Prisma P2024)',
      isDbPool: true,
    };
  }

  if (errorObj) {
    const msg = errorObj.message || '';
    if (errorObj.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('aborted')) {
      return { category: 'TIMEOUT', label: 'Request Timeout (>15s)', isTimeout: true };
    }
    if (errorObj.cause?.code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
      return { category: 'CONN_REFUSED', label: 'Connection Refused (Server Down)' };
    }
    if (errorObj.cause?.code === 'ECONNRESET' || msg.includes('ECONNRESET')) {
      return { category: 'CONN_RESET', label: 'Connection Reset (Socket Drop)', isSocketDrop: true };
    }
    return { category: 'NETWORK_ERROR', label: `Network Error (${msg.slice(0, 40)})` };
  }

  if (status === 429) {
    return { category: 'RATE_LIMITED', label: 'Rate Limited (HTTP 429 - ThrottlerGuard)', isThrottled: true };
  }
  if (status === 401) {
    return { category: 'UNAUTHORIZED', label: 'Unauthorized (HTTP 401)' };
  }
  if (status === 403) {
    return { category: 'FORBIDDEN', label: 'Forbidden (HTTP 403)' };
  }
  if (status >= 500) {
    return { category: 'SERVER_ERROR', label: `Server Error (HTTP ${status})` };
  }
  if (status >= 400) {
    return { category: 'CLIENT_ERROR', label: `Client Error (HTTP ${status})` };
  }

  return { category: 'UNKNOWN', label: `HTTP ${status}` };
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

// =========================================================================================
// 🔐 المرحلة الأولى: تسجيل دخول المستخدمين وجلب التوكنز (AUTHENTICATION)
// =========================================================================================

async function authenticateUsers() {
  console.log('\n' + '='.repeat(85));
  console.log('🔐 [المرحلة 1] جاري تسجيل دخول المستخدمين للحصول على Bearer Tokens...');
  console.log('='.repeat(85));

  const validTokens = [];
  const fullLoginUrl = `${CONFIG.BACKEND_URL}${CONFIG.AUTH.LOGIN_PATH}`;

  for (let i = 0; i < CONFIG.USERS.length; i++) {
    const user = CONFIG.USERS[i];
    const userIdentifier = user.email || user.username || user.identifier;
    process.stdout.write(`  ⏳ جاري تسجيل الدخول: ${userIdentifier} ... `);

    let attempts = 0;
    const maxAttempts = 3;
    let loggedIn = false;

    while (attempts < maxAttempts && !loggedIn) {
      attempts++;
      try {
        const startTime = performance.now();
        const response = await fetch(fullLoginUrl, {
          method: CONFIG.AUTH.METHOD,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(CONFIG.AUTH.formatBody(user)),
          signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
        });

        const latency = Math.round(performance.now() - startTime);

        if (response.status === 429 && attempts < maxAttempts) {
          const retryAfterSec = parseInt(response.headers.get('retry-after') || '3', 10) || 3;
          process.stdout.write(`⚠️ Rate Limit (429). انتظار ${retryAfterSec}s وإعادة المحاولة... `);
          await sleep(retryAfterSec * 1000);
          continue;
        }

        if (!response.ok) {
          let errSnippet = '';
          try {
            const errBody = await response.text();
            errSnippet = errBody.slice(0, 100).replace(/[\r\n]+/g, ' ');
          } catch {}
          console.log(`❌ فشل (HTTP ${response.status} - ${latency}ms) -> ${errSnippet}`);
          break;
        }

        const json = await response.json();
        const token = CONFIG.AUTH.extractToken(json);

        if (!token) {
          console.log(`❌ فشل: لم يتم العثور على التوكن في رد السيرفر!`);
          break;
        }

        validTokens.push({
          identifier: userIdentifier,
          token,
        });

        loggedIn = true;
        console.log(`✅ نجح (${latency}ms)`);
      } catch (error) {
        const errDetail = error.cause?.code ? ` (${error.cause.code})` : '';
        console.log(`❌ استثناء: ${error.message}${errDetail}`);
        break;
      }
    }

    if (i < CONFIG.USERS.length - 1) {
      await sleep(500);
    }
  }

  console.log('-'.repeat(85));
  console.log(`📊 إجمالي الحسابات المسجلة بنجاح: ${validTokens.length} من أصل ${CONFIG.USERS.length}`);

  if (validTokens.length === 0) {
    throw new Error('❌ تعذر إكمال الاختبار: لم ينجح تسجيل الدخول لأي مستخدم. تحقق من BACKEND_URL وصحة بيانات الحسابات.');
  }

  return validTokens;
}

// =========================================================================================
// ⚡ تنفيذ الطلبات وقياس زمن الاستجابة (REQUEST RUNNER)
// =========================================================================================

async function executeRequest(endpoint, token) {
  const fullUrl = `${CONFIG.BACKEND_URL}${endpoint.path}`;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(endpoint.headers || {}),
  };

  if (endpoint.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const startTime = performance.now();

  try {
    const response = await fetch(fullUrl, {
      method: endpoint.method || 'GET',
      headers,
      body: endpoint.body || undefined,
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok) {
      await response.arrayBuffer();
      return {
        success: true,
        status: response.status,
        latencyMs,
        errorCategory: null,
        errorSnippet: null,
        classification: null,
      };
    } else {
      let snippet = '';
      try {
        const bodyText = await response.text();
        snippet = bodyText.slice(0, 150).replace(/[\r\n\t]+/g, ' ').trim();
      } catch {}

      const classification = classifyError(response.status, null, snippet);
      return {
        success: false,
        status: response.status,
        latencyMs,
        errorCategory: classification.label,
        errorSnippet: snippet,
        classification,
      };
    }
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const classification = classifyError(null, error, null);
    return {
      success: false,
      status: classification.category === 'TIMEOUT' ? 408 : 0,
      latencyMs,
      errorCategory: classification.label,
      errorSnippet: error.message,
      classification,
    };
  }
}

// =========================================================================================
// ⏱️ نمط الحمل المستمر (SUSTAINED LOAD RUNNER - 30 TO 60 SECONDS)
// =========================================================================================

async function runSustainedLoadTest(validUsers) {
  const { CONCURRENCY, DURATION_SECONDS, PROGRESS_INTERVAL_SEC } = CONFIG.SUSTAINED;

  console.log('\n' + '='.repeat(85));
  console.log(`⏱️ بدء اختبار الحمل المستمر (Sustained Load Test)`);
  console.log(`👥 التزامن الثابت: ${CONCURRENCY} Concurrent Workers`);
  console.log(`⏳ المدة الإجمالية: ${DURATION_SECONDS} ثانية متواصلة`);
  console.log(`📈 تقارير حية ومراقبة الذاكرة: كل ${PROGRESS_INTERVAL_SEC} ثوانٍ`);
  console.log('='.repeat(85));

  const elMonitor = monitorEventLoopDelay({ resolution: 20 });
  elMonitor.enable();

  const startMemory = getMemoryUsageMb();
  const testStartTime = performance.now();
  const testEndTime = testStartTime + DURATION_SECONDS * 1000;

  const allResults = [];
  const errorMap = new Map();
  let running = true;

  // إحصائيات الشرائح الزمنية (Time Windows) لقياس هبوط الأداء (Performance Drift)
  const windowResults = [];
  let lastWindowTime = performance.now();
  let lastWindowCount = 0;

  // مؤقت التحديث الحي المنتظم في الكونسول
  const progressTimer = setInterval(() => {
    const now = performance.now();
    const elapsedSec = Math.round((now - testStartTime) / 1000);
    const currentWindowResults = allResults.slice(lastWindowCount);
    const windowReqCount = currentWindowResults.length;
    const windowDurationSec = (now - lastWindowTime) / 1000;
    const windowRps = windowDurationSec > 0 ? (windowReqCount / windowDurationSec).toFixed(1) : '0';

    const windowLatencies = currentWindowResults.filter((r) => r.success).map((r) => r.latencyMs);
    const windowAvgLat = windowLatencies.length > 0 
      ? Math.round(windowLatencies.reduce((a, b) => a + b, 0) / windowLatencies.length) 
      : 0;

    const currentMem = getMemoryUsageMb();
    const totalFailed = allResults.filter((r) => !r.success).length;

    console.log(
      `  [⏱️ ${String(elapsedSec).padStart(2, '0')}s / ${DURATION_SECONDS}s] ` +
      `الطلبات: ${allResults.length.toLocaleString()} | ` +
      `السرعة الآن: ${windowRps} req/s | ` +
      `متوسط الزمن: ${windowAvgLat}ms | ` +
      `الأخطاء: ${totalFailed} | ` +
      `RAM Heap: ${currentMem.heapUsed}MB`
    );

    windowResults.push({
      elapsedSec,
      windowRps: parseFloat(windowRps),
      windowAvgLat,
      memHeap: currentMem.heapUsed,
    });

    lastWindowTime = now;
    lastWindowCount = allResults.length;
  }, PROGRESS_INTERVAL_SEC * 1000);

  // إطلاق الـ Workers المتزامنين
  const workers = Array.from({ length: CONCURRENCY }, async (_, workerIndex) => {
    const userContext = validUsers[workerIndex % validUsers.length];
    const token = userContext.token;

    while (performance.now() < testEndTime && running) {
      for (const endpoint of CONFIG.ENDPOINTS) {
        if (performance.now() >= testEndTime) break;
        const res = await executeRequest(endpoint, token);
        allResults.push(res);

        if (!res.success) {
          const cat = res.errorCategory;
          if (!errorMap.has(cat)) {
            errorMap.set(cat, { count: 1, sample: res.errorSnippet, classification: res.classification });
          } else {
            errorMap.get(cat).count += 1;
          }
        }
      }
    }
  });

  await Promise.all(workers);
  clearInterval(progressTimer);
  elMonitor.disable();

  const totalDurationSec = (performance.now() - testStartTime) / 1000;
  const endMemory = getMemoryUsageMb();

  // تجميع الإحصائيات
  const totalRequests = allResults.length;
  const successfulRequests = allResults.filter((r) => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const errorRatePct = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(2) : '0.00';

  const targetForLatencies = successfulRequests > 0 ? allResults.filter((r) => r.success) : allResults;
  const latencies = targetForLatencies.map((r) => r.latencyMs).sort((a, b) => a - b);

  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const overallRps = (totalRequests / totalDurationSec).toFixed(2);

  // حساب تأخر الـ Event Loop
  const eventLoopP50Ms = (elMonitor.percentile(50) / 1e6).toFixed(2);
  const eventLoopP95Ms = (elMonitor.percentile(95) / 1e6).toFixed(2);
  const eventLoopMaxMs = (elMonitor.max / 1e6).toFixed(2);

  // تحليل ثبات الأداء (هل حدث Performance Drift / بطء تدريجي؟)
  let driftAssessment = 'مستقر تماماً';
  if (windowResults.length >= 2) {
    const firstWindow = windowResults[0];
    const lastWindow = windowResults[windowResults.length - 1];
    const latIncreasePct = firstWindow.windowAvgLat > 0 
      ? ((lastWindow.windowAvgLat - firstWindow.windowAvgLat) / firstWindow.windowAvgLat) * 100 
      : 0;

    if (latIncreasePct > 50) {
      driftAssessment = `⚠️ تراجع ملحوظ: ارتفع زمن الاستجابة بنسبة ${latIncreasePct.toFixed(1)}% مع مرور الوقت (مؤشر اختناق تدريجي أو تراكم في الـ Pool)`;
    } else if (latIncreasePct < -20) {
      driftAssessment = `🚀 تحسن في الاستجابة (JIT Warm-up & Cache)`;
    }
  }

  // ملخص النتائج
  console.log('\n' + '='.repeat(85));
  console.log('🏁 ملخص نتائج اختبار الحمل المستمر (Sustained Load Report)');
  console.log('='.repeat(85));
  console.log(`⏱️ المدة الفعلية: ${totalDurationSec.toFixed(2)} ثانية | إجمالي الطلبات: ${totalRequests.toLocaleString()}`);
  console.log(`⚡ الإنتاجية الإجمالية (RPS): ${overallRps} req/sec`);
  console.log(`📈 الناجح: ${successfulRequests.toLocaleString()} | الفاشل: ${failedRequests.toLocaleString()} | نسبة الأخطاء: ${errorRatePct}%`);
  console.log(`📊 زمن الاستجابة (ms): Min=${minLatency}ms | Avg=${avgLatency}ms | P50=${p50}ms | P95=${p95}ms | P99=${p99}ms | Max=${maxLatency}ms`);
  console.log(`🧠 استهلاك الذاكرة (RAM Heap): البداية=${startMemory.heapUsed}MB -> النهاية=${endMemory.heapUsed}MB (الفرق: ${endMemory.heapUsed - startMemory.heapUsed >= 0 ? '+' : ''}${endMemory.heapUsed - startMemory.heapUsed}MB)`);
  console.log(`🌀 تأخير الـ Event Loop للمختبر: P50=${eventLoopP50Ms}ms | P95=${eventLoopP95Ms}ms | Max=${eventLoopMaxMs}ms`);
  console.log(`📊 تقييم ثبات الأداء: ${driftAssessment}`);

  if (failedRequests > 0) {
    console.log('\n⚠️ تفاصيل الأخطاء المسجلة:');
    errorMap.forEach((val, key) => {
      console.log(`   • [${key}]: تكرر ${val.count} مرة | نموذج: "${val.sample.slice(0, 100)}"`);
    });
  }

  // تشخيص أسباب الاختناق
  diagnoseBottlenecks(errorMap, { avgLatency, p95, p99, eventLoopP95Ms: parseFloat(eventLoopP95Ms) });

  const errorsSummaryCsv = Array.from(errorMap.entries()).map(([k, v]) => `${k}: ${v.count}`).join('; ') || 'None';

  return [{
    concurrency: `Sustained (${CONCURRENCY} VU / ${DURATION_SECONDS}s)`,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePct: `${errorRatePct}%`,
    minLatency,
    avgLatency,
    p50,
    p95,
    p99,
    maxLatency,
    durationSeconds: totalDurationSec.toFixed(2),
    rps: overallRps,
    errorsSummaryCsv,
  }];
}

// =========================================================================================
// ⚡ نمط كسر السقف ونقطة الانهيار (STRESS STEPPED RUNNER: 32 -> 64 -> 128 -> 256)
// =========================================================================================

async function runStressStage(concurrency, validUsers) {
  const { STAGE_TYPE, STAGE_DURATION_SEC, ITERATIONS_PER_USER } = CONFIG.STRESS;

  console.log('\n' + '='.repeat(85));
  console.log(`🚀 [مستوى التزامن: ${concurrency} Concurrent Workers] | النمط: ${STAGE_TYPE === 'DURATION' ? `${STAGE_DURATION_SEC} ثانية متواصلة` : `${ITERATIONS_PER_USER} جولات`}`);
  console.log('='.repeat(85));

  const elMonitor = monitorEventLoopDelay({ resolution: 20 });
  elMonitor.enable();

  const stageStartTime = performance.now();
  const stageEndTime = stageStartTime + STAGE_DURATION_SEC * 1000;
  const allResults = [];
  const errorMap = new Map();

  const workers = Array.from({ length: concurrency }, async (_, workerIndex) => {
    const userContext = validUsers[workerIndex % validUsers.length];
    const token = userContext.token;

    if (STAGE_TYPE === 'DURATION') {
      while (performance.now() < stageEndTime) {
        for (const endpoint of CONFIG.ENDPOINTS) {
          if (performance.now() >= stageEndTime) break;
          const res = await executeRequest(endpoint, token);
          allResults.push(res);
          if (!res.success) {
            const cat = res.errorCategory;
            if (!errorMap.has(cat)) errorMap.set(cat, { count: 1, sample: res.errorSnippet, classification: res.classification });
            else errorMap.get(cat).count += 1;
          }
        }
      }
    } else {
      for (let iter = 0; iter < ITERATIONS_PER_USER; iter++) {
        for (const endpoint of CONFIG.ENDPOINTS) {
          const res = await executeRequest(endpoint, token);
          allResults.push(res);
          if (!res.success) {
            const cat = res.errorCategory;
            if (!errorMap.has(cat)) errorMap.set(cat, { count: 1, sample: res.errorSnippet, classification: res.classification });
            else errorMap.get(cat).count += 1;
          }
        }
      }
    }
  });

  await Promise.all(workers);
  elMonitor.disable();

  const stageDurationSeconds = (performance.now() - stageStartTime) / 1000;

  const totalRequests = allResults.length;
  const successfulRequests = allResults.filter((r) => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const errorRatePct = totalRequests > 0 ? ((failedRequests / totalRequests) * 100).toFixed(2) : '0.00';

  const targetForLatencies = successfulRequests > 0 ? allResults.filter((r) => r.success) : allResults;
  const latencies = targetForLatencies.map((r) => r.latencyMs).sort((a, b) => a - b);

  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const rps = (totalRequests / stageDurationSeconds).toFixed(2);

  const eventLoopP95Ms = (elMonitor.percentile(95) / 1e6).toFixed(2);

  console.log(`⏱️ مدة المرحلة: ${stageDurationSeconds.toFixed(2)}s | إجمالي الطلبات: ${totalRequests.toLocaleString()} | الإنتاجية: ${rps} Req/Sec`);
  console.log(`📈 الناجح: ${successfulRequests.toLocaleString()} | الفاشل: ${failedRequests.toLocaleString()} | نسبة الأخطاء: ${errorRatePct}%`);
  console.log(`⚡ زمن الاستجابة: Min=${minLatency}ms | Avg=${avgLatency}ms | P50=${p50}ms | P95=${p95}ms | P99=${p99}ms | Max=${maxLatency}ms`);

  if (failedRequests > 0) {
    console.log('\n⚠️ تفاصيل أخطاء هذه المرحلة:');
    errorMap.forEach((val, key) => {
      console.log(`   • [${key}]: تكرر ${val.count} مرة | مثال: "${val.sample.slice(0, 90)}"`);
    });
  }

  const errorsSummaryCsv = Array.from(errorMap.entries()).map(([k, v]) => `${k}: ${v.count}`).join('; ') || 'None';

  return {
    concurrency,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePct: `${errorRatePct}%`,
    minLatency,
    avgLatency,
    p50,
    p95,
    p99,
    maxLatency,
    durationSeconds: stageDurationSeconds.toFixed(2),
    rps,
    errorsSummaryCsv,
    errorMap,
    eventLoopP95Ms,
  };
}

// =========================================================================================
// 🔍 تشخيص أسباب الاختناق ونقاط الانهيار (BOTTLENECK ROOT CAUSE ANALYSIS)
// =========================================================================================

function diagnoseBottlenecks(errorMap, metrics = {}) {
  console.log('\n' + '='.repeat(85));
  console.log('🔍 التقرير التحليلي لأسباب الاختناق وموقع عنق الزجاجة (Bottleneck Diagnosis)');
  console.log('='.repeat(85));

  let detectedIssues = 0;

  // 1. فحص استنزاف مسبح اتصالات قاعدة البيانات (Prisma / DB Connection Pool Starvation)
  let dbPoolErrors = 0;
  errorMap.forEach((val, key) => {
    if (val.classification?.isDbPool || key.includes('DB_POOL') || val.sample.includes('P2024')) {
      dbPoolErrors += val.count;
    }
  });

  if (dbPoolErrors > 0) {
    detectedIssues++;
    console.log(`\n🔴 [عنق الزجاجة رقم 1: استنزاف مسبح اتصالات قاعدة البيانات - DB Connection Pool Starvation]`);
    console.log(`   • الأعراض: رُصد ${dbPoolErrors} خطأ بسبب تجاوز مهلة انتظار اتصال قاعدة بيانات (Prisma Error P2024 / Connection Timeout).`);
    console.log(`   • التفسير: مسبح اتصالات Postgres/Prisma الافتراضي (حوالي 10 اتصالات) امتلأ بالكامل، وتراكمت طلبات المستخدمين في الطابور حتى انتهت مهلة الانتظار.`);
    console.log(`   • 💡 الحل الموصى به:`);
    console.log(`     1. في ملف .env، ارفع حد اتصالات Prisma عبر رابط DATABASE_URL:`);
    console.log(`        DATABASE_URL="postgresql://user:pass@localhost:5432/educenter?schema=public&connection_limit=30&pool_timeout=20"`);
    console.log(`     2. تأكد من أن قيمة max_connections في postgresql.conf في السيرفر كافية (مثلاً: 100 أو 200).`);
    console.log(`     3. في بيئات الإنتاج الكبيرة، يُفضل استخدام مجمع اتصالات خارجي مثل PgBouncer.`);
  }

  // 2. فحص الـ Rate Limiting (ThrottlerGuard)
  let throttleErrors = 0;
  errorMap.forEach((val, key) => {
    if (val.classification?.isThrottled || key.includes('429')) {
      throttleErrors += val.count;
    }
  });

  if (throttleErrors > 0) {
    detectedIssues++;
    console.log(`\n🟡 [عنق الزجاجة رقم 2: حماية الـ Rate Limiting - NestJS ThrottlerGuard]`);
    console.log(`   • الأعراض: رُصد ${throttleErrors} طلب تم صده بكود HTTP 429 (Too Many Requests).`);
    console.log(`   • التفسير: تطبيق NestJS لديك يحتوي على حماية ThrottlerGuard نشطة تصد الطلبات المتتالية القادمة من نفس الـ IP.`);
    console.log(`   • 💡 الحل الموصى به:`);
    console.log(`     - إذا كنت تريد قياس طاقة الباك إند الحقيقية وقاعدة البيانات، يمكنك رفع حدود ThrottlerModule مؤقتاً في AppModule أثناء الاختبار، أو تجاوز الـ IP المحلي.`);
  }

  // 3. فحص انقطاع السوكيت أو إغلاق الاتصال المفاجئ (Socket Hang Up / Connection Drops)
  let socketErrors = 0;
  errorMap.forEach((val, key) => {
    if (val.classification?.isSocketDrop || key.includes('ECONNRESET')) {
      socketErrors += val.count;
    }
  });

  if (socketErrors > 0) {
    detectedIssues++;
    console.log(`\n🟠 [عنق الزجاجة رقم 3: سقوط اتصالات السوكيت - Socket Drops / Connection Reset]`);
    console.log(`   • الأعراض: رُصد ${socketErrors} اتصال تم إسقاطه من طرف السيرفر أو نظام التشغيل (ECONNRESET).`);
    console.log(`   • التفسير: السيرفر وصل لحد أقصى في قائمة انتظار اتصالات الـ TCP (backlog) أو سقف الملفات المفتوحة (OS File Descriptors / ulimit).`);
  }

  // 4. فحص بطء الـ Event Loop (CPU-bound bottlenecks)
  if (metrics.eventLoopP95Ms > 100) {
    detectedIssues++;
    console.log(`\n🟣 [عنق الزجاجة رقم 4: اختناق الـ Event Loop في Node.js]`);
    console.log(`   • الأعراض: ارتفع تأخر الـ Event Loop إلى ${metrics.eventLoopP95Ms}ms.`);
    console.log(`   • التفسير: الثريد الفردي للـ Node.js ينشغل بعمليات حاسوبية متزامنة (Sync CPU tasks) مثل تشفير bcrypt أو تحويلات JSON ضخمة.`);
    console.log(`   • 💡 الحل الموصى به: تشغيل NestJS بنمط الـ Cluster أو عبر PM2 للاستفادة من جميع أنوية المعالج (Multi-core CPUs).`);
  }

  if (detectedIssues === 0) {
    console.log(`\n✅ السيرفر وقاعدة البيانات يعملان بكفاءة عالية وبدون أي اختناقات ظاهرة ضمن هذا النطاق.`);
  }
}

// =========================================================================================
// 📊 حفظ التقرير وطباعة الجدول المقارن (REPORTING)
// =========================================================================================

function printFinalSummaryTable(results) {
  console.log('\n' + '='.repeat(105));
  console.log('🏁 التقرير النهائي المقارن (Load & Stress Testing Summary)');
  console.log('='.repeat(105));

  console.table(
    results.map((r) => ({
      'Concurrency': r.concurrency,
      'Total Req': r.totalRequests,
      'Success': r.successfulRequests,
      'Failed': r.failedRequests,
      'Err %': r.errorRatePct,
      'Min (ms)': r.minLatency,
      'Avg (ms)': r.avgLatency,
      'P95 (ms)': r.p95,
      'Max (ms)': r.maxLatency,
      'RPS': r.rps,
    }))
  );
}

function saveCsvReport(results) {
  const headers = [
    'Concurrency',
    'Total Requests',
    'Success',
    'Failed',
    'Error Rate (%)',
    'Min Latency (ms)',
    'Avg Latency (ms)',
    'P50 Latency (ms)',
    'P95 Latency (ms)',
    'P99 Latency (ms)',
    'Max Latency (ms)',
    'Duration (s)',
    'RPS',
    'Errors Breakdown',
  ];

  const rows = results.map((r) => [
    escapeCsv(r.concurrency),
    escapeCsv(r.totalRequests),
    escapeCsv(r.successfulRequests),
    escapeCsv(r.failedRequests),
    escapeCsv(r.errorRatePct),
    escapeCsv(r.minLatency),
    escapeCsv(r.avgLatency),
    escapeCsv(r.p50),
    escapeCsv(r.p95),
    escapeCsv(r.p99),
    escapeCsv(r.maxLatency),
    escapeCsv(r.durationSeconds),
    escapeCsv(r.rps),
    escapeCsv(r.errorsSummaryCsv),
  ]);

  const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

  try {
    fs.writeFileSync(CONFIG.CSV_OUTPUT_PATH, csvContent, 'utf-8');
    console.log(`\n💾 تم حفظ تقرير CSV بنجاح في: ${CONFIG.CSV_OUTPUT_PATH}`);
  } catch (err) {
    console.error(`❌ فشل حفظ ملف CSV: ${err.message}`);
  }
}

// =========================================================================================
// 🚀 نقطة الانطلاق الرئيسية (MAIN ENTRYPOINT)
// =========================================================================================

async function main() {
  console.log('='.repeat(85));
  console.log('🎯 بدء منصة اختبارات التحمل والضغط المتقدمة - NestJS API');
  console.log(`🌐 السيرفر المستهدف: ${CONFIG.BACKEND_URL}`);
  console.log(`🕹️ النمط النشط: ${CONFIG.TEST_MODE === 'SUSTAINED_LOAD' ? '⏱️ Sustained Load (حمل مستمر)' : '⚡ Stress Stepped (كسر السقف)'}`);
  console.log('='.repeat(85));

  try {
    // 1. تسجيل دخول المستخدمين وجلب الـ Tokens
    const validUsers = await authenticateUsers();

    let finalSummaries = [];

    if (CONFIG.TEST_MODE === 'SUSTAINED_LOAD') {
      // 2. نمط الحمل المستمر (30 إلى 60 ثانية)
      finalSummaries = await runSustainedLoadTest(validUsers);
    } else {
      // 3. نمط كسر السقف والتدرج (Stress Testing: 32 -> 64 -> 128 -> 256)
      const combinedErrorMap = new Map();
      let breakingPointDetected = null;

      for (const concurrency of CONFIG.STRESS.CONCURRENCY_LEVELS) {
        const summary = await runStressStage(concurrency, validUsers);
        finalSummaries.push(summary);

        // دمج الأخطاء
        summary.errorMap.forEach((val, key) => {
          if (!combinedErrorMap.has(key)) combinedErrorMap.set(key, { ...val });
          else combinedErrorMap.get(key).count += val.count;
        });

        // رصد نقطة الانهيار (Breaking Point)
        const errPct = parseFloat(summary.errorRatePct);
        if ((errPct > 5.0 || summary.avgLatency > 1500) && !breakingPointDetected) {
          breakingPointDetected = {
            concurrency,
            errorRatePct: summary.errorRatePct,
            avgLatency: summary.avgLatency,
          };
        }

        if (CONFIG.STRESS.COOLDOWN_MS > 0 && concurrency !== CONFIG.STRESS.CONCURRENCY_LEVELS[CONFIG.STRESS.CONCURRENCY_LEVELS.length - 1]) {
          process.stdout.write(`⏳ استراحة تبريد (${CONFIG.STRESS.COOLDOWN_MS / 1000} ثوانٍ)... `);
          await sleep(CONFIG.STRESS.COOLDOWN_MS);
          console.log('جاهز.');
        }
      }

      // إعلان نقطة الانهيار إن وُجدت
      if (breakingPointDetected) {
        console.log('\n' + '!'.repeat(85));
        console.log(`💥 [تم رصد نقطة الانهيار - Breaking Point]: عند مستوى التزامن = ${breakingPointDetected.concurrency}`);
        console.log(`   نسبة الأخطاء قفزت إلى ${breakingPointDetected.errorRatePct} مع متوسط زمن استجابة ${breakingPointDetected.avgLatency}ms.`);
        console.log('!'.repeat(85));
      }

      // تشخيص أسباب الاختناق التراكمية
      diagnoseBottlenecks(combinedErrorMap);
    }

    // 4. طباعة الجدول النهائي وتصدير الـ CSV
    printFinalSummaryTable(finalSummaries);
    saveCsvReport(finalSummaries);

    console.log('\n✨ اكتمل الاختبار بنجاح!');
  } catch (error) {
    console.error(`\n❌ حدث خطأ غير متوقع:`, error.message || error);
    process.exit(1);
  }
}

main();
