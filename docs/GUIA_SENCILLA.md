# Guía sencilla: poner Panel de Vida en línea (temporal) y mudarlo después a tu servidor

Esta guía es para ti, no para programadores. Se puede seguir desde el teléfono, aunque en computadora
es más cómodo. Tiempo estimado: 30–45 minutos la primera vez.

## La idea en una línea
La app tiene 3 piezas: **pantalla** (Netlify), **cajero** que aplica las reglas (Render) y **bóveda**
donde se guarda tu información (Neon). Las tres se conectan copiando y pegando 3 datos.

```
 Tu teléfono ──► Netlify (pantalla) ──► Render (API) ──► Neon (base de datos)
```

Orden importante: **Neon → Netlify → Render → otra vez Netlify**. Así cada pieza ya tiene el dato que necesita.

---

## Paso 1 · Neon (la bóveda) — 5 min
1. Entra a **neon.tech** → *Sign up* (puedes usar tu cuenta de GitHub).
2. Crea un proyecto: nombre `panel-vida`, versión de Postgres **16**, región **AWS US East 2 (Ohio)**.
3. Al terminar verás un recuadro **Connection string**. Desactiva la opción **Connection pooling**
   (o "Pooled connection") y copia el enlace completo. Se ve así:
   `postgresql://usuario:CONTRASEÑA@ep-algo-123.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Guárdalo en tu gestor de contraseñas como **"Neon – enlace de conexión"**. Es la llave de la bóveda:
   no lo mandes por chat ni lo compartas.

## Paso 2 · Netlify (la pantalla) — 5 min
Ya tienes cuenta.
1. *Add new site* → *Import an existing project* → **GitHub** → elige `panel-vida`.
2. **Branch to deploy:** `claude/panel-vida-autonomous-mission-zb4856`.
   No cambies nada más: el archivo `netlify.toml` ya le dice a Netlify qué hacer.
3. *Deploy*. Va a publicarse una pantalla que todavía no puede conectarse; es normal.
4. *Site configuration → Change site name*: ponle algo como `panel-vida-tunombre`.
   Anota la dirección: **`https://panel-vida-tunombre.netlify.app`** (la llamaremos *dirección de Netlify*).

## Paso 3 · Render (el cajero) — 10 min
1. Entra a **render.com** → *Get started* con tu cuenta de GitHub, y dale acceso al repositorio `panel-vida`.
2. *New* → **Blueprint** → elige `panel-vida`. Render lee el archivo `render.yaml` y te pide 4 datos:

   | Campo | Qué pegar |
   |---|---|
   | `PANEL_DATABASE_URL` | el enlace de Neon del paso 1 (tal cual) |
   | `PANEL_CORS_ORIGINS` | tu *dirección de Netlify* (ej. `https://panel-vida-tunombre.netlify.app`, sin `/` al final) |
   | `PANEL_BOOTSTRAP_EMAIL` | el correo con el que entrarás a la app |
   | `PANEL_BOOTSTRAP_PASSWORD` | la contraseña para entrar (mínimo 10 caracteres; guárdala en tu gestor) |

   El "secreto" de la app lo genera Render solo; no tienes que inventarlo.
3. *Apply*. Tarda unos 5 minutos la primera vez. Cuando diga **Live**, copia la dirección de arriba,
   algo como **`https://panel-vida-api.onrender.com`** (la *dirección de Render*).
4. Prueba: abre en el navegador `https://panel-vida-api.onrender.com/api/v1/health`.
   Debe decir `{"status":"ok"}`.

## Paso 4 · Conectar la pantalla con el cajero — 3 min
1. En Netlify: *Site configuration → Environment variables → Add a variable*:
   - Key: `NEXT_PUBLIC_API_URL`
   - Value: tu *dirección de Render* (ej. `https://panel-vida-api.onrender.com`, sin `/` al final)
2. *Deploys → Trigger deploy → Deploy site* (para que tome el dato nuevo).

## Paso 5 · Entrar y dejarlo seguro — 2 min
1. Abre tu *dirección de Netlify* en el teléfono y entra con el correo y contraseña del paso 3.
   - Si tarda ~1 minuto la primera vez: Render gratuito "se duerme" cuando no se usa y está despertando.
2. Menú del navegador → **"Agregar a la pantalla de inicio"**: queda como una app.
3. En Render → tu servicio → *Environment*: **borra** `PANEL_BOOTSTRAP_PASSWORD` y guarda.
   (Tu usuario ya existe; ese dato ya no hace falta y es mejor no dejarlo ahí.)

Listo: ya puedes registrar movimientos reales.

---

## Cómo empezar a cargar tu información
1. **Cuentas:** en *Cuentas* crea tu débito, efectivo, ahorro y tarjetas (con día de corte y de pago) con el
   saldo de hoy. Crea también tus categorías de gasto e ingreso.
2. **Estados de cuenta:** en *Más → Importar estado de cuenta* sube el CSV de tu banco. La app te muestra
   todo antes de guardar, detecta duplicados y no importa dos veces el mismo archivo.
3. **Desde Obsidian (u otra conversación):** pide que te genere un CSV con este formato y súbelo en *Importar*:
   ```
   Fecha,Concepto,Monto
   03/11/2026,Comida en la calle,-185.50
   04/11/2026,Pago de nómina,15000.00
   ```
   Negativo = salida de dinero, positivo = entrada (en tarjetas es al revés: los cargos son positivos;
   la app ya lo sabe). Fechas día/mes/año y punto decimal.

## Tu seguro mientras tanto (1 minuto a la semana)
*Más → Exportar → Respaldo completo (JSON)*. Guarda el archivo en tu nube o computadora.
Es una copia de todo, independiente de Neon y de Render.

---

## Cuando tu servidor esté listo: la mudanza (≈ 1 hora, sin perder nada)
Resumen: copias la bóveda de Neon a tu servidor, compruebas que cuadra y cambias la dirección.
Nada se borra de Neon hasta que tú lo decidas.

1. En el servidor prepara todo como dice `docs/DEPLOYMENT.md` → "Paso común" y levanta sólo la base:
   `sudo docker compose up -d db`
2. Copia la bóveda desde Neon (pega tu enlace de Neon entre comillas):
   ```bash
   sudo docker compose exec -T db pg_dump -Fc "postgresql://usuario:CONTRASEÑA@ep-...neon.tech/neondb?sslmode=require" > neon.dump
   sudo docker compose exec -T db pg_restore -U panel -d panel_vida --no-owner --no-privileges --clean --if-exists < neon.dump
   ```
3. Levanta el resto: `sudo docker compose up -d --build`
4. Comprueba: entra a la app del servidor; los saldos deben ser idénticos a los de Netlify/Render, y
   `…/api/v1/reports/integrity` debe decir `"ok": true`.
5. Cambia la dirección: o usas la app del servidor (opción Tailscale, la más privada), o en Netlify cambias
   `NEXT_PUBLIC_API_URL` a la dirección de tu servidor y vuelves a desplegar.
6. Activa el respaldo diario cifrado (`docs/DEPLOYMENT.md` → "Respaldo diario cifrado").
7. Deja Neon y Render unas semanas sin usar como plan B; después puedes borrarlos.

## Preguntas rápidas
- **¿Cuesta?** Netlify, Render y Neon tienen plan gratuito suficiente para esto. Revisa las condiciones al
  crear las cuentas; no actives nada de pago.
- **¿Es seguro?** Todo viaja cifrado (HTTPS), la contraseña se guarda cifrada y sólo tu usuario entra.
  Tu información vive en Neon mientras tanto; en tu servidor quedará en tu casa.
- **¿Y si algo falla?** Nada se borra: la app no permite borrar movimientos (sólo anularlos) y tienes tu
  respaldo semanal. Para la mudanza, el original sigue en Neon hasta que confirmes.
- **¿Cuánta RAM necesita el servidor?** La app usa menos de 1 GB. Con 8 GB va bien; 16 GB sobra.
  Lo importante del disco viejo es guardar los respaldos **fuera** de ese disco (USB o nube).
