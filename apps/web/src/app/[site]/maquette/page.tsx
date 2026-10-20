import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MaquetteView } from "@/components/viewer/maquette-view";
import { loadParticipation } from "@/lib/participation";
import { loadSite } from "@/lib/site";

export async function generateStaticParams() {
  return [{ site: "chapinero" }, { site: "calle-72" }, { site: "fenicia" }];
}

export default function MaquettePage({ params }: PageProps<"/[site]/maquette">) {
  return (
    <Suspense fallback={<div className="h-dvh w-full bg-[#f3f2ee]" />}>
      <Site params={params} />
    </Suspense>
  );
}

async function Site({ params }: { params: PageProps<"/[site]/maquette">["params"] }) {
  const { site: slug } = await params;
  let site: Awaited<ReturnType<typeof loadSite>>;
  try {
    site = await loadSite(slug);
  } catch {
    notFound();
  }
  const participation = await loadParticipation(slug);
  return <MaquetteView site={site} participation={participation} />;
}
