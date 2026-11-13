# Panel de la agencia

Panel interno para administrar **leads, clientes, proyectos y borradores** de la
agencia. SPA estática (HTML + CSS + JS, sin build) con Supabase Auth y RLS.

**Producción:** https://joaquinr0jas.github.io/agencia-panel/

## Acceso

El panel es privado: no hay registro público. Cada persona entra con el email y
contraseña que un administrador creó en Supabase Auth, y solo ve datos si tiene
una fila **activa** en la tabla `perfiles`.

## Funciones

- Login y logout con email/contraseña.
- Resumen con leads por estado, borradores pendientes, clientes, proyectos y
  pipeline abierto.
- Leads con búsqueda, filtros por estado y score, detalle de contacto, cuerpo
  del borrador, link de maqueta y aprobación de borradores.
- Aprobar un borrador actualiza `leads.estado` e `interacciones.estado` en una
  sola transacción. **No envía correos.**
- CRUD de clientes y proyectos (montos, fechas, repo y demo).
- Página de equipo con perfiles y roles.
- **Centro de control** y **Abrir OpenBot** en el encabezado: abren el centro
  local (`http://127.0.0.1:8787/`) y lanzan o enfocan OpenBot.
- **Correr sistema**: dispara `corrida` + `seguimiento` en el orquestador local.
- Enlaces directos al proyecto de Supabase.

## Centro de control local

Con el orquestador del repo de captación corriendo (`npm run orquestador`), el
encabezado ofrece **Centro de control**, **Abrir OpenBot** y **Correr sistema**.
La página `http://127.0.0.1:8787/` reúne las cuatro tarjetas: correr sistema,
abrir OpenBot, abrir panel y equipo (bandeja por rol + formulario de tareas).
El envío de correos sigue siendo manual: el orquestador nunca ejecuta `enviar`.

## Seguridad

- La `anon key` incluida en `config.js` es pública por diseño.
- Todas las tablas tienen RLS; sin sesión con perfil activo no se devuelve nada.
- La `service_role key` nunca se usa en el navegador.
- `leads`, `interacciones` y `eventos` son de solo lectura/actualización para el
  panel; no se pueden insertar ni borrar desde aquí.
- El panel no envía correos ni modifica la lógica de captación.
- Chrome puede pedir permiso para acceder a la red local o bloquear la llamada
  directa desde la página pública. En ese caso usa **Centro de control**: la
  página local abre en una pestaña y desde ahí los botones funcionan sin esa
  restricción.

## Estructura

```
index.html    shell y login
styles.css    diseño responsive
app.js        vistas y llamadas a Supabase
config.js     URL del proyecto + anon key públicas
favicon.svg
```

La migración que crea `perfiles`, `clientes`, `proyectos`, políticas RLS y la
función `aprobar_borrador` vive en el repositorio privado de la agencia
(`db/migrations/006_panel.sql`).

## Agregar a un socio

1. Crear el usuario en **Supabase → Authentication → Users** (marcar *Auto
   Confirm User*).
2. Copiar su UUID e insertar la fila en `perfiles`:

```sql
insert into public.perfiles (user_id, nombre, rol)
values ('<uuid>', 'Nombre', 'socio');
```

Roles: `admin` (gestiona equipo y operación), `socio` y `operador` (operación).
Para revocar acceso: `activo = false`.

## Desarrollo local

```bash
python -m http.server 8080
# abrir http://localhost:8080
```

No requiere variables de entorno ni build. GitHub Pages publica `main` en la
raíz.
