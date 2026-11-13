# Panel de la agencia

SPA estática (HTML + CSS + JS, sin build) para que el equipo administre leads,
clientes, proyectos y borradores de correo. Usa Supabase Auth (email/contraseña)
y la `anon key` pública; toda la autorización vive en RLS.

**Producción:** https://joaquinr0jas.github.io/agencia-panel/

## Qué incluye

- **Login** con email y contraseña. Sin fila activa en `perfiles` no se ve nada.
- **Resumen** con conteos de leads por estado, borradores pendientes, clientes,
  proyectos y pipeline abierto.
- **Leads** con búsqueda, filtros por estado/score, detalle del lead, cuerpo del
  borrador, link de maqueta y aprobación de borradores (no envía correos).
- **Clientes**: alta, edición y eliminación.
- **Proyectos**: alta, edición, montos, fechas, repo, demo y ruta local.
- **Detalle de proyecto**: últimos commits del repo local, resumen con IA y
  traspaso del proyecto entre socios (**Dejar proyecto** / **Retomar**).
- **Mensajes**: bandeja interna entre socios, con envío a todos o a una persona
  y aviso de no leídos en la barra superior.
- **Equipo**: directorio de perfiles y roles.
- **Centro de control** y **Abrir OpenBot**: botones del encabezado que abren la
  página local de control y lanzan/enfocan OpenBot.
- **Correr sistema**: botón en el encabezado que dispara la pipeline local
  (`corrida` + `seguimiento`) contra el orquestador de `127.0.0.1:8787`.
- Enlaces directos al proyecto de Supabase.

## Centro de control y botones del encabezado

El encabezado tiene tres botones que hablan con el orquestador local
(`http://127.0.0.1:8787`):

- **Centro de control**: abre la página local con todas las tarjetas (correr
  sistema, abrir OpenBot, abrir panel y equipo). Es la forma recomendada de
  operar sin escribir comandos.
- **Abrir OpenBot**: `POST /abrir-openbot`. Si OpenBot está cerrado lo lanza; si
  ya está abierto, intenta traer su ventana al frente. No duplica procesos.
- **Correr sistema**: `POST /correr?esperar=0` y después consulta `/estado` cada
  2 segundos hasta que la corrida termina. Muestra "corriendo…", el paso en
  curso y al final el resumen con el log completo. **No envía correos.**

El orquestador vive en el repo de captación (`src/scripts/orquestador.js`). Para
levantarlo:

```bash
cd C:\Users\juako\Trabajo\agencia
npm run orquestador
```

Sin él, los botones muestran el aviso _"Abre el centro de control con
`npm run orquestador`"_. También puedes abrir `http://127.0.0.1:8787/`
directamente.

- El orquestador **nunca ejecuta `enviar`**: el envío de correos sigue siendo
  manual y con revisión.
- La URL se configura en `config.js` (`ORQUESTADOR_URL`).
- El servidor solo escucha en loopback y acepta CORS desde este panel y desde
  `localhost`. Los navegadores tratan `http://127.0.0.1` como origen seguro, así
  que una página HTTPS puede llamarlo; si alguno lo bloquea, usa la página de
  control directa.
- Chrome puede pedir permiso para acceder a la red local o bloquear la llamada
  directa desde la página pública. En ese caso usa **Centro de control**: la
  página local abre en una pestaña y desde ahí los botones funcionan sin esa
  restricción.
- La tarjeta **Equipo** del centro de control lee y escribe `mensajes_equipo`
  con la `service_role` key **solo en el PC local**. Esa clave nunca llega al
  navegador ni a este repo.

### Uso paso a paso del centro de control

1. Si el PC se reinició, haz doble clic en **Centro de control** del
   escritorio (o en `centro-de-control.cmd`, en la raíz del repo): levanta el
   servidor si hace falta y abre la página. También puedes pulsar **Centro de
   control** en el panel.
2. Para operar: **Correr sistema** y espera el resumen.
3. Para OpenBot: **Abrir OpenBot**.
4. Para el equipo: elige la bandeja del rol, revisa los mensajes y usa
   **Marcar hecho**; para crear una tarea completa de / para / asunto / cuerpo y
   pulsa **Enviar tarea**.

## Mensajes entre socios

El botón **✉ Mensajes** de la barra superior abre la bandeja interna. El número
sobre el botón son los mensajes sin leer de ese usuario.

1. Pulsa **Mensajes**. La pestaña **Bandeja** muestra autor, asunto, extracto,
   fecha y la marca **Nuevo**.
2. Haz clic en un mensaje para leerlo completo. Al abrirlo se marca como leído.
3. Para escribir, entra a **Escribir**, elige **Todos los socios** o una persona,
   escribe asunto y mensaje, y pulsa **Enviar mensaje**.
4. La bandeja se refresca cada 60 segundos; también puedes cerrar y volver a
   abrir el modal.

Los mensajes viven en `mensajes_socios` (personas). **No** se usa
`mensajes_equipo`, que es el buzón de los agentes del orquestador.

## Detalle de proyecto, cambios y relevo

En **Proyectos**, haz clic en el nombre de un proyecto (no en «Editar»). Se abre
el detalle con dos pestañas.

### Últimos cambios

- Lee los commits del repo local con `GET /git?ruta=<ruta>&limite=15` y muestra
  rama, si hay cambios sin commitear y los últimos commits.
- **Resumir con IA** llama a `POST /resumir` y muestra el resumen del proyecto.
- Si el orquestador no está arriba, aparece un aviso claro y el resto del panel
  sigue funcionando.

### Ruta local

La ruta del proyecto puede ser distinta en cada PC:

1. El valor por defecto es `proyectos.ruta_local` (se edita en **Editar
   proyecto**).
2. En el detalle puedes escribir otra ruta y pulsar **Usar esta ruta**. Se
   guarda solo en ese navegador (`localStorage`, una clave por id de proyecto).
3. El panel valida que sea una ruta absoluta antes de llamar al orquestador; el
   orquestador comprueba que exista y que sea un repo git.
4. Si no hay ruta, el detalle lo avisa y permite configurarla sin salir.

### Relevo

1. Pestaña **Relevo**: muestra el último traspaso, su historial y los botones
   **Dejar proyecto** y **Retomar**.
2. **Dejar proyecto** abre el formulario de estado, qué hice, qué falta,
   decisiones y siguiente paso.
3. **Generar borrador** (`POST /relevo/borrador`) rellena el formulario con el
   estado del repo. Puedes editarlo antes de guardar.
4. **Guardar relevo** inserta la fila en `relevos` y llama a
   `POST /relevo/archivo` para escribir `RELEVO.md` en la ruta local.
5. Si el orquestador está caído o falta la ruta, **el relevo se guarda igual en
   Supabase** y el panel avisa que no pudo escribir `RELEVO.md`.
6. **Retomar** abre un texto copiable con estado, pendientes, decisiones,
   siguiente paso, rama y commit, e indica leer `RELEVO.md` y `docs/relevos/`.

## Estructura

```
panel/
  index.html    shell de la app y pantalla de login
  styles.css    diseño responsive
  app.js        lógica, vistas y llamadas a Supabase
  config.js     URL del proyecto + anon key (públicas)
  favicon.svg
db/migrations/
  006_panel.sql tablas perfiles/clientes/proyectos, RLS, triggers y RPC
  009_socios_relevos.sql mensajes_socios, relevos y proyectos.ruta_local
```

## Aplicar la migración 009

La migración `db/migrations/009_socios_relevos.sql` crea `mensajes_socios`,
`relevos`, agrega `proyectos.ruta_local` y sus políticas RLS. Se aplica una sola
vez en Supabase con un token de administración (nunca desde el navegador):

```bash
# PowerShell
$env:SUPABASE_ACCESS_TOKEN="<token>"   # no se guarda en el repo
node scripts/aplicar-sql.js zeoftiimvtppnakozlky db/migrations/009_socios_relevos.sql
```

Verifica en **Table Editor** que existen `mensajes_socios` y `relevos`, y que
`proyectos` tiene la columna `ruta_local`. La `service_role` key no se usa en el
panel: solo sirve para tareas administrativas locales.

## Agregar a un socio

1. En Supabase, abre **Authentication → Users** y crea el usuario con email y
   contraseña. Marca **Auto Confirm User** para que pueda entrar de inmediato.
2. Copia el **UUID** del usuario.
3. Inserta su perfil (SQL Editor o Table Editor → `perfiles`):

```sql
insert into public.perfiles (user_id, nombre, rol)
values ('<uuid-del-usuario>', 'Nombre del socio', 'socio');
```

Roles disponibles:

- `admin`: todo lo operativo + crear/editar/desactivar perfiles.
- `socio`: gestiona leads, clientes y proyectos.
- `operador`: igual que socio, pensado para apoyo operativo.

Para quitar el acceso, pon `activo = false` en su fila de `perfiles` (o bórrala).
El usuario podrá autenticarse, pero RLS no le devolverá ninguna fila y el panel
lo expulsará.

## Aprobación de borradores

El botón **Aprobar borrador** llama a la función `aprobar_borrador`, que en una
sola transacción pone `leads.estado = 'aprobado'` e `interacciones.estado =
'aprobado'` (con `aprobado_por`). **No envía correos**: el envío sigue siendo
responsabilidad del servicio de captación (`npm run enviar`).

## Seguridad

- La `anon key` es pública por diseño; no da acceso sin una sesión con perfil
  activo porque todas las tablas tienen RLS.
- La `service_role key` **nunca** debe llegar al navegador ni a este repo.
- Las tablas de captación (`leads`, `interacciones`, `eventos`) solo permiten
  `select` y `update` a miembros activos; no hay `insert`/`delete` desde el panel.
- `supresiones` es solo lectura para el panel.
- El panel no envía correos ni toca `DRY_RUN`.

## Desarrollo local

```bash
# desde la raíz del repo
npx serve panel
# o
python -m http.server 8080 --directory panel
```

Abre `http://localhost:8080`. No requiere variables de entorno: `config.js`
contiene la URL y la anon key públicas.

## Despliegue

El repositorio público `JoaquinR0jas/agencia-panel` publica la carpeta `panel/`
en la raíz de `main` con GitHub Pages. Para actualizar:

```bash
# copiar panel/ a la raíz del repo público y push a main
```

No se necesita build ni Actions.
