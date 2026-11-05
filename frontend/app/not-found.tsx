import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-sm px-6 py-20 text-center">
      <h1 className="text-2xl font-bold">Página no encontrada</h1>
      <p className="mt-2 text-sm text-muted">La dirección no existe.</p>
      <Link href="/" className="mt-4 inline-block font-semibold text-ink underline">Ir al inicio</Link>
    </main>
  );
}
