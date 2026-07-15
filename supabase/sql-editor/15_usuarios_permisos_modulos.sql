-- Usuarios y permisos por módulo para cada empresa.
-- Requiere la base principal y los módulos hasta EPP. Si el parche 10 quedó
-- pendiente, recupera automáticamente horas extra y Google Ads sin borrar datos.

create table if not exists public.horas_extra (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  persona_id uuid not null references public.personas(id) on delete cascade,
  pago_id uuid references public.pagos_personas(id) on delete set null,
  fecha date not null default current_date,
  horas numeric(7,2) not null check (horas > 0),
  valor_hora numeric not null default 0 check (valor_hora >= 0),
  factor numeric(4,2) not null default 1.5 check (factor >= 1.5),
  monto numeric not null default 0 check (monto >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'liquidada', 'anulada')),
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_ads_campanas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  google_campaign_id text,
  nombre text not null,
  tipo text not null default 'busqueda' check (tipo in ('busqueda', 'performance_max', 'display', 'video', 'shopping', 'otro')),
  estado text not null default 'habilitada' check (estado in ('habilitada', 'pausada', 'finalizada')),
  presupuesto_diario numeric not null default 0 check (presupuesto_diario >= 0),
  objetivo_cpa numeric not null default 0 check (objetivo_cpa >= 0),
  objetivo_roas numeric not null default 0 check (objetivo_roas >= 0),
  url_google_ads text,
  notas text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, google_campaign_id)
);

create table if not exists public.google_ads_metricas_diarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  campana_id uuid not null references public.google_ads_campanas(id) on delete cascade,
  fecha date not null default current_date,
  impresiones bigint not null default 0 check (impresiones >= 0),
  clics bigint not null default 0 check (clics >= 0),
  costo numeric not null default 0 check (costo >= 0),
  conversiones numeric(12,2) not null default 0 check (conversiones >= 0),
  valor_conversiones numeric not null default 0 check (valor_conversiones >= 0),
  cuota_impresiones numeric(6,2) not null default 0 check (cuota_impresiones between 0 and 100),
  perdida_presupuesto numeric(6,2) not null default 0 check (perdida_presupuesto between 0 and 100),
  fuente text not null default 'manual' check (fuente in ('manual', 'api', 'importacion')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campana_id, fecha)
);

create table if not exists public.google_ads_recomendaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.current_empresa_id() references public.empresas(id) on delete cascade,
  campana_id uuid references public.google_ads_campanas(id) on delete cascade,
  fecha date not null default current_date,
  prioridad text not null default 'media' check (prioridad in ('alta', 'media', 'baja')),
  titulo text not null,
  detalle text not null,
  fuente text not null default 'automatica' check (fuente in ('automatica', 'manual', 'google')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'descartada')),
  resuelta_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (empresa_id, campana_id, fecha, titulo)
);

create index if not exists idx_horas_extra_empresa_fecha on public.horas_extra(empresa_id, fecha desc);
create index if not exists idx_horas_extra_persona_estado on public.horas_extra(persona_id, estado);
create index if not exists idx_google_ads_campanas_empresa on public.google_ads_campanas(empresa_id, estado);
create index if not exists idx_google_ads_metricas_empresa_fecha on public.google_ads_metricas_diarias(empresa_id, fecha desc);
create index if not exists idx_google_ads_recomendaciones_estado on public.google_ads_recomendaciones(empresa_id, estado, fecha desc);

drop trigger if exists set_horas_extra_updated_at on public.horas_extra;
create trigger set_horas_extra_updated_at before update on public.horas_extra for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_campanas_updated_at on public.google_ads_campanas;
create trigger set_google_ads_campanas_updated_at before update on public.google_ads_campanas for each row execute function public.set_updated_at();
drop trigger if exists set_google_ads_metricas_updated_at on public.google_ads_metricas_diarias;
create trigger set_google_ads_metricas_updated_at before update on public.google_ads_metricas_diarias for each row execute function public.set_updated_at();

alter table public.horas_extra enable row level security;
alter table public.google_ads_campanas enable row level security;
alter table public.google_ads_metricas_diarias enable row level security;
alter table public.google_ads_recomendaciones enable row level security;

alter table public.usuarios_empresas
  add column if not exists permisos_inicializados boolean not null default false;

create table if not exists public.usuario_permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo text not null check (modulo in (
    'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
    'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
    'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
    'repuestos', 'epp_ropa', 'auditorias', 'importar_excel',
    'ia', 'configuracion', 'usuarios_permisos'
  )),
  permitido boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, user_id, modulo)
);

create index if not exists idx_usuario_permisos_empresa_usuario
  on public.usuario_permisos(empresa_id, user_id);

drop trigger if exists set_usuario_permisos_updated_at on public.usuario_permisos;
create trigger set_usuario_permisos_updated_at
before update on public.usuario_permisos
for each row execute function public.set_updated_at();

create or replace function public.has_module_permission(target_empresa_id uuid, target_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = target_empresa_id
      and ue.user_id = auth.uid()
      and ue.activo = true
      and (
        ue.rol in (''owner'', ''admin'')
        or (target_module not in (''configuracion'', ''usuarios_permisos'') and exists (
          select 1
          from public.usuario_permisos up
          where up.empresa_id = target_empresa_id
            and up.user_id = auth.uid()
            and up.modulo = target_module
            and up.permitido = true
        ))
      )
  )
';

create or replace function public.has_any_module_permission(target_empresa_id uuid, target_modules text[])
returns boolean
language sql
stable
security definer
set search_path = public
as '
  select exists (
    select 1
    from unnest(coalesce(target_modules, array[]::text[])) as requested(module_key)
    where public.has_module_permission(target_empresa_id, requested.module_key)
  )
';

create or replace function public.mis_permisos_empresa(p_empresa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as '
declare
  membership_role text;
  module_list text[];
  all_modules constant text[] := array[
    ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
    ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
    ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
    ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
    ''ia'', ''configuracion'', ''usuarios_permisos''
  ];
begin
  select ue.rol
    into membership_role
  from public.usuarios_empresas ue
  where ue.empresa_id = p_empresa_id
    and ue.user_id = auth.uid()
    and ue.activo = true
  limit 1;

  if membership_role is null then
    return jsonb_build_object(''rol'', null, ''is_admin'', false, ''modulos'', ''[]''::jsonb);
  end if;

  if membership_role in (''owner'', ''admin'') then
    module_list := all_modules;
  else
    select coalesce(array_agg(up.modulo order by up.modulo), array[]::text[])
      into module_list
    from public.usuario_permisos up
    where up.empresa_id = p_empresa_id
      and up.user_id = auth.uid()
      and up.permitido = true;
  end if;

  return jsonb_build_object(
    ''rol'', membership_role,
    ''is_admin'', membership_role in (''owner'', ''admin''),
    ''modulos'', to_jsonb(module_list)
  );
end;
';

create or replace function public.listar_usuarios_empresa(p_empresa_id uuid)
returns table (
  user_id uuid,
  email text,
  rol text,
  activo boolean,
  modulos text[]
)
language plpgsql
stable
security definer
set search_path = public, auth
as '
begin
  if not public.is_empresa_admin(p_empresa_id) then
    raise exception ''Solo un administrador puede revisar usuarios y permisos'';
  end if;

  return query
  select
    ue.user_id,
    au.email::text,
    ue.rol,
    ue.activo,
    case
      when ue.rol in (''owner'', ''admin'') then array[
        ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
        ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
        ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
        ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
        ''ia'', ''configuracion'', ''usuarios_permisos''
      ]::text[]
      else coalesce((
        select array_agg(up.modulo order by up.modulo)
        from public.usuario_permisos up
        where up.empresa_id = ue.empresa_id
          and up.user_id = ue.user_id
          and up.permitido = true
      ), array[]::text[])
    end as modulos
  from public.usuarios_empresas ue
  join auth.users au on au.id = ue.user_id
  where ue.empresa_id = p_empresa_id
  order by
    case ue.rol when ''owner'' then 0 when ''admin'' then 1 else 2 end,
    lower(au.email);
end;
';

create or replace function public.guardar_permisos_usuario(
  p_empresa_id uuid,
  p_email text,
  p_rol text,
  p_modulos text[] default array[]::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as '
declare
  target_user_id uuid;
  existing_role text;
  requested_role text;
  all_modules constant text[] := array[
    ''dashboard'', ''google_ads'', ''clientes'', ''empresas_asociadas'',
    ''presupuestos'', ''cotizaciones'', ''publicaciones'', ''ordenes'',
    ''crm'', ''whatsapp'', ''personas_pagos'', ''flota'', ''maquinaria'',
    ''repuestos'', ''epp_ropa'', ''auditorias'', ''importar_excel'',
    ''ia''
  ];
begin
  if not public.is_empresa_admin(p_empresa_id) then
    raise exception ''Solo un administrador puede guardar permisos'';
  end if;

  select au.id into target_user_id
  from auth.users au
  where lower(au.email) = lower(trim(coalesce(p_email, '''')))
  limit 1;

  if target_user_id is null then
    raise exception ''El correo no tiene una cuenta creada en Supabase Auth. Crea primero la cuenta y vuelve a intentarlo'';
  end if;

  if p_rol not in (''admin'', ''operador'') then
    raise exception ''El tipo de acceso debe ser administrador o usuario por módulos'';
  end if;

  select ue.rol into existing_role
  from public.usuarios_empresas ue
  where ue.empresa_id = p_empresa_id and ue.user_id = target_user_id;

  requested_role := case when existing_role = ''owner'' then ''owner'' else p_rol end;

  if target_user_id = auth.uid()
     and existing_role in (''owner'', ''admin'')
     and requested_role not in (''owner'', ''admin'') then
    raise exception ''No puedes quitarte tus propios permisos administrativos'';
  end if;

  insert into public.usuarios_empresas (
    empresa_id, user_id, rol, activo, permisos_inicializados
  ) values (
    p_empresa_id, target_user_id, requested_role, true, true
  )
  on conflict (empresa_id, user_id) do update
    set rol = excluded.rol,
        activo = true,
        permisos_inicializados = true,
        updated_at = now();

  delete from public.usuario_permisos up
  where up.empresa_id = p_empresa_id and up.user_id = target_user_id;

  if requested_role not in (''owner'', ''admin'') then
    insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
    select p_empresa_id, target_user_id, requested.module_key, true
    from (
      select distinct unnest(coalesce(p_modulos, array[]::text[])) as module_key
    ) requested
    where requested.module_key = any(all_modules)
    on conflict (empresa_id, user_id, modulo) do update
      set permitido = true, updated_at = now();
  end if;

  insert into public.usuario_empresa_activa (user_id, empresa_id)
  values (target_user_id, p_empresa_id)
  on conflict (user_id) do nothing;

  return target_user_id;
end;
';

create or replace function public.cambiar_estado_usuario_empresa(
  p_empresa_id uuid,
  p_user_id uuid,
  p_activo boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as '
declare
  target_role text;
begin
  if not public.is_empresa_admin(p_empresa_id) then
    raise exception ''Solo un administrador puede cambiar el estado de un usuario'';
  end if;

  if p_user_id = auth.uid() and p_activo = false then
    raise exception ''No puedes desactivar tu propio acceso'';
  end if;

  select ue.rol into target_role
  from public.usuarios_empresas ue
  where ue.empresa_id = p_empresa_id and ue.user_id = p_user_id;

  if target_role = ''owner'' and p_activo = false then
    raise exception ''No se puede desactivar al propietario de la empresa'';
  end if;

  update public.usuarios_empresas ue
  set activo = p_activo, updated_at = now()
  where ue.empresa_id = p_empresa_id and ue.user_id = p_user_id;

  return found;
end;
';

-- usuario.general administra los permisos cuando ya pertenece a la empresa.
update public.usuarios_empresas ue
set rol = case when ue.rol = 'owner' then 'owner' else 'admin' end,
    activo = true,
    permisos_inicializados = true,
    updated_at = now()
from auth.users au
where au.id = ue.user_id
  and lower(au.email) = 'usuario.general@tecnicahidraulica.cl';

-- Conserva el acceso actual de miembros existentes la primera vez que se instala.
insert into public.usuario_permisos (empresa_id, user_id, modulo, permitido)
select ue.empresa_id, ue.user_id, module_list.modulo, true
from public.usuarios_empresas ue
cross join unnest(array[
  'dashboard', 'google_ads', 'clientes', 'empresas_asociadas',
  'presupuestos', 'cotizaciones', 'publicaciones', 'ordenes',
  'crm', 'whatsapp', 'personas_pagos', 'flota', 'maquinaria',
  'repuestos', 'epp_ropa', 'auditorias', 'importar_excel',
  'ia'
]::text[]) as module_list(modulo)
where ue.activo = true
  and ue.rol not in ('owner', 'admin')
  and ue.permisos_inicializados = false
on conflict (empresa_id, user_id, modulo) do nothing;

update public.usuarios_empresas
set permisos_inicializados = true
where permisos_inicializados = false;

alter table public.usuario_permisos enable row level security;

drop policy if exists "usuario_permisos own or admin read" on public.usuario_permisos;
create policy "usuario_permisos own or admin read"
on public.usuario_permisos for select to authenticated
using (user_id = auth.uid() or public.is_empresa_admin(empresa_id));

drop policy if exists "usuario_permisos admin write" on public.usuario_permisos;
create policy "usuario_permisos admin write"
on public.usuario_permisos for all to authenticated
using (public.is_empresa_admin(empresa_id))
with check (public.is_empresa_admin(empresa_id));

-- Las políticas siguientes protegen los datos, además de ocultar el menú.
drop policy if exists "clientes tenant access" on public.clientes;
create policy "clientes tenant access" on public.clientes for all to authenticated using (public.has_module_permission(empresa_id, 'clientes')) with check (public.has_module_permission(empresa_id, 'clientes'));
drop policy if exists "contactos tenant access" on public.contactos;
create policy "contactos tenant access" on public.contactos for all to authenticated using (public.has_module_permission(empresa_id, 'clientes')) with check (public.has_module_permission(empresa_id, 'clientes'));
drop policy if exists "machines tenant access" on public.machines;
create policy "machines tenant access" on public.machines for all to authenticated using (public.has_module_permission(empresa_id, 'maquinaria')) with check (public.has_module_permission(empresa_id, 'maquinaria'));
drop policy if exists "spare_parts tenant access" on public.spare_parts;
create policy "spare_parts tenant access" on public.spare_parts for all to authenticated using (public.has_module_permission(empresa_id, 'repuestos')) with check (public.has_module_permission(empresa_id, 'repuestos'));

-- Lecturas auxiliares necesarias para que un módulo funcione sin entregar
-- permisos de escritura ni mostrar la sección auxiliar en el menú.
drop policy if exists "clientes shared module read" on public.clientes;
create policy "clientes shared module read" on public.clientes for select to authenticated
using (public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp']));
drop policy if exists "contactos shared module read" on public.contactos;
create policy "contactos shared module read" on public.contactos for select to authenticated
using (public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones', 'ordenes', 'crm', 'whatsapp']));
drop policy if exists "machines shared module read" on public.machines;
create policy "machines shared module read" on public.machines for select to authenticated
using (public.has_any_module_permission(empresa_id, array['dashboard', 'ordenes', 'auditorias', 'ia']));
drop policy if exists "spare_parts shared module read" on public.spare_parts;
create policy "spare_parts shared module read" on public.spare_parts for select to authenticated
using (public.has_module_permission(empresa_id, 'dashboard'));

drop policy if exists "erp_counters tenant access" on public.erp_counters;
create policy "erp_counters tenant access" on public.erp_counters for all to authenticated
using (
  (key = 'pre_cotizacion' and public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones']))
  or (key = 'cotizacion' and public.has_module_permission(empresa_id, 'cotizaciones'))
)
with check (
  (key = 'pre_cotizacion' and public.has_any_module_permission(empresa_id, array['presupuestos', 'cotizaciones']))
  or (key = 'cotizacion' and public.has_module_permission(empresa_id, 'cotizaciones'))
);
drop policy if exists "cotizaciones tenant access" on public.cotizaciones;
create policy "cotizaciones tenant access" on public.cotizaciones for all to authenticated using (public.has_module_permission(empresa_id, 'cotizaciones')) with check (public.has_module_permission(empresa_id, 'cotizaciones'));
drop policy if exists "cotizacion_items tenant access" on public.cotizacion_items;
create policy "cotizacion_items tenant access" on public.cotizacion_items for all to authenticated using (public.has_module_permission(empresa_id, 'cotizaciones')) with check (public.has_module_permission(empresa_id, 'cotizaciones'));
drop policy if exists "cotizacion_documentos tenant access" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module select" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module insert" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module update" on public.cotizacion_documentos;
drop policy if exists "cotizacion_documentos module delete" on public.cotizacion_documentos;
create policy "cotizacion_documentos module select" on public.cotizacion_documentos for select to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
  or (public.has_module_permission(empresa_id, 'ordenes') and numero is not null)
);
create policy "cotizacion_documentos module insert" on public.cotizacion_documentos for insert to authenticated
with check (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);
create policy "cotizacion_documentos module update" on public.cotizacion_documentos for update to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
)
with check (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);
create policy "cotizacion_documentos module delete" on public.cotizacion_documentos for delete to authenticated
using (
  public.has_module_permission(empresa_id, 'cotizaciones')
  or (public.has_module_permission(empresa_id, 'presupuestos') and numero is null and tipo in ('PRESUPUESTO', 'PRE-COTIZACION'))
);

drop policy if exists "ordenes_trabajo tenant access" on public.ordenes_trabajo;
create policy "ordenes_trabajo tenant access" on public.ordenes_trabajo for all to authenticated using (public.has_module_permission(empresa_id, 'ordenes')) with check (public.has_module_permission(empresa_id, 'ordenes'));
drop policy if exists "ordenes_trabajo ia read" on public.ordenes_trabajo;
create policy "ordenes_trabajo ia read" on public.ordenes_trabajo for select to authenticated using (public.has_module_permission(empresa_id, 'ia'));
drop policy if exists "audits tenant access" on public.audits;
create policy "audits tenant access" on public.audits for all to authenticated using (public.has_module_permission(empresa_id, 'auditorias')) with check (public.has_module_permission(empresa_id, 'auditorias'));
drop policy if exists "equipo_eventos tenant access" on public.equipo_eventos;
create policy "equipo_eventos tenant access" on public.equipo_eventos for all to authenticated using (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias'])) with check (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias']));
drop policy if exists "archivos tenant access" on public.archivos;
create policy "archivos tenant access" on public.archivos for all to authenticated using (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias', 'personas_pagos'])) with check (public.has_any_module_permission(empresa_id, array['maquinaria', 'ordenes', 'auditorias', 'personas_pagos']));
drop policy if exists "import_logs tenant access" on public.import_logs;
create policy "import_logs tenant access" on public.import_logs for all to authenticated using (public.has_module_permission(empresa_id, 'importar_excel')) with check (public.has_module_permission(empresa_id, 'importar_excel'));

drop policy if exists "personas tenant access" on public.personas;
create policy "personas tenant access" on public.personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "personas shared module read" on public.personas;
create policy "personas shared module read" on public.personas for select to authenticated using (public.has_any_module_permission(empresa_id, array['flota', 'epp_ropa']));
drop policy if exists "pagos_personas tenant access" on public.pagos_personas;
create policy "pagos_personas tenant access" on public.pagos_personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "documentos_personas tenant access" on public.documentos_personas;
create policy "documentos_personas tenant access" on public.documentos_personas for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));
drop policy if exists "horas_extra tenant access" on public.horas_extra;
create policy "horas_extra tenant access" on public.horas_extra for all to authenticated using (public.has_module_permission(empresa_id, 'personas_pagos')) with check (public.has_module_permission(empresa_id, 'personas_pagos'));

drop policy if exists "google_ads_campanas tenant access" on public.google_ads_campanas;
create policy "google_ads_campanas tenant access" on public.google_ads_campanas for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));
drop policy if exists "google_ads_metricas tenant access" on public.google_ads_metricas_diarias;
create policy "google_ads_metricas tenant access" on public.google_ads_metricas_diarias for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));
drop policy if exists "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones;
create policy "google_ads_recomendaciones tenant access" on public.google_ads_recomendaciones for all to authenticated using (public.has_module_permission(empresa_id, 'google_ads')) with check (public.has_module_permission(empresa_id, 'google_ads'));

drop policy if exists "crm_oportunidades tenant access" on public.crm_oportunidades;
create policy "crm_oportunidades tenant access" on public.crm_oportunidades for all to authenticated using (public.has_module_permission(empresa_id, 'crm')) with check (public.has_module_permission(empresa_id, 'crm'));
drop policy if exists "whatsapp_mensajes tenant access" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes tenant access" on public.whatsapp_mensajes for all to authenticated using (public.has_module_permission(empresa_id, 'whatsapp')) with check (public.has_module_permission(empresa_id, 'whatsapp'));
drop policy if exists "ia_consultas tenant access" on public.ia_consultas;
create policy "ia_consultas tenant access" on public.ia_consultas for all to authenticated using (public.has_module_permission(empresa_id, 'ia')) with check (public.has_module_permission(empresa_id, 'ia'));

drop policy if exists "empresas_asociadas tenant access" on public.empresas_asociadas;
create policy "empresas_asociadas tenant access" on public.empresas_asociadas for all to authenticated using (public.has_module_permission(empresa_id, 'empresas_asociadas')) with check (public.has_module_permission(empresa_id, 'empresas_asociadas'));
drop policy if exists "empresas_asociadas flota read" on public.empresas_asociadas;
create policy "empresas_asociadas flota read" on public.empresas_asociadas for select to authenticated using (public.has_module_permission(empresa_id, 'flota'));
drop policy if exists "vehiculos_empresa tenant access" on public.vehiculos_empresa;
create policy "vehiculos_empresa tenant access" on public.vehiculos_empresa for all to authenticated using (public.has_module_permission(empresa_id, 'flota')) with check (public.has_module_permission(empresa_id, 'flota'));

drop policy if exists "epp_items tenant access" on public.epp_items;
create policy "epp_items tenant access" on public.epp_items for all to authenticated using (public.has_module_permission(empresa_id, 'epp_ropa')) with check (public.has_module_permission(empresa_id, 'epp_ropa'));
drop policy if exists "epp_worker_sizes tenant access" on public.epp_worker_sizes;
create policy "epp_worker_sizes tenant access" on public.epp_worker_sizes for all to authenticated using (public.has_module_permission(empresa_id, 'epp_ropa')) with check (public.has_module_permission(empresa_id, 'epp_ropa'));

drop policy if exists "productos_comerciales tenant access" on public.productos_comerciales;
create policy "productos_comerciales tenant access" on public.productos_comerciales for all to authenticated using (public.has_module_permission(empresa_id, 'publicaciones')) with check (public.has_module_permission(empresa_id, 'publicaciones'));
drop policy if exists "publicaciones_productos tenant access" on public.publicaciones_productos;
create policy "publicaciones_productos tenant access" on public.publicaciones_productos for all to authenticated using (public.has_module_permission(empresa_id, 'publicaciones')) with check (public.has_module_permission(empresa_id, 'publicaciones'));

-- Las funciones que modifican datos deben respetar RLS. La emisión exige además
-- el módulo Cotizaciones (un usuario solo de Presupuestos no puede emitirla).
create or replace function public.generar_recomendaciones_google_ads(p_fecha date default current_date)
returns integer
language plpgsql
security invoker
set search_path = public
as '
declare
  target_empresa_id uuid;
  affected integer;
  total_inserted integer := 0;
begin
  target_empresa_id := public.current_empresa_id();
  if target_empresa_id is null then
    raise exception ''Usuario sin empresa activa'';
  end if;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''alta'',
    ''Revisar conversiones sin resultados'',
    ''La campaña '' || c.nombre || '' registra '' || m.clics || '' clics y ninguna conversión. Revisar medición, términos y página de destino.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.clics >= 20 and m.conversiones = 0
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''media'',
    ''Mejorar anuncios con CTR bajo'',
    ''La campaña '' || c.nombre || '' tiene CTR bajo 3%. Probar títulos más específicos y agregar búsquedas irrelevantes como negativas.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.impresiones >= 100
    and (m.clics::numeric / nullif(m.impresiones, 0)) * 100 < 3
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''media'',
    ''Revisar limitación por presupuesto'',
    ''La campaña '' || c.nombre || '' pierde '' || round(m.perdida_presupuesto, 1) || ''% de impresiones por presupuesto. Priorizar horarios y términos que convierten antes de aumentarlo.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.perdida_presupuesto >= 15
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  insert into public.google_ads_recomendaciones (empresa_id, campana_id, fecha, prioridad, titulo, detalle)
  select
    m.empresa_id,
    m.campana_id,
    m.fecha,
    ''alta'',
    ''CPA sobre el objetivo'',
    ''La campaña '' || c.nombre || '' supera en más de 25% su CPA objetivo. Revisar términos, ubicaciones y ofertas.''
  from public.google_ads_metricas_diarias m
  join public.google_ads_campanas c on c.id = m.campana_id
  where m.empresa_id = target_empresa_id and m.fecha = p_fecha and m.conversiones > 0 and c.objetivo_cpa > 0
    and (m.costo / nullif(m.conversiones, 0)) > c.objetivo_cpa * 1.25
  on conflict (empresa_id, campana_id, fecha, titulo) do nothing;
  get diagnostics affected = row_count;
  total_inserted := total_inserted + affected;

  return total_inserted;
end;
';

alter function public.next_erp_pre_cotizacion() security invoker;
alter function public.next_erp_cotizacion() security invoker;
alter function public.crear_ot_desde_cotizacion_documento(bigint) security invoker;
alter function public.generar_recomendaciones_google_ads(date) security invoker;

create or replace function public.emit_erp_cotizacion(doc_id bigint)
returns public.cotizacion_documentos
language sql
security invoker
set search_path = public
as '
  with target as (
    select id, numero
    from public.cotizacion_documentos
    where id = $1
      and public.has_module_permission(empresa_id, ''cotizaciones'')
    for update
  ),
  next_number as (
    select
      case
        when exists (select 1 from target where numero is null)
        then public.next_erp_cotizacion()
      end as numero
  ),
  updated as (
    update public.cotizacion_documentos cd
    set numero = coalesce(cd.numero, next_number.numero),
        tipo = ''COTIZACION'',
        estado = ''cotizacion_emitida'',
        emitida_at = coalesce(cd.emitida_at, now()),
        updated_at = now(),
        data = coalesce(cd.data, ''{}''::jsonb)
          || jsonb_build_object(
            ''numero'', coalesce(cd.numero, next_number.numero)::text,
            ''tipo'', ''COTIZACION'',
            ''estado'', ''cotizacion_emitida'',
            ''numeroReservado'', true,
            ''dirty'', false,
            ''savedAt'', now()::text
          )
    from target, next_number
    where cd.id = target.id
    returning cd.*
  )
  select *
  from updated
';

grant select, insert, update, delete on public.usuario_permisos to authenticated;
grant execute on function public.has_module_permission(uuid, text) to authenticated;
grant execute on function public.has_any_module_permission(uuid, text[]) to authenticated;
grant execute on function public.mis_permisos_empresa(uuid) to authenticated;
grant execute on function public.listar_usuarios_empresa(uuid) to authenticated;
grant execute on function public.guardar_permisos_usuario(uuid, text, text, text[]) to authenticated;
grant execute on function public.cambiar_estado_usuario_empresa(uuid, uuid, boolean) to authenticated;
grant execute on function public.generar_recomendaciones_google_ads(date) to authenticated;

notify pgrst, 'reload schema';
