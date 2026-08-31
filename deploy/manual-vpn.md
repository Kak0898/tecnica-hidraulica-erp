# Manual de uso VPN

Este manual explica como agregar, revisar y eliminar dispositivos autorizados para entrar a la red privada de la empresa.

## Objetivo

La VPN permite que un computador, notebook o celular autorizado pueda conectarse de forma segura a los servicios internos de la empresa, por ejemplo:

- ERP / intranet
- servidor de desarrollo
- carpetas o servicios internos
- base de datos, si aplica

Solo deben quedar activos los dispositivos realmente usados por personas autorizadas.

## Datos que se deben registrar por cada dispositivo

Antes de agregar un dispositivo, anota estos datos:

| Dato | Ejemplo |
| --- | --- |
| Usuario responsable | Franco Dareck |
| Correo | usuario@empresa.cl |
| Tipo de dispositivo | MacBook, iMac, iPhone, Android, Windows |
| Nombre del equipo | MacBook-Franco |
| Fecha de alta | 31-08-2026 |
| Motivo | Acceso a ERP / soporte / administracion |

Recomendacion: usa nombres claros. Evita nombres genericos como `MacBook Pro` o `PC`.

## Agregar un dispositivo

1. Entrar al panel administrador de la VPN.
2. Ir a la seccion de dispositivos, equipos, clientes o usuarios.
3. Crear una nueva invitacion o nuevo dispositivo.
4. Asignar el dispositivo al usuario responsable.
5. Instalar la aplicacion VPN en el equipo nuevo.
6. Iniciar sesion o cargar la configuracion entregada por el administrador.
7. Confirmar que el dispositivo aparece como conectado en el panel.
8. Probar acceso al ERP o servidor interno.

Prueba basica desde Mac o Windows:

```bash
ping IP_DEL_SERVIDOR
```

Prueba de acceso web:

```bash
http://IP_DEL_SERVIDOR:3001
```

Si el ERP carga, el dispositivo quedo correctamente conectado.

## Eliminar un dispositivo

Elimina un dispositivo cuando:

- el trabajador deja la empresa
- se pierde o vende el equipo
- se cambia el computador o celular
- el equipo ya no necesita acceso
- existe sospecha de acceso no autorizado

Pasos:

1. Entrar al panel administrador de la VPN.
2. Buscar el dispositivo por nombre o usuario.
3. Confirmar que corresponde al equipo correcto.
4. Revocar, eliminar o desautorizar el dispositivo.
5. Guardar el cambio.
6. Confirmar que el dispositivo ya no aparece como conectado.
7. Registrar la baja con fecha y motivo.

Despues de eliminarlo, ese equipo no deberia poder entrar al ERP ni al servidor interno.

## Reglas de seguridad

- No compartir usuarios ni claves de VPN.
- Cada persona debe tener su propio acceso.
- Si un equipo se pierde, eliminarlo inmediatamente.
- Revisar la lista de dispositivos activos al menos una vez al mes.
- Mantener nombres claros para identificar a quien pertenece cada equipo.
- No dejar dispositivos antiguos "por si acaso".
- Si alguien externo necesita acceso temporal, poner fecha de vencimiento o eliminarlo al terminar el trabajo.

## Checklist mensual

Una vez al mes, revisar:

- dispositivos conectados actualmente
- dispositivos que no se conectan hace mucho tiempo
- usuarios que ya no trabajan en la empresa
- computadores antiguos o reemplazados
- accesos temporales de proveedores

Resultado esperado:

- solo quedan equipos autorizados
- cada equipo tiene responsable claro
- no hay accesos desconocidos

## Formato de registro

Puedes llevar este control en una planilla:

| Estado | Usuario | Correo | Dispositivo | Nombre VPN | Fecha alta | Fecha baja | Motivo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Activo | Franco Dareck | franco@empresa.cl | MacBook | MacBook-Franco | 31-08-2026 | - | ERP |
| Eliminado | Proveedor externo | soporte@proveedor.cl | Windows | PC-Soporte | 01-08-2026 | 15-08-2026 | Acceso temporal terminado |

## Si no conecta

Revisar en este orden:

1. El dispositivo aparece activo en el panel VPN.
2. La aplicacion VPN esta encendida.
3. El usuario inicio sesion con la cuenta correcta.
4. Hay internet en el equipo.
5. La IP del servidor responde.
6. El servicio del ERP esta levantado.

Comando para probar el servidor:

```bash
ping IP_DEL_SERVIDOR
```

Comando para probar el ERP:

```bash
curl http://IP_DEL_SERVIDOR:3001/api/health
```

Si responde `ok: true`, el ERP esta funcionando.

## Notas para completar

Completar estos datos cuando se confirme el proveedor de VPN:

| Dato | Valor |
| --- | --- |
| Proveedor VPN | Pendiente |
| URL panel administrador | Pendiente |
| Usuario administrador | Pendiente |
| IP servidor ERP | Pendiente |
| Responsable interno | Pendiente |

