import { createFileRoute } from "@tanstack/react-router";
import SupplierRiskScorecard from "@/components/SupplierRiskScorecard";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Supplier Reliability Matrix" },
      {
        name: "description",
        content:
          "A procurement supplier risk scorecard: score delivery reliability, priority and sourcing structure, compare peers and track risk tiers over time.",
      },
      { property: "og:title", content: "Supplier Reliability Matrix" },
      {
        property: "og:description",
        content:
          "A procurement supplier risk scorecard: score delivery reliability, priority and sourcing structure, compare peers and track risk tiers over time.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://supplierreliabilitymatrix.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Supplier Reliability Matrix" },
    ],
    links: [{ rel: "canonical", href: "https://supplierreliabilitymatrix.lovable.app/" }],
  }),

});

function Index() {
  return <SupplierRiskScorecard />;
}
