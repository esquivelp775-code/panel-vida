# Roadmap — Panel de Vida

Leyenda: ✅ hecho y probado · 🟡 parcial · ⬜ pendiente

| Fase | Contenido | Estado |
|---|---|---|
| 0 Arquitectura | docs, contrato API v1, agentes, ADRs | ✅ |
| 1 Modelo de datos y backend | doble partida, triggers, auth, 24 endpoints | ✅ |
| 2 Interfaz y dashboard | Next.js PWA, dashboard, navegación móvil | ✅ (recorrido E2E básico) |
| 3 Cuentas, ingresos, gastos | alta rápida, cuentas, categorías, conciliación, anulación | ✅ |
| 4 Tarjetas y deudas | ciclo corte/pago, MSI, préstamos capital/interés, vencimientos | ✅ (sin pago mínimo) |
| 5 Presupuestos | mensual por categoría, gastado/restante | ✅ |
| 6 Flujo y proyecciones | devengado vs liquidez, proyección por obligaciones | ✅ |
| 7 Pruebas y auditoría | 67 pruebas backend, 9 frontend, E2E en CI; revisiones corregidas | ✅ (pendientes menores F12, F15, F16) |
| 8 Despliegue y documentación | Docker y compose probados en CI, respaldo verificado; docs | 🟡 (falta servidor real) |

## Siguiente iteración (prioridad)
1. Despliegue real (requiere infraestructura del propietario).
2. Pago mínimo e intereses de tarjeta; proyección multi-ciclo de tarjetas.
3. Importación CSV de estados de cuenta con conciliación asistida.
4. Respaldo automático cifrado; notificaciones push de vencimientos.
5. Hallazgos menores F12, F15; `npm audit`; hashes de pip.

Fuera de alcance hasta consolidar el núcleo financiero: CRM, hábitos, proyectos, asistentes de IA.
