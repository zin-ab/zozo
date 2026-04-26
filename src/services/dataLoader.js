const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

function readWorkbookRows(filePath) {
  const workbook = xlsx.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(sheet, { defval: null });
}

function resolveBehaviorFile(dataDir) {
  const candidates = ["behavior.xlsx", "behavior_15500.xlsx"];
  for (const fileName of candidates) {
    const fullPath = path.join(dataDir, fileName);
    if (fs.existsSync(fullPath)) {
      return fileName;
    }
  }
  throw new Error(
    "Behavior file not found. Expected one of: behavior.xlsx, behavior_15500.xlsx",
  );
}

function loadData(dataDir = path.join(process.cwd(), "data")) {
  const usersPath = path.join(dataDir, "users.xlsx");
  const productsPath = path.join(dataDir, "products.xlsx");
  const ratingsPath = path.join(dataDir, "ratings.xlsx");
  const behaviorFile = resolveBehaviorFile(dataDir);
  const behaviorPath = path.join(dataDir, behaviorFile);

  const users = readWorkbookRows(usersPath);
  const products = readWorkbookRows(productsPath);
  const ratings = readWorkbookRows(ratingsPath);
  const behavior = readWorkbookRows(behaviorPath);

  return {
    users,
    products,
    ratings,
    behavior,
    dataDir,
    behaviorFile,
  };
}

module.exports = {
  loadData,
};

