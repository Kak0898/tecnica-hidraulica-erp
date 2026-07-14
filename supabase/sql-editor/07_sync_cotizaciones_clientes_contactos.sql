create or replace function public.sync_cotizacion_documento_relaciones()
returns trigger
language plpgsql
security definer
set search_path = public
as '
begin
  if new.empresa_id is null then
    return new;
  end if;

  if new.cliente_id is null and nullif(trim(coalesce(new.cliente_nombre, '''')), '''') is not null then
    if nullif(trim(coalesce(new.cliente_rut, '''')), '''') is not null then
      new.cliente_id := (
        with upserted as (
          insert into public.clientes (
            empresa_id,
            razon_social,
            rut,
            giro,
            email,
            telefono,
            direccion,
            comuna,
            ciudad
          )
          values (
            new.empresa_id,
            trim(new.cliente_nombre),
            trim(new.cliente_rut),
            nullif(trim(coalesce(new.cliente_giro, '''')), ''''),
            nullif(trim(coalesce(new.cliente_email, '''')), ''''),
            nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
            nullif(trim(coalesce(new.cliente_direccion, '''')), ''''),
            nullif(trim(coalesce(new.cliente_comuna, '''')), ''''),
            nullif(trim(coalesce(new.cliente_ciudad, '''')), '''')
          )
          on conflict (empresa_id, rut) do update
            set razon_social = excluded.razon_social,
                giro = coalesce(excluded.giro, public.clientes.giro),
                email = coalesce(excluded.email, public.clientes.email),
                telefono = coalesce(excluded.telefono, public.clientes.telefono),
                direccion = coalesce(excluded.direccion, public.clientes.direccion),
                comuna = coalesce(excluded.comuna, public.clientes.comuna),
                ciudad = coalesce(excluded.ciudad, public.clientes.ciudad),
                updated_at = now()
          returning id
        )
        select id from upserted
      );
    else
      new.cliente_id := (
        select id
        from public.clientes
        where empresa_id = new.empresa_id
          and lower(razon_social) = lower(trim(new.cliente_nombre))
        order by created_at asc
        limit 1
      );

      if new.cliente_id is null then
        new.cliente_id := (
          with inserted as (
            insert into public.clientes (
              empresa_id,
              razon_social,
              email,
              telefono,
              direccion,
              comuna,
              ciudad
            )
            values (
              new.empresa_id,
              trim(new.cliente_nombre),
              nullif(trim(coalesce(new.cliente_email, '''')), ''''),
              nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
              nullif(trim(coalesce(new.cliente_direccion, '''')), ''''),
              nullif(trim(coalesce(new.cliente_comuna, '''')), ''''),
              nullif(trim(coalesce(new.cliente_ciudad, '''')), '''')
            )
            returning id
          )
          select id from inserted
        );
      end if;
    end if;
  end if;

  if new.cliente_id is not null
    and new.contacto_id is null
    and nullif(trim(coalesce(new.cliente_contacto, '''')), '''') is not null then

    if nullif(trim(coalesce(new.cliente_email, '''')), '''') is not null then
      new.contacto_id := (
        select id
        from public.contactos
        where empresa_id = new.empresa_id
          and cliente_id = new.cliente_id
          and lower(email) = lower(trim(new.cliente_email))
        order by created_at asc
        limit 1
      );
    end if;

    if new.contacto_id is null then
      new.contacto_id := (
        select id
        from public.contactos
        where empresa_id = new.empresa_id
          and cliente_id = new.cliente_id
          and lower(nombre) = lower(trim(new.cliente_contacto))
        order by created_at asc
        limit 1
      );
    end if;

    if new.contacto_id is null then
      new.contacto_id := (
        with inserted as (
          insert into public.contactos (
            empresa_id,
            cliente_id,
            nombre,
            email,
            telefono,
            principal
          )
          values (
            new.empresa_id,
            new.cliente_id,
            trim(new.cliente_contacto),
            nullif(trim(coalesce(new.cliente_email, '''')), ''''),
            nullif(trim(coalesce(new.cliente_telefono, '''')), ''''),
            true
          )
          returning id
        )
        select id from inserted
      );
    end if;
  end if;

  return new;
end;
';

drop trigger if exists sync_cotizacion_documento_relaciones on public.cotizacion_documentos;
create trigger sync_cotizacion_documento_relaciones before insert or update on public.cotizacion_documentos for each row execute function public.sync_cotizacion_documento_relaciones();
notify pgrst, 'reload schema';
