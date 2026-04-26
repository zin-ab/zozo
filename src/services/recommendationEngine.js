function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function average(values, fallback = 0) {
  if (!values.length) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values, fallback = 0) {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeWeights(rawWeights) {
  const cleaned = rawWeights.map((value) => Math.max(0, Number(value) || 0));
  const sum = cleaned.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return new Array(rawWeights.length).fill(1 / rawWeights.length);
  }
  return cleaned.map((value) => value / sum);
}

function randomWeightVector(size, random) {
  const raw = [];
  for (let i = 0; i < size; i += 1) {
    raw.push(random());
  }
  return normalizeWeights(raw);
}

function blendCrossover(parentA, parentB, random) {
  const child = [];
  for (let i = 0; i < parentA.length; i += 1) {
    const alpha = random();
    child.push(alpha * parentA[i] + (1 - alpha) * parentB[i]);
  }
  return normalizeWeights(child);
}

function mutateWeights(weights, mutationRate, random) {
  const child = [...weights];

  for (let i = 0; i < child.length; i += 1) {
    if (random() < mutationRate) {
      child[i] += (random() * 2 - 1) * 0.2;
    }
  }

  if (random() < mutationRate * 0.5) {
    const i = Math.floor(random() * child.length);
    const j = Math.floor(random() * child.length);
    [child[i], child[j]] = [child[j], child[i]];
  }

  return normalizeWeights(child);
}

function weightedDot(vectorA, vectorB) {
  let total = 0;
  for (let i = 0; i < vectorA.length; i += 1) {
    total += (vectorA[i] || 0) * (vectorB[i] || 0);
  }
  return total;
}

function weightDistance(a, b) {
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    distance += Math.abs((a[i] || 0) - (b[i] || 0));
  }
  return distance;
}

function tournamentSelect(scoredPopulation, random, size = 3) {
  let winner = null;
  for (let i = 0; i < size; i += 1) {
    const contestant =
      scoredPopulation[Math.floor(random() * scoredPopulation.length)];
    if (!winner || contestant.fitness > winner.fitness) {
      winner = contestant;
    }
  }
  return winner.weights;
}

class RecommendationEngine {
  constructor({ users, products, ratings, behavior }) {
    this.users = users.map((u) => ({
      user_id: Number(u.user_id),
      age: Number(u.age),
      country: u.country || u.location || "Unknown",
    }));

    this.products = products.map((p) => ({
      product_id: Number(p.product_id),
      category: String(p.category || "Unknown"),
      price: Number(p.price),
    }));

    this.ratings = ratings.map((r) => ({
      user_id: Number(r.user_id),
      product_id: Number(r.product_id),
      rating: Number(r.rating),
    }));

    this.behavior = behavior.map((b) => ({
      user_id: Number(b.user_id),
      product_id: Number(b.product_id),
      viewed: Number(b.viewed) || 0,
      clicked: Number(b.clicked) || 0,
      purchased: Number(b.purchased) || 0,
    }));

    this.userMap = new Map(this.users.map((u) => [u.user_id, u]));
    this.productMap = new Map(this.products.map((p) => [p.product_id, p]));

    const prices = this.products.map((p) => p.price);
    this.globalMinPrice = Math.min(...prices);
    this.globalMaxPrice = Math.max(...prices);
    this.globalPriceRange = Math.max(1, this.globalMaxPrice - this.globalMinPrice);
    this.globalMedianPrice = median(prices, 0);

    this.userProfiles = this.buildUserProfiles();
    this.productPopularity = this.buildProductPopularity();
    this.defaultCriteriaWeights = [0.45, 0.2, 0.2, 0.15];
  }

  getUserList() {
    return [...this.users].sort((a, b) => a.user_id - b.user_id);
  }

  getDatasetSummary() {
    return {
      users: this.users.length,
      products: this.products.length,
      ratings: this.ratings.length,
      behavior: this.behavior.length,
    };
  }

  buildUserProfiles() {
    const interactionMap = new Map();
    const makeKey = (userId, productId) => `${userId}|${productId}`;

    for (const row of this.ratings) {
      if (!this.userMap.has(row.user_id) || !this.productMap.has(row.product_id)) {
        continue;
      }

      const key = makeKey(row.user_id, row.product_id);
      const current = interactionMap.get(key) || {
        user_id: row.user_id,
        product_id: row.product_id,
        rating: null,
        viewed: 0,
        clicked: 0,
        purchased: 0,
      };

      current.rating = clamp01(row.rating / 5);
      interactionMap.set(key, current);
    }

    for (const row of this.behavior) {
      if (!this.userMap.has(row.user_id) || !this.productMap.has(row.product_id)) {
        continue;
      }

      const key = makeKey(row.user_id, row.product_id);
      const current = interactionMap.get(key) || {
        user_id: row.user_id,
        product_id: row.product_id,
        rating: null,
        viewed: 0,
        clicked: 0,
        purchased: 0,
      };

      current.viewed = Math.max(current.viewed, row.viewed);
      current.clicked = Math.max(current.clicked, row.clicked);
      current.purchased = Math.max(current.purchased, row.purchased);
      interactionMap.set(key, current);
    }

    const profileMap = new Map();
    const getProfile = (userId) => {
      if (!profileMap.has(userId)) {
        profileMap.set(userId, {
          user_id: userId,
          interactions: [],
          purchasedProducts: new Set(),
          categoryTotals: new Map(),
          categorySignals: new Map(),
          priceSamples: [],
          preferredPrice: this.globalMedianPrice,
          categoryAffinity: new Map(),
          categoryEngagement: new Map(),
          viewedCount: 0,
          clickedCount: 0,
          purchasedCount: 0,
        });
      }
      return profileMap.get(userId);
    };

    for (const row of interactionMap.values()) {
      const product = this.productMap.get(row.product_id);
      if (!product) continue;

      const behaviorComponent = clamp01(
        (row.viewed + 2 * row.clicked + 3 * row.purchased) / 6,
      );

      let score = 0;
      if (row.rating !== null) {
        score = 0.65 * row.rating + 0.35 * behaviorComponent;
      } else {
        score = behaviorComponent;
      }
      score = clamp01(score);

      const profile = getProfile(row.user_id);
      profile.interactions.push({
        product_id: row.product_id,
        category: product.category,
        price: product.price,
        score,
        viewed: row.viewed,
        clicked: row.clicked,
        purchased: row.purchased,
      });

      profile.viewedCount += row.viewed;
      profile.clickedCount += row.clicked;
      profile.purchasedCount += row.purchased;

      if (row.purchased) {
        profile.purchasedProducts.add(row.product_id);
      }

      const categoryBoost = 1 + 0.5 * row.purchased + 0.2 * row.clicked;
      const prevCategoryTotal = profile.categoryTotals.get(product.category) || 0;
      profile.categoryTotals.set(
        product.category,
        prevCategoryTotal + score * categoryBoost,
      );

      const prevSignal = profile.categorySignals.get(product.category) || {
        viewed: 0,
        clicked: 0,
        purchased: 0,
        total: 0,
      };
      prevSignal.viewed += row.viewed;
      prevSignal.clicked += row.clicked;
      prevSignal.purchased += row.purchased;
      prevSignal.total += 1;
      profile.categorySignals.set(product.category, prevSignal);

      if (score > 0) {
        profile.priceSamples.push(product.price);
      }
    }

    for (const user of this.users) {
      const profile = getProfile(user.user_id);
      profile.preferredPrice = median(profile.priceSamples, this.globalMedianPrice);

      const categoryEntries = [...profile.categoryTotals.entries()];
      const maxCategory = categoryEntries.length
        ? Math.max(...categoryEntries.map(([, value]) => value))
        : 0;

      for (const [category, value] of categoryEntries) {
        const normalized = maxCategory > 0 ? value / maxCategory : 0;
        profile.categoryAffinity.set(category, clamp01(normalized));
      }

      for (const [category, signal] of profile.categorySignals.entries()) {
        const engagement = clamp01(
          (0.2 * signal.viewed + 0.4 * signal.clicked + 0.8 * signal.purchased) /
            Math.max(1, signal.total),
        );
        profile.categoryEngagement.set(category, engagement);
      }
    }

    return profileMap;
  }

  buildProductPopularity() {
    const totals = new Map();
    const counts = new Map();

    for (const profile of this.userProfiles.values()) {
      for (const item of profile.interactions) {
        const prevTotal = totals.get(item.product_id) || 0;
        const prevCount = counts.get(item.product_id) || 0;
        totals.set(item.product_id, prevTotal + item.score);
        counts.set(item.product_id, prevCount + 1);
      }
    }

    const rawScores = new Map();
    let maxScore = 0;
    for (const [productId, total] of totals.entries()) {
      const score = total / Math.max(1, counts.get(productId) || 1);
      rawScores.set(productId, score);
      maxScore = Math.max(maxScore, score);
    }

    const popularity = new Map();
    for (const product of this.products) {
      const raw = rawScores.get(product.product_id) || 0;
      const normalized = maxScore > 0 ? raw / maxScore : 0;
      popularity.set(product.product_id, clamp01(normalized));
    }

    return popularity;
  }

  buildCandidateList(userId) {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    const candidates = [];
    for (const product of this.products) {
      if (profile.purchasedProducts.has(product.product_id)) {
        continue;
      }

      const categoryAffinity = profile.categoryAffinity.get(product.category) ?? 0.05;
      const categoryEngagement =
        profile.categoryEngagement.get(product.category) ?? 0.1;
      const popularity = this.productPopularity.get(product.product_id) ?? 0.05;

      const priceDistance = Math.abs(product.price - profile.preferredPrice);
      const priceAlignment = 1 - Math.min(priceDistance / this.globalPriceRange, 1);

      const criteriaVector = [
        categoryAffinity,
        categoryEngagement,
        priceAlignment,
        popularity,
      ];

      const baseScore = clamp01(
        weightedDot(criteriaVector, this.defaultCriteriaWeights),
      );

      candidates.push({
        ...product,
        baseScore,
        criteriaVector,
        categoryAffinity,
        categoryEngagement,
        popularityScore: popularity,
        priceAlignment,
      });
    }

    candidates.sort((a, b) => b.baseScore - a.baseScore);
    return candidates;
  }

  buildTargetWeightVector(profile) {
    const interactionCount = profile.interactions.length;
    const maturity = clamp01(interactionCount / 18);

    const purchaseIntent = clamp01(
      (profile.clickedCount + 2 * profile.purchasedCount) /
        Math.max(1, profile.viewedCount + profile.clickedCount + profile.purchasedCount),
    );

    const raw = [
      0.38 + 0.25 * maturity,
      0.2 + 0.18 * purchaseIntent,
      0.22 + 0.12 * maturity,
      0.2 + 0.2 * (1 - maturity),
    ];

    return normalizeWeights(raw);
  }

  rankCandidatesWithWeights(pool, weights) {
    const normalized = normalizeWeights(weights);
    return [...pool]
      .map((candidate) => ({
        ...candidate,
        tunedScore: clamp01(weightedDot(candidate.criteriaVector, normalized)),
      }))
      .sort((a, b) => b.tunedScore - a.tunedScore);
  }

  evaluateTopN(topItems, preferredPrice) {
    const relevance = average(topItems.map((item) => item.tunedScore), 0);

    const categories = topItems.map((item) => item.category);
    const diversity = new Set(categories).size / Math.max(1, topItems.length);

    const novelty = average(
      topItems.map((item) => 1 - item.popularityScore),
      0,
    );

    const meanPrice = average(topItems.map((item) => item.price), preferredPrice);
    const priceHarmony = 1 - Math.min(
      Math.abs(meanPrice - preferredPrice) / this.globalPriceRange,
      1,
    );

    const engagementSupport = average(
      topItems.map((item) => item.categoryEngagement),
      0,
    );

    return {
      relevance: clamp01(relevance),
      diversity: clamp01(diversity),
      novelty: clamp01(novelty),
      price_harmony: clamp01(priceHarmony),
      engagement_support: clamp01(engagementSupport),
    };
  }

  collapseObjectives(metrics) {
    return clamp01(
      0.38 * metrics.relevance +
        0.17 * metrics.diversity +
        0.15 * metrics.novelty +
        0.18 * metrics.price_harmony +
        0.12 * metrics.engagement_support,
    );
  }

  runWeightOptimization({ userId, pool, targetWeights, topN }) {
    const random = createSeededRandom((userId * 1103515245) >>> 0);
    const populationSize = 42;
    const generations = 50;
    const mutationRate = 0.24;
    const eliteCount = 2;

    const evaluateWeights = (weights) => {
      const ranked = this.rankCandidatesWithWeights(pool, weights);
      const topItems = ranked.slice(0, topN);
      const objectives = this.evaluateTopN(topItems, this.userProfiles.get(userId).preferredPrice);
      const quality = this.collapseObjectives(objectives);

      const alignment = 1 - weightDistance(normalizeWeights(weights), targetWeights) / 2;
      const fitness = clamp01(0.78 * quality + 0.22 * clamp01(alignment));

      return {
        weights: normalizeWeights(weights),
        ranked,
        topItems,
        objectives,
        quality,
        fitness,
      };
    };

    const population = [
      this.defaultCriteriaWeights,
      targetWeights,
    ];

    while (population.length < populationSize) {
      population.push(randomWeightVector(4, random));
    }

    let scoredPopulation = population.map(evaluateWeights);

    for (let generation = 0; generation < generations; generation += 1) {
      scoredPopulation.sort((a, b) => b.fitness - a.fitness);
      const nextPopulation = scoredPopulation
        .slice(0, eliteCount)
        .map((item) => [...item.weights]);

      while (nextPopulation.length < populationSize) {
        const parentA = tournamentSelect(scoredPopulation, random, 3);
        const parentB = tournamentSelect(scoredPopulation, random, 3);

        const child = mutateWeights(
          blendCrossover(parentA, parentB, random),
          mutationRate,
          random,
        );

        nextPopulation.push(child);
      }

      scoredPopulation = nextPopulation.map(evaluateWeights);
    }

    scoredPopulation.sort((a, b) => b.fitness - a.fitness);
    return scoredPopulation[0];
  }

  hydrateRecommendationList(items) {
    return items.map((item, idx) => ({
      rank: idx + 1,
      product_id: item.product_id,
      category: item.category,
      price: item.price,
      predicted_score: Number(item.tunedScore.toFixed(4)),
      category_affinity: Number(item.categoryAffinity.toFixed(4)),
      popularity_score: Number(item.popularityScore.toFixed(4)),
      price_alignment: Number(item.priceAlignment.toFixed(4)),
    }));
  }

  getRecommendationsForUser(userId, topN = 10) {
    if (!this.userMap.has(userId)) {
      throw new Error(`User ${userId} not found in dataset`);
    }

    const profile = this.userProfiles.get(userId);
    const candidates = this.buildCandidateList(userId);

    if (!candidates.length) {
      throw new Error(`No candidate products available for user ${userId}`);
    }

    const pool = candidates.slice(0, Math.min(candidates.length, 180));
    const targetWeights = this.buildTargetWeightVector(profile);

    const baselineRanked = this.rankCandidatesWithWeights(
      pool,
      this.defaultCriteriaWeights,
    );
    const baselineTop = baselineRanked.slice(0, topN);
    const baselineObjectives = this.evaluateTopN(baselineTop, profile.preferredPrice);
    const baselineFitness = this.collapseObjectives(baselineObjectives);

    const optimized = this.runWeightOptimization({
      userId,
      pool,
      targetWeights,
      topN,
    });

    const finalTop = optimized.topItems;
    const finalFitness = optimized.quality;

    const uplift =
      baselineFitness > 0
        ? ((finalFitness - baselineFitness) / baselineFitness) * 100
        : 0;

    return {
      user: this.userMap.get(userId),
      profile: {
        preferred_price: Number(profile.preferredPrice.toFixed(2)),
        known_categories: [...profile.categoryAffinity.keys()],
        history_size: profile.interactions.length,
      },
      optimization: {
        default_weights: {
          category_affinity: Number(this.defaultCriteriaWeights[0].toFixed(4)),
          category_engagement: Number(this.defaultCriteriaWeights[1].toFixed(4)),
          price_alignment: Number(this.defaultCriteriaWeights[2].toFixed(4)),
          popularity: Number(this.defaultCriteriaWeights[3].toFixed(4)),
        },
        target_weights: {
          category_affinity: Number(targetWeights[0].toFixed(4)),
          category_engagement: Number(targetWeights[1].toFixed(4)),
          price_alignment: Number(targetWeights[2].toFixed(4)),
          popularity: Number(targetWeights[3].toFixed(4)),
        },
        optimized_weights: {
          category_affinity: Number(optimized.weights[0].toFixed(4)),
          category_engagement: Number(optimized.weights[1].toFixed(4)),
          price_alignment: Number(optimized.weights[2].toFixed(4)),
          popularity: Number(optimized.weights[3].toFixed(4)),
        },
      },
      metrics: {
        baseline_fitness: Number(baselineFitness.toFixed(4)),
        optimized_fitness: Number(finalFitness.toFixed(4)),
        uplift_percent: Number(uplift.toFixed(2)),
      },
      baseline_objectives: {
        relevance: Number(baselineObjectives.relevance.toFixed(4)),
        diversity: Number(baselineObjectives.diversity.toFixed(4)),
        novelty: Number(baselineObjectives.novelty.toFixed(4)),
        price_harmony: Number(baselineObjectives.price_harmony.toFixed(4)),
      },
      optimized_objectives: {
        relevance: Number(optimized.objectives.relevance.toFixed(4)),
        diversity: Number(optimized.objectives.diversity.toFixed(4)),
        novelty: Number(optimized.objectives.novelty.toFixed(4)),
        price_harmony: Number(optimized.objectives.price_harmony.toFixed(4)),
      },
      baseline: this.hydrateRecommendationList(baselineTop),
      optimized: this.hydrateRecommendationList(finalTop),
    };
  }
}

module.exports = {
  RecommendationEngine,
};
