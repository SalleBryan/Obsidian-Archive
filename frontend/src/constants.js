// ── THEME CONSTANTS ───────────────────────────────────────────────────────────
export const CATEGORIES = ["Fiction", "Sci-Fi", "Fantasy", "Dystopian", "Thriller", "Mystery", "Romance", "Horror", "Historical Fiction", "Young Adult", "Non-Fiction", "Biography", "Education", "Uncategorized"];

export const CAT_COLORS = {
  "Fiction":       "#ffcd5b",
  "Sci-Fi":        "#b9c8de",
  "Fantasy":       "#ffc6c1",
  "Non-Fiction":   "#4ADE80",
  "Mystery":       "#c084fc",
  "Romance":       "#f472b6",
  "Biography":     "#fb923c",
  "Education":     "#38bdf8",
  "Uncategorized": "#9b8f7b",
};
export const getCatColor = (cat) => CAT_COLORS[cat] || "#ffcd5b";
