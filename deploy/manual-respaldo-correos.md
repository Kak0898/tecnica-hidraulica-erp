# Manual de respaldo de correos

Este manual sirve para respaldar correos de cuentas de `tecnicahidraulica.cl` u otras cuentas de empresa.

## Idea principal

No todos los programas generan el mismo tipo de archivo:

- Outlook en Windows exporta normalmente `.pst`.
- Outlook en Mac exporta normalmente `.olm`.
- Mail de macOS exporta buzones como `.mbox`.

Si el correo esta configurado como IMAP, el correo vive principalmente en el servidor del proveedor/cPanel. El respaldo local sirve como copia historica por seguridad.

## Frecuencia recomendada

- Correos administrativos o ventas: respaldo mensual.
- Correos criticos o gerencia: respaldo semanal o quincenal.
- Antes de cambiar proveedor, clave, dominio, hosting o computador: respaldo inmediato.

## Estructura de carpetas recomendada

Guardar los respaldos en una carpeta externa al computador principal, idealmente disco externo o NAS.

Formato sugerido:

```text
Respaldos Correos/
  2026/
    2026-09/
      francodareck@tecnicahidraulica.cl/
        2026-09-01-francodareck-outlook.pst
        2026-09-01-francodareck-apple-mail.mbox
      secretaria@tecnicahidraulica.cl/
        2026-09-01-secretaria-outlook.pst
```

Usar nombres con fecha al inicio para ordenar facil:

```text
AAAA-MM-DD-correo-origen.ext
```

Ejemplo:

```text
2026-09-01-francodareck-tecnicahidraulica-apple-mail.mbox
```

## Outlook en Windows: exportar PST

1. Abrir Outlook.
2. Ir a `Archivo`.
3. Entrar a `Abrir y exportar`.
4. Seleccionar `Importar o exportar`.
5. Elegir `Exportar a un archivo`.
6. Elegir `Archivo de datos de Outlook (.pst)`.
7. Seleccionar la cuenta o buzones a respaldar.
8. Marcar `Incluir subcarpetas`.
9. Elegir la carpeta de destino del respaldo.
10. Finalizar y esperar a que termine.

Despues de exportar, revisar que el archivo `.pst` exista y pese mas que 0 KB.

## Outlook en Mac: exportar OLM

1. Abrir Outlook.
2. Ir a `Herramientas`.
3. Elegir `Exportar`.
4. Seleccionar los elementos a respaldar, especialmente `Correo`.
5. Continuar y elegir donde guardar el archivo.
6. Outlook generara un archivo `.olm`.

Nota: Outlook para Mac no siempre exporta directamente a `.pst`. El formato normal en Mac es `.olm`.

## Mail de macOS: exportar MBOX

Este caso aplica si se usa la app Mail de Apple.

1. Abrir Mail.
2. En la barra lateral, seleccionar el buzon o carpeta que se quiere respaldar.
3. Ir a `Buzon`.
4. Seleccionar `Exportar buzon`.
5. Elegir la carpeta donde guardar el respaldo.
6. Mail creara una carpeta con formato `.mbox`.

Para respaldar todo, repetir con las carpetas importantes:

- Entrada
- Enviados
- Archivados
- Clientes
- Cotizaciones
- Carpetas personalizadas

## cPanel / Webmail

Si el proveedor usa cPanel, normalmente el correo esta guardado en el servidor. Las opciones dependen del proveedor:

- Descargar correos desde Webmail si la opcion esta disponible.
- Usar Outlook o Mail con IMAP y exportar desde el computador.
- Pedir al proveedor una copia del directorio de correos de la cuenta.
- Pedir respaldo completo de la cuenta de hosting si se va a migrar.

Si el firewall del proveedor bloquea la IP, primero deben desbloquear la IP o permitir acceso temporal.

## Como comprobar que el respaldo sirve

No basta con guardar el archivo. Hay que probarlo.

1. Crear una carpeta de prueba.
2. Importar el `.pst`, `.olm` o `.mbox` en un equipo de prueba o perfil separado.
3. Revisar que se vean:
   - Correos recibidos.
   - Correos enviados.
   - Adjuntos.
   - Carpetas.
   - Fechas correctas.
4. Confirmar que el archivo no esta corrupto.

## Politica recomendada de copias

Mantener al menos tres copias:

1. Una copia en el computador o servidor local.
2. Una copia en disco externo.
3. Una copia fuera del lugar fisico, por ejemplo nube privada, Drive empresarial o disco guardado aparte.

No guardar respaldos de correo solo en el mismo computador que se esta respaldando.

## Seguridad

Los respaldos de correo pueden contener datos sensibles:

- Clientes.
- Facturas.
- Claves enviadas por correo.
- Datos bancarios.
- Cotizaciones.
- Documentos legales.

Recomendaciones:

- Proteger el disco externo con clave.
- No compartir archivos `.pst`, `.olm` o `.mbox` por WhatsApp.
- Si se suben a nube, usar una cuenta empresarial.
- Eliminar respaldos antiguos que ya no sean necesarios.
- Registrar quien hizo el respaldo y donde quedo guardado.

## Registro de respaldos

Llevar una planilla simple:

```text
Fecha | Cuenta | Programa | Formato | Ubicacion | Responsable | Verificado
```

Ejemplo:

```text
2026-09-01 | francodareck@tecnicahidraulica.cl | Apple Mail | mbox | Disco Respaldo 1 | Franco | Si
```

## Recomendacion para Tecnica Hidraulica

Como hoy se usa Mac y Mail de macOS, el respaldo inmediato mas simple es `.mbox`.

Si despues quieren centralizar esto en el ERP, se puede crear un modulo de `Respaldos` para registrar:

- Cuenta respaldada.
- Fecha del respaldo.
- Responsable.
- Tipo de archivo.
- Ubicacion fisica o ruta del archivo.
- Observaciones.

No es recomendable subir todos los correos historicos al ERP si pesan mucho. Para eso conviene guardar los archivos grandes en disco/NAS/nube y dejar en el ERP solo el registro y ubicacion del respaldo.
