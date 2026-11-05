# Roadmap — Panel de Vida

Leyenda: ✅ hecho y probado · 🟡 parcial · ⬜ pendiente

| Fase | Contenido | Estado |
|---|---|---|
| 0 Arquitectura | docs, contrato API v1, agentes, ADRs | ✅ |
| 1 Modelo de datos y backend | doble partida, triggers, auth, 24 endpoints | ✅ |
| 2 Interfaz y dashboard | Next.js PWA, dashboard, navegación móvil | ✅ (recorrido E2E básico) |
| 3 Cuentas, ingresos, gastos | alta rápida, cuentas, categorías, conciliación, anulación | ✅ |
| 4 Tarjetas y deudas | ciclo corte/pago, MSI, pago mínimo estimado, préstamos, vencimientos | ✅ |
| 5 Presupuestos | mensual por categoría, gastado/restante | ✅ |
| 6 Flujo y proyecciones | devengado vs liquidez, proyección con obligaciones y ciclos de tarjeta | ✅ |
| 6b Importación | CSV de estados de cuenta con conciliación asistida | ✅ |
| 7 Pruebas y auditoría | 93 pruebas backend, 11 frontend, E2E en CI; 2 revisiones financieras y 1 de seguridad corregidas | ✅ |
| 8 Despliegue y documentación | en línea (Netlify + Render + Neon); Docker/compose y respaldo listos para Debian | ✅ (mudanza a Debian pendiente) |

## Siguiente iteración (prioridad)
1. Despliegue real (requiere al propietario; guía lista).
2. Notificaciones push de vencimientos.
3. Reglas de categorización automática para importación.
4. Multimoneda (USD) si hace falta.

Fuera de alcance hasta consolidar el núcleo financiero: CRM, hábitos, proyectos, asistentes de IA.
