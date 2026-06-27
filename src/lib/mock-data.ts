/* ─── Mock Data Fixtures for Nexora MVP ─── */

export const datasetHealthMetrics = {
  overallScore: 92,
  trend: "+2.4%",
  trendLabel: "vs last week",
  anomalies: 3,
  completeness: 99.8,
  uniqueness: 97.2,
  validity: 95.6,
  consistency: 94.1,
};

export const computeUsageData = [
  { day: "Mon", usage: 1.2, normalized: 40 },
  { day: "Tue", usage: 1.8, normalized: 60 },
  { day: "Wed", usage: 0.9, normalized: 30 },
  { day: "Thu", usage: 2.4, normalized: 80 },
  { day: "Fri", usage: 1.65, normalized: 55 },
  { day: "Sat", usage: 2.85, normalized: 95 },
  { day: "Sun", usage: 1.35, normalized: 45 },
];

export const aiRecommendations = [
  {
    id: "rec-1",
    title: "Optimize Query Q-442",
    description:
      "Execution time increased by 45%. Adding an index to 'user_id' in 'transactions' table could reduce load by ~2s.",
    icon: "query_stats" as const,
    type: "ai" as const,
    fix: {
      label: "Apply Fix",
      op: { kind: "dropDuplicates" } // Just map to a standard clean op for demo
    },
    actions: [
      { label: "Apply Fix", variant: "primary" as const },
      { label: "Dismiss", variant: "ghost" as const },
    ],
  },
  {
    id: "rec-2",
    title: "Redundant Data Model Detected",
    description:
      "Models 'customer_base' and 'client_profiles' have 90% schema overlap. Consider merging to save compute.",
    icon: "schema" as const,
    type: "standard" as const,
    actions: [{ label: "Review Merge", variant: "primary" as const }],
  },
];

export const recentProjects = [
  {
    id: "proj-1",
    name: "Q4 Revenue Forecasting",
    updatedAt: "2h ago",
    isActive: true,
  },
  {
    id: "proj-2",
    name: "Customer Churn Model",
    updatedAt: "1d ago",
    isActive: false,
  },
  {
    id: "proj-3",
    name: "Inventory Optimization",
    updatedAt: "3d ago",
    isActive: false,
  },
];

export const savedDashboards = [
  { id: "dash-1", name: "Executive Overview", widgetCount: 12 },
  { id: "dash-2", name: "Marketing Spend ROI", widgetCount: 8 },
];
