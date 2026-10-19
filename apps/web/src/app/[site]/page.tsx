import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteView } from "@/components/viewer/site-view";
import { loadSite } from "@/lib/site";

export async function generateStaticParams() {
  return [{ site: "chapinero" }, { site: "calle-72" }, { site: "fenicia" }];
}

export default function SitePage({ params }: PageProps<"/[site]">) {
  return (
    <Suspense fallback={<div className="h-dvh w-full bg-neutral-900" />}>
      <Site params={params} />
    </Suspense>
  );
}

async function Site({ params }: { params: PageProps<"/[site]">["params"] }) {
  const { site: slug } = await params;
  let site: Awaited<ReturnType<typeof loadSite>>;
  try {
    site = await loadSite(slug);
  } catch {
    notFound();
  }
  return <SiteView site={site} />;
}
