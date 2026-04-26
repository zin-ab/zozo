const path = require("path");
const { loadData } = require("./services/dataLoader");
const { RecommendationEngine } = require("./services/recommendationEngine");

const data = loadData(path.join(process.cwd(), "data"));
const engine = new RecommendationEngine(data);
const users = engine.getUserList();

const sampleSizeArg = Number.parseInt(process.argv[2], 10);
const sampleSize = Number.isInteger(sampleSizeArg)
  ? Math.max(1, Math.min(sampleSizeArg, users.length))
  : users.length;

let baselineSum = 0;
let optimizedSum = 0;
let upliftSum = 0;
let validCount = 0;

for (let idx = 0; idx < sampleSize; idx += 1) {
  const user = users[idx];
  try {
    const result = engine.getRecommendationsForUser(user.user_id, 8);
    baselineSum += result.metrics.baseline_fitness;
    optimizedSum += result.metrics.optimized_fitness;
    upliftSum += result.metrics.uplift_percent;
    validCount += 1;
  } catch (_) {
    // Ignore users without enough signal.
  }
}

if (!validCount) {
  // eslint-disable-next-line no-console
  console.log("No valid users for evaluation.");
  process.exit(0);
}

const avgBaseline = baselineSum / validCount;
const avgOptimized = optimizedSum / validCount;
const avgUplift = upliftSum / validCount;

// eslint-disable-next-line no-console
console.log(
  JSON.stringify(
    {
      evaluated_users: validCount,
      average_baseline_fitness: Number(avgBaseline.toFixed(4)),
      average_optimized_fitness: Number(avgOptimized.toFixed(4)),
      average_uplift_percent: Number(avgUplift.toFixed(2)),
    },
    null,
    2,
  ),
);

