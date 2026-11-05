"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, Card, Kicker, PageTitle } from "@/components/ui";
import { NAV_GROUPS } from "@/components/nav";
import { clearToken } from "@/lib/api";

export default function Mas() {
  const router = useRouter();
  return (
    <>
      <PageTitle>Más</PageTitle>
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="mb-5">
          <Kicker>{g.label}</Kicker>
          <div className="space-y-2">
            {g.items.filter((i) => !i.action).map((i) => (
              <Link key={i.href} href={i.href} className="block">
                <Card className="!p-4"><p className="font-semibold">{i.label}</p></Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <Btn variant="secondary" className="mt-6 w-full" onClick={() => { clearToken(); router.replace("/login/"); }}>Cerrar sesión</Btn>
    </>
  );
}
