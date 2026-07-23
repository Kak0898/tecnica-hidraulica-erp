# Presupuestos y cotizaciones

El módulo se abre en dos modos:

- `/modulos/cotizaciones/index.html?modo=presupuesto`
- `/modulos/cotizaciones/index.html?modo=cotizacion`

Las cotizaciones pueden vincularse con un presupuesto guardado o marcarse como independientes. Los documentos, folios y datos comerciales se guardan mediante la API propia en PostgreSQL.

## Conexión

El módulo utiliza `api-client.js` y comparte la sesión iniciada en la intranet. La ruta predeterminada es:

```js
window.ERP_API_URL = "/api";
```

No se deben colocar credenciales de PostgreSQL ni secretos en este directorio.
