# Roadmap — Panel de Vida

Leyenda: ✅ hecho y probado · 🟡 parcial · ⬜ pendiente

| Fase | Contenido | Estado |
|---|---|---|
| 0 Arquitectura | docs, contrato API v1, agentes, ADRs | ✅ |
| 1 Modelo de datos y backend | doble partida, triggers, auth, 24 endpoints | ✅ |
| 2 Interfaz y dashboard | Next.js PWA, dashboard, navegación móvil | ✅ (recorrido E2E básico) |
| 3 Cuentas, ingresos, gastos | alta rápida, cuentas, categorías, conciliación, anulación | ✅ |
| 4 Tarjetas y deudas | ciclo corte/pago, préstamos capital/interés, vencimientos | ✅ (sin MSI ni pago mínimo) |
| 5 Presupuestos | mensual por categoría, gastado/restante | ✅ |
| 6 Flujo y proyecciones | devengado vs liquidez, proyección por obligaciones | ✅ |
| 7 Pruebas y auditoría | 47 pruebas backend, revisión financiera, revisión de seguridad | 🟡 |
| 8 Despliegue y documentación | Docker, compose, CI, Netlify; docs | 🟡 (no desplegado) |

## Siguiente iteración (prioridad)
1. Corregir hallazgos de la revisión financiera (ver PROGRESS.md).
2. CSP estricta en Netlify/nginx; revisar `npm audit`.
3. Pruebas E2E automatizadas con Playwright en CI.
4. Edición de operaciones (anular + recrear en un paso) y de obligaciones/cuentas desde la UI.
5. Meses sin intereses (MSI): compra a plazos que genera obligaciones mensuales.
6. Pago mínimo e intereses de tarjeta; recordatorios (notificaciones push de la PWA).
7. Importación CSV de estados de cuenta con conciliación asistida.
8. Respaldo automático cifrado.

Fuera de alcance hasta consolidar el núcleo financiero: CRM, hábitos, proyectos, asistentes de IA.
