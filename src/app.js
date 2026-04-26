const path = require("path");
const express = require("express");
const { loadData } = require("./services/dataLoader");
const { RecommendationEngine } = require("./services/recommendationEngine");

const app = express();
const port = Number(process.env.PORT) || 3000;

const data = loadData(path.join(process.cwd(), "data"));
const engine = new RecommendationEngine(data);
const teamMembers = [
  "motasem_193362_C1",
  "SHAM_209856_C1",
  "byan_241674_C2",
  "zinab_198823_C1",
  "leen_138752_C2",
  "joud_260110_C4",
  "raida_tahhan_235797_C4",
];

app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/", (req, res) => {
  const users = engine.getUserList();
  const requestedUserId = Number.parseInt(req.query.userId, 10);
  const selectedUserId = Number.isInteger(requestedUserId)
    ? requestedUserId
    : users[0]?.user_id;

  let result = null;
  let error = null;
  if (selectedUserId !== undefined) {
    try {
      result = engine.getRecommendationsForUser(selectedUserId, 8);
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }
  }

  res.render("index", {
    users,
    selectedUserId,
    result,
    error,
    teamMembers,
    datasetSummary: engine.getDatasetSummary(),
    behaviorFile: data.behaviorFile,
    paper: {
      title:
        "E-commerce recommender system based on improved K-means commodity information management model",
      authors: "Wei Zhang, Zonghua Wu",
      journal: "Heliyon, Volume 10, Issue 9 (2024)",
      doi: "10.1016/j.heliyon.2024.e29045",
      url: "https://doi.org/10.1016/j.heliyon.2024.e29045",
    },
  });
});

app.get("/api/recommendations/:userId", (req, res) => {
  const userId = Number.parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  try {
    const result = engine.getRecommendationsForUser(userId, 10);
    return res.json(result);
  } catch (err) {
    return res.status(404).json({
      error: err instanceof Error ? err.message : "Recommendation not available",
    });
  }
});

app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, service: "lynn-recommender" });
});

app.use((req, res) => {
  res.redirect("/");
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on http://localhost:${port}`);
});

