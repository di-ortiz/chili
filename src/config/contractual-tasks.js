/**
 * Contractual deliverables for SEO and PPC accounts.
 * Each task has: name, frequency, responsible role, and tier time allocations.
 * These are checked against ClickUp tasks to flag missing or late deliverables.
 */

const SEO_TASKS = [
  // Honeymoon (1st month)
  { task: "Access Call", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Internal Onboarding", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Competitor Research (Industry+Competitor)", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Client Onboarding Call", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Welcome Email/Onboarding Summary", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Keyword Research", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Keyword Research Signoff", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Backlink Audit", frequency: "honeymoon", responsible: "Backlink/Offpage Analyst" },
  { task: "Review Tracking & Set Up", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Access Confirmation", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Tagging and Tracking Signoff", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Keywords for Approval", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Start On-page Content Creation", frequency: "honeymoon", responsible: "Content Team" },
  { task: "Off Page Sprint", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Off Page for Client Approval", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Off Page Implementation", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Off Page Signoff", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "AA Dashboard Creation & Setup", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "AA Training", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Website Audit Benchmark", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Set Keyword Benchmark Report", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Website Backup", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Start Onsite Checklist", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Onsite for Approval", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Content for Approval", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Set up Monthly Reporting", frequency: "honeymoon", responsible: "SEO Analyst" },
  { task: "Complete Onsite Implementation", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Onsite Content Upload", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Onboarding Signoff", frequency: "honeymoon", responsible: "SEO Analyst" },

  // Monthly
  { task: "Prepare Onsite Content Brief", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "Monthly Report", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "Monthly Report Presentation", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "Content for Approval", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "[SEO] Start On-page & Blog Content Creation", frequency: "monthly", responsible: "Content Team" },
  { task: "Backlink Strategy", frequency: "monthly", responsible: "Backlink/Offpage Analyst" },
  { task: "Order Backlinks", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "NPS Setup & Send", frequency: "monthly", responsible: "SEO Analyst" },
  { task: "Content Implementation (Blog and On-Page)", frequency: "monthly", responsible: "Technical Team" },
  { task: "Internal Results Meeting And Strategy Alignment", frequency: "monthly", responsible: "SEO Analyst" },

  // Biweekly
  { task: "Biweekly Meeting", frequency: "biweekly", responsible: "SEO Analyst" },

  // Quarterly
  { task: "New Link Disavow List", frequency: "quarterly", responsible: "Backlink/Offpage Analyst" },
  { task: "Quarterly Technical & Content Audit", frequency: "quarterly", responsible: "Technical Team" },
  { task: "Quarterly Technical Implementations", frequency: "quarterly", responsible: "Technical Team" },
  { task: "Quarterly Performance Review Draft", frequency: "quarterly", responsible: "SEO Analyst" },
  { task: "Quarterly Performance Review Presentation", frequency: "quarterly", responsible: "SEO Analyst" },
];

const PPC_TASKS = [
  // Honeymoon (1st month)
  { task: "Wallet Set up/Update", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Access Call", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Access Confirmation", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Create Media Plan", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Media Plan Signoff", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Media Plan for Approval", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Ad Creatives for Approval", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Improve Segmentation and Click Auctions", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Competitor Research (Creatives+Industry)", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Ad Preview for Approval", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Launch Campaigns", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Welcome Email/Onboarding Summary", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Keyword Research", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Client Onboarding Call", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Internal Onboarding", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Design Brief for Ads Recurring Task", frequency: "honeymoon", responsible: "PPC Specialist" },
  { task: "Design Ads Recurring Task", frequency: "honeymoon", responsible: "Designer" },
  { task: "AA Dashboard Creation & Setup", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "AA Training", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Onboarding Signoff", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Review Tracking & Set Up", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Billing Confirmation", frequency: "honeymoon", responsible: "Finance Team" },
  { task: "Tagging and Tracking Signoff", frequency: "honeymoon", responsible: "Technical Team" },
  { task: "Onboarding PPT", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Asset Folder Share with the Client", frequency: "honeymoon", responsible: "Account Manager" },
  { task: "Auditing of Channels and Accounts", frequency: "honeymoon", responsible: "PPC Specialist" },

  // Recurring
  { task: "Quarterly Account Audit", frequency: "quarterly", responsible: "PPC Specialist" },
  { task: "Quarterly Performance Review Draft", frequency: "quarterly", responsible: "PPC Specialist" },
  { task: "Quarterly Performance Review for Approval", frequency: "quarterly", responsible: "PPC Specialist" },
  { task: "Quarterly Competitor Analysis Review", frequency: "quarterly", responsible: "PPC Specialist" },
  { task: "NPS Setup & Sending", frequency: "monthly", responsible: "Account Manager" },
  { task: "New AB Tests (Text, Visual, Campaigns, LPs)", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "New Campaigns Setup & Existing Campaign Optimization", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "Biweekly Meeting", frequency: "biweekly", responsible: "Account Manager" },
  { task: "CRM Audit and Remarketing/Exclusion Lists", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "CRM Access and Connection to Dashboard and Ad Platforms", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "Tagging & Tracking Remarketing Setup And Optimization", frequency: "monthly", responsible: "Technical Team" },
  { task: "Internal Results Meeting And Strategy Alignment", frequency: "monthly", responsible: "Account Manager" },
  { task: "Monthly Report Meeting", frequency: "monthly", responsible: "Account Manager" },
  { task: "Monthly Report", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "KY Negativation", frequency: "biweekly", responsible: "PPC Specialist" },
  { task: "Target CPA/Max Conv Check", frequency: "biweekly", responsible: "PPC Specialist" },
  { task: "Target Local Review", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "Structure Review", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "Ad Review", frequency: "monthly", responsible: "PPC Specialist" },
  { task: "Yearly Results Report", frequency: "yearly", responsible: "Account Manager" },
];

module.exports = { SEO_TASKS, PPC_TASKS };
