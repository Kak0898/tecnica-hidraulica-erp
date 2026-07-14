# Cotizaciones ERP

Modulo estatico incorporado al ERP para crear presupuestos y emitir cotizaciones.

## Ubicacion

Dentro del ERP queda disponible en:

`/modulos/cotizaciones/index.html`

## Supabase

Este modulo usa la misma base del ERP mediante:

- `cotizacion_documentos`
- `erp_counters`
- `next_erp_pre_cotizacion()`
- `next_erp_cotizacion()`
- `emit_erp_cotizacion(bigint)`

Configurar `config.js` con las credenciales publicas del proyecto Supabase:

```js
window.ERP_SUPABASE = {
  url: "https://TU-PROYECTO.supabase.co",
  anonKey: "TU_ANON_KEY"
};
```

Si `config.js` queda vacio, el modulo funciona en modo local del navegador, pero sin numeracion compartida.
