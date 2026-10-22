import type { OpportunityMap } from "../src/contracts/opportunityMap.js";
import type { ProcessModel } from "../src/contracts/processModel.js";

export const PROCESS_TEXT = `# Purchase requests

Employees raise a purchase request with a title, an amount and the supplier. Each request starts in the pending status. Today employees email the buyer a spreadsheet and re-type the same request into three systems every week.

Suppliers are kept in a register with a unique name. The buyer maintains the supplier register. Wrong supplier names cause rejected invoices.

Approvers review pending requests and approve them. Approvals stall when pending requests sit in email threads.
`;

export const purchaseOpportunityMap = (sourceId: string): OpportunityMap => {
  const evidence = (quote: string) => [{ source_id: sourceId, quote }];
  return {
    summary:
      "Purchase intake and approval are slowed by spreadsheet re-entry and email handoffs.",
    opportunities: [
      {
        id: "digitize_purchase_requests",
        title: "Digitize purchase requests",
        pain: "Employees re-type the same purchase request into three systems from a spreadsheet email.",
        friction_kind: "manual_rework",
        affected_actor_labels: ["Employees", "buyer"],
        current_workaround:
          "employees email the buyer a spreadsheet and re-type the same request into three systems",
        software_hypothesis:
          "A shared purchase-request form with supplier register and approval status.",
        signals: {
          frequency: "stated",
          volume: "weak",
          cost_or_money: "none",
          severity: "weak",
        },
        confidence: "stated",
        evidence: evidence(
          "employees email the buyer a spreadsheet and re-type the same request into three systems every week",
        ),
      },
      {
        id: "approval_visibility",
        title: "Make pending approvals visible",
        pain: "Approvals stall when pending requests sit in email threads.",
        friction_kind: "handoff_delay",
        affected_actor_labels: ["Approvers"],
        software_hypothesis:
          "A pending-request queue for approvers with approve transitions.",
        signals: {
          frequency: "none",
          volume: "none",
          cost_or_money: "none",
          severity: "stated",
        },
        confidence: "stated",
        depends_on: ["digitize_purchase_requests"],
        evidence: evidence(
          "Approvals stall when pending requests sit in email threads.",
        ),
      },
    ],
  };
};

export const purchaseModel = (sourceId: string): ProcessModel => {
  const evidence = (quote: string) => [{ source_id: sourceId, quote }];
  return {
    title: "Purchase requests",
    summary: "Employees raise purchase requests that approvers approve.",
    actors: [
      {
        id: "employee",
        name: "Employee",
        evidence: evidence("Employees raise a purchase request"),
      },
      {
        id: "approver",
        name: "Approver",
        evidence: evidence("Approvers review pending requests"),
      },
      {
        id: "buyer",
        name: "Buyer",
        evidence: evidence("The buyer maintains the supplier register."),
      },
    ],
    entities: [
      {
        id: "supplier",
        name: "Supplier",
        display_field: "name",
        evidence: evidence("Suppliers are kept in a register"),
        fields: [
          {
            name: "name",
            type: "string",
            required: true,
            unique: true,
            evidence: evidence("a unique name"),
          },
        ],
      },
      {
        id: "purchase_request",
        name: "Purchase request",
        display_field: "title",
        evidence: evidence("Employees raise a purchase request"),
        fields: [
          {
            name: "title",
            type: "string",
            required: true,
            evidence: evidence("a title"),
          },
          {
            name: "amount",
            type: "decimal",
            required: true,
            evidence: evidence("an amount"),
          },
          {
            name: "supplier",
            type: "reference",
            references: "supplier",
            required: true,
            evidence: evidence("the supplier"),
          },
          {
            name: "status",
            type: "enum",
            enum_values: ["pending", "approved"],
            required: true,
            evidence: evidence("Each request starts in the pending status."),
          },
        ],
      },
    ],
    steps: [
      {
        id: "raise_request",
        name: "Raise a request",
        description: "An employee raises a purchase request.",
        actor_ids: ["employee"],
        operations: [
          { entity_id: "purchase_request", kind: "create" },
          { entity_id: "purchase_request", kind: "list" },
          { entity_id: "supplier", kind: "list" },
        ],
        evidence: evidence("Employees raise a purchase request"),
      },
      {
        id: "approve_request",
        name: "Approve",
        description: "An approver approves a pending request.",
        actor_ids: ["approver"],
        operations: [
          {
            entity_id: "purchase_request",
            kind: "transition",
            transition: { field: "status", from: ["pending"], to: "approved" },
          },
          { entity_id: "purchase_request", kind: "list" },
        ],
        evidence: evidence(
          "Approvers review pending requests and approve them.",
        ),
      },
      {
        id: "maintain_suppliers",
        name: "Maintain suppliers",
        description: "The buyer maintains the supplier register.",
        actor_ids: ["buyer"],
        operations: [
          { entity_id: "supplier", kind: "create" },
          { entity_id: "supplier", kind: "update" },
          { entity_id: "supplier", kind: "list" },
        ],
        evidence: evidence("The buyer maintains the supplier register."),
      },
    ],
    unknowns: [],
  };
};
