# Flujo Git para desarrollo

Este proyecto esta pensado para trabajar asi:

```text
VS Code en tu Mac -> GitHub -> servidor de desarrollo -> intranet
```

## 1. Una sola vez en tu Mac

Crear el repositorio remoto en GitHub y conectarlo:

```bash
cd /Users/usuario/Documents/th/tecnica-hidraulica-erp
git remote add origin git@github.com:TU_USUARIO/tecnica-hidraulica-erp.git
git push -u origin main
```

## 2. Una sola vez en el servidor

Clonar el proyecto en la ruta de desarrollo:

```bash
sudo mkdir -p /var/www/desarrollo
sudo chown -R $USER:$USER /var/www/desarrollo
git clone git@github.com:TU_USUARIO/tecnica-hidraulica-erp.git /var/www/desarrollo/intranet
cd /var/www/desarrollo/intranet
cp .env.example .env
nano .env
npm ci
npm run db:init
npm run db:seed
```

Luego instalar el servicio:

```bash
sudo cp deploy/intranet.service.example /etc/systemd/system/intranet.service
sudo systemctl daemon-reload
sudo systemctl enable intranet
sudo systemctl start intranet
```

## 3. Cada vez que hagas cambios

En tu Mac:

```bash
cd /Users/usuario/Documents/th/tecnica-hidraulica-erp
npm run build
git status
git add .
git commit -m "Describe el cambio"
git push
```

En el servidor:

```bash
cd /var/www/desarrollo/intranet
bash deploy/update-development.sh
```

## 4. Opcion mas comoda

Cuando lo anterior ya este probado, se puede conectar GitHub Actions o un webhook para que cada `git push` a `main` ejecute automaticamente `deploy/update-development.sh` en el servidor.

Para esa automatizacion conviene crear primero un usuario de deploy con llave SSH limitada, y mantener `.env`, PostgreSQL y `uploads` solo en el servidor.
