# YaYa Eats — API (NestJS)

Backend REST API del sistema de delivery. Corre en el puerto `3002`.

---

## Requisitos

- Node.js 20+
- Docker Desktop
- PostgreSQL (via Docker)

---

## Desarrollo local

### 1. Variables de entorno

Copia el ejemplo y ajusta si es necesario:

```bash
cp .env.example .env
```

Valores clave para local:

```env
NODE_ENV=development
PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=delivery
DB_USER=arroyo
DB_PASSWORD=arroyo1234
```

### 2. Levantar la base de datos

```bash
# Desde la raiz del proyecto (donde esta docker-compose.yml)
docker compose up postgres -d
```

### 3. Correr el API

```bash
cd delivery_api
npm install
npm run start:dev
```

El API estara disponible en `http://localhost:3002/api`.

> **Nota:** En modo `development` las migraciones NO corren automaticamente.
> La base de datos se inicializa con `db/init.sql` al crear el contenedor de Postgres.

---

## Deploy a QA (yaya.work)

El servidor QA es `85.31.62.55`. El API corre en Docker en `/opt/yaya-eats/`.

### Proceso de deploy

```bash
# 1. Subir cambios al repositorio
git add .
git commit -m "descripcion del cambio"
git push origin master

# 2. Conectarse al servidor por SSH
ssh root@85.31.62.55

# 3. En el servidor: actualizar codigo
cd /opt/yaya-eats/delivery_api
git pull origin master
# 3.1 si ocurre un catch debido a conflictos:
git checkout -- src/app.module.ts
git pull origin master


# 4. Rebuild y reiniciar solo el contenedor del API
cd /opt/yaya-eats
docker compose build api
docker compose up -d api

# 5. Verificar logs
docker compose logs api --tail=50
```

### Verificar que funciona

```bash
curl https://yaya.work/api/api/health
```

### Variables de entorno en QA

El API lee las variables desde el archivo `.env` ubicado en `/opt/yaya-eats/delivery_api/.env` en el servidor.

#### Actualizar una variable (ej: RESEND_API_KEY)

```bash
# 1. Conectarse al servidor
ssh root@85.31.62.55

# 2. Editar el .env
nano /opt/yaya-eats/delivery_api/.env

# 3. Hacer el cambio (ej: pegar la nueva API key de Resend)
#    RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxx
#    Guardar: Ctrl+O → Enter → Ctrl+X

# 4. Reiniciar solo el contenedor del API (sin rebuild)
cd /opt/yaya-eats
docker compose up -d api

# 5. Verificar que arrancó sin errores
docker compose logs api --tail=30
```

> **Nota:** No hace falta rebuild (`docker compose build`) para cambios en `.env`.
> El rebuild solo es necesario cuando cambia el código fuente.

---

## Migraciones y Seeds

Las migraciones corren **automaticamente** al iniciar el contenedor en produccion (`NODE_ENV=production`).

### Comandos útiles

```bash
# Correr migraciones pendientes
npm run migrations:run

# Deshacer la última migración
npm run migrations:revert

# Correr seeds (reglas Casbin y datos iniciales)
npm run seeds:run

# Correr migraciones + seeds en un solo paso
npm run setup

# ⚠️  Resetear la DB completa y recargar todo desde cero
npm run schema:drop
npm run build
npm run setup

```

Para crear una nueva migracion:

```bash
npm run migrations:generate -- database/migrations/NombreMigracion
npm run build
```

---

## Ver logs del Docker

```bash
# Ver últimos logs
docker logs yaya-eats-api-1

# Ver logs en tiempo real
docker logs -f yaya-eats-api-1

# Ver últimas 50 líneas en tiempo real
docker logs -f --tail 50 yaya-eats-api-1

# Ver logs de una fecha específica
docker logs yaya-eats-api-1 | grep "2026-04-15"
```

---

## Troubleshooting

**Error de conexión a la base de datos en Docker**
- Verifica que `DB_HOST=postgres` en `.env` (no `localhost`)
- El contenedor Docker usa `postgres` como hostname, no `localhost`

**Error: EListen EADDRINUSE :::3002**
- El puerto 3002 ya está en uso
- Mata el proceso: `lsof -ti:3002 | xargs kill -9`

**Cambios en `.env` no se aplican**
- Reconstruir la imagen es necesario si cambió el código
- Solo cambios en `.env` → reiniciar sin rebuild: `docker compose up -d api`

---

## Estructura de puertos

| Entorno | URL |
|---------|-----|
| Local   | `http://localhost:3002/api` |
| QA      | `https://yaya.work/api` |

---

## Conectarse a la base de datos de QA

La base de datos no expone su puerto al exterior por seguridad. Se accede mediante un **tunel SSH**.

### Crear el tunel SSH

```bash
# En tu maquina local — abre el tunel en background
ssh -L 5433:localhost:5432 root@85.31.62.55 -N
```

Esto mapea el puerto `5433` de tu PC al `5432` del servidor.
Deja esa terminal abierta mientras trabajas.

### Conectarse con psql

```bash
psql -h localhost -p 5433 -U arroyo -d delivery
```

### Conectarse desde DBeaver / TablePlus / DataGrip

| Campo    | Valor        |
|----------|--------------|
| Host     | `localhost`  |
| Port     | `5433`       |
| Database | `delivery`   |
| User     | `arroyo`     |
| Password | `arroyo1234` |

### Desde el servidor directamente (sin tunel)

```bash
ssh root@85.31.62.55
cd /opt/yaya-eats
docker compose exec postgres psql -U arroyo -d delivery
```

---

## Consultas utiles en psql

```sql
-- Ver todas las tablas
\dt

-- Ver usuarios registrados
SELECT id, email, roles, created_at FROM users ORDER BY created_at DESC LIMIT 10;

-- Ver pedidos recientes
SELECT id, status, delivery_type, total, created_at FROM orders ORDER BY created_at DESC LIMIT 10;

-- Ver riders
SELECT id, user_id, status, created_at FROM riders ORDER BY created_at DESC;

-- Ver reglas de Casbin (permisos)
SELECT * FROM casbin_rule ORDER BY ptype, v0;

-- Ver migraciones ejecutadas
SELECT * FROM migrations ORDER BY timestamp DESC;

-- Salir de psql
\q
```
