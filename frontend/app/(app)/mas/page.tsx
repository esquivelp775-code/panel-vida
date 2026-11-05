"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, Card, PageTitle } from "@/components/ui";
import { clearToken } from "@/lib/api";

const ITEMS = [
  { href: "/cuentas/", t: "Cuentas", d: "Saldos, tarjetas y préstamos" },
  { href: "/deudas/", t: "Deudas y vencimientos", d: "Lo que debes y lo que viene" },
  { href: "/presupuestos/", t: "Presupuestos", d: "Gasto del mes por categoría" },
  { href: "/flujo/", t: "Flujo de efectivo", d: "Meses, proyección y categorías" },
  { href: "/importar/", t: "Importar estado de cuenta", d: "Carga un CSV del banco y clasifícalo" },
  { href: "/exportar/", t: "Exportar y respaldo", d: "CSV y copia completa JSON" },
];
export default function Mas() {
  const router = useRouter();
  return (
    <>
      <PageTitle>Más</PageTitle>
      <div className="space-y-2">
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} className="block">
            <Card><p className="font-semibold">{i.t}</p><p className="text-sm text-slate-500">{i.d}</p></Card>
          </Link>
        ))}
      </div>
      <Btn variant="secondary" className="mt-6 w-full" onClick={() => { clearToken(); router.replace("/login/"); }}>Cerrar sesión</Btn>
    </>
  );
}
