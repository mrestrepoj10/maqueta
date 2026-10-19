import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">maqueta</h1>
        <p className="text-muted-foreground">
          Public consultation sites for infrastructure projects. Real city context, design options
          side by side, in the browser.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button render={<Link href="/calle-72/maquette" />}>Actuación Estratégica Calle 72</Button>
        <Button variant="outline" render={<Link href="/chapinero/maquette" />}>
          Chapinero options demo
        </Button>
      </div>
    </main>
  );
}
