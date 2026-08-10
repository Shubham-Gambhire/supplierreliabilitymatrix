import { createFileRoute } from "@tanstack/react-router";
import SupplierRiskScorecard from "@/components/SupplierRiskScorecard";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Supplier Reliability Matrix — Risk Scorecard" },
      {
        name: "description",
        content:
          "A procurement supplier risk scorecard: score delivery reliability, priority and sourcing structure, compare peers and track risk tiers over time.",
      },
      { property: "og:title", content: "Supplier Reliability Matrix — Risk Scorecard" },
      {
        property: "og:description",
        content:
          "Score supplier risk from thin procurement data: delivery counts, priority, sourcing structure and peer comparison.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Index() {
  return <SupplierRiskScorecard />;
}
