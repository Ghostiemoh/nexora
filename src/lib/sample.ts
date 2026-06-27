import type { Row } from "./types";

export interface SampleDataset {
  name: string;
  columns: string[];
  rows: Row[];
}

export function generateSampleDataset(): SampleDataset {
  const columns = ["customer_id", "name", "tier", "monthly_charge", "api_calls", "support_tickets", "churn_risk"];
  
  const baseRows: Row[] = [
    { customer_id: "c_101", name: "Alice Miller ", tier: "Enterprise", monthly_charge: 150, api_calls: 12400, support_tickets: 1, churn_risk: false },
    { customer_id: "c_102", name: "Bob Smith", tier: "Pro_Plus", monthly_charge: 75, api_calls: 8100, support_tickets: 2, churn_risk: false },
    { customer_id: "c_103", name: "Charlie Brown", tier: "Enterprise", monthly_charge: 150, api_calls: 4500, support_tickets: 4, churn_risk: true },
    { customer_id: "c_104", name: "Diana Prince", tier: "Pro", monthly_charge: 35, api_calls: 1200, support_tickets: 0, churn_risk: false },
    { customer_id: "c_105", name: "Evan Wright", tier: "Enterprise", monthly_charge: 150, api_calls: 13000, support_tickets: null, churn_risk: false },
    { customer_id: "c_106", name: "Fiona Gallagher", tier: "Pro", monthly_charge: 35, api_calls: 950, support_tickets: 3, churn_risk: true },
    { customer_id: "c_107", name: "George Stark ", tier: "Enterprise", monthly_charge: 150, api_calls: 11000, support_tickets: 1, churn_risk: false },
    { customer_id: "c_108", name: "Hannah Abbott", tier: "Pro_Plus", monthly_charge: 75, api_calls: 7800, support_tickets: 0, churn_risk: false },
    { customer_id: "c_109", name: "Ian Malcolm", tier: "Enterprise", monthly_charge: null, api_calls: 3200, support_tickets: 5, churn_risk: true },
    { customer_id: "c_110", name: "Julia Roberts", tier: "Pro", monthly_charge: 35, api_calls: 1150, support_tickets: 1, churn_risk: false },
    // Duplicate row for testing dropDuplicates
    { customer_id: "c_101", name: "Alice Miller ", tier: "Enterprise", monthly_charge: 150, api_calls: 12400, support_tickets: 1, churn_risk: false },
    // Empty value rows
    { customer_id: null, name: null, tier: null, monthly_charge: null, api_calls: null, support_tickets: null, churn_risk: null },
  ];

  // Generate 50 rows for data richness
  const rows = [...baseRows];
  for (let i = 11; i <= 50; i++) {
    const isEnterprise = i % 3 === 0;
    const isProPlus = i % 3 === 1;
    const hasTickets = i % 5 === 0;
    const apiCalls = isEnterprise ? (10000 + i * 50) : (isProPlus ? (5000 + i * 40) : (800 + i * 10));
    
    rows.push({
      customer_id: `c_${100 + i}`,
      name: `Customer ${i} ${i % 7 === 0 ? " " : ""}`,
      tier: isEnterprise ? "Enterprise" : (isProPlus ? "Pro_Plus" : "Pro"),
      monthly_charge: isEnterprise ? 150 : (isProPlus ? 75 : 35),
      api_calls: apiCalls,
      support_tickets: hasTickets ? (i % 4) : 0,
      churn_risk: isEnterprise && i % 9 === 0
    });
  }

  return {
    name: "customer_churn_q3.csv",
    columns,
    rows
  };
}
