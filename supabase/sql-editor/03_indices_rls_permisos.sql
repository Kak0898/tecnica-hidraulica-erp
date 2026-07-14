create index if not exists idx_usuarios_empresas_user on public.usuarios_empresas(user_id);
create index if not exists idx_usuario_empresa_activa_empresa on public.usuario_empresa_activa(empresa_id);
create index if not exists idx_clientes_empresa on public.clientes(empresa_id);
create index if not exists idx_contactos_cliente on public.contactos(cliente_id);
create index if not exists idx_machines_empresa on public.machines(empresa_id);
create index if not exists idx_machines_cliente on public.machines(cliente_id);
create index if not exists idx_machines_qr_token on public.machines(qr_token);
create index if not exists idx_spare_parts_empresa on public.spare_parts(empresa_id);
create index if not exists idx_erp_counters_empresa_key on public.erp_counters(empresa_id, key);
create index if not exists idx_cotizaciones_empresa_estado on public.cotizaciones(empresa_id, estado);
create index if not exists idx_cotizacion_documentos_empresa_estado on public.cotizacion_documentos(empresa_id, estado);
create index if not exists idx_cotizacion_documentos_numero on public.cotizacion_documentos(empresa_id, numero);
create index if not exists idx_ordenes_empresa_estado on public.ordenes_trabajo(empresa_id, estado);
create index if not exists idx_eventos_equipo_created on public.equipo_eventos(equipo_id, created_at desc);
create index if not exists idx_archivos_entidad on public.archivos(entidad_tipo, entidad_id);
create index if not exists idx_personas_empresa_tipo on public.personas(empresa_id, tipo_relacion);
create index if not exists idx_pagos_personas_empresa_periodo on public.pagos_personas(empresa_id, periodo);
create index if not exists idx_documentos_personas_persona on public.documentos_personas(persona_id);
create index if not exists idx_crm_empresa_etapa on public.crm_oportunidades(empresa_id, etapa);

drop trigger if exists set_empresas_updated_at on public.empresas;
create trigger set_empresas_updated_at before update on public.empresas for each row execute function public.set_updated_at();
drop trigger if exists set_usuarios_empresas_updated_at on public.usuarios_empresas;
create trigger set_usuarios_empresas_updated_at before update on public.usuarios_empresas for each row execute function public.set_updated_at();
drop trigger if exists set_usuario_empresa_activa_updated_at on public.usuario_empresa_activa;
create trigger set_usuario_empresa_activa_updated_at before update on public.usuario_empresa_activa for each row execute function public.set_updated_at();
drop trigger if exists set_clientes_updated_at on public.clientes;
create trigger set_clientes_updated_at before update on public.clientes for each row execute function public.set_updated_at();
drop trigger if exists set_contactos_updated_at on public.contactos;
create trigger set_contactos_updated_at before update on public.contactos for each row execute function public.set_updated_at();
drop trigger if exists set_machines_updated_at on public.machines;
create trigger set_machines_updated_at before update on public.machines for each row execute function public.set_updated_at();
drop trigger if exists set_spare_parts_updated_at on public.spare_parts;
create trigger set_spare_parts_updated_at before update on public.spare_parts for each row execute function public.set_updated_at();
drop trigger if exists set_erp_counters_updated_at on public.erp_counters;
create trigger set_erp_counters_updated_at before update on public.erp_counters for each row execute function public.set_updated_at();
drop trigger if exists set_cotizaciones_updated_at on public.cotizaciones;
create trigger set_cotizaciones_updated_at before update on public.cotizaciones for each row execute function public.set_updated_at();
drop trigger if exists set_cotizacion_documentos_updated_at on public.cotizacion_documentos;
create trigger set_cotizacion_documentos_updated_at before update on public.cotizacion_documentos for each row execute function public.set_updated_at();
drop trigger if exists sync_cotizacion_documento_relaciones on public.cotizacion_documentos;
create trigger sync_cotizacion_documento_relaciones before insert or update on public.cotizacion_documentos for each row execute function public.sync_cotizacion_documento_relaciones();
drop trigger if exists set_ordenes_trabajo_updated_at on public.ordenes_trabajo;
create trigger set_ordenes_trabajo_updated_at before update on public.ordenes_trabajo for each row execute function public.set_updated_at();
drop trigger if exists set_audits_updated_at on public.audits;
create trigger set_audits_updated_at before update on public.audits for each row execute function public.set_updated_at();
drop trigger if exists set_crm_oportunidades_updated_at on public.crm_oportunidades;
create trigger set_crm_oportunidades_updated_at before update on public.crm_oportunidades for each row execute function public.set_updated_at();
drop trigger if exists set_personas_updated_at on public.personas;
create trigger set_personas_updated_at before update on public.personas for each row execute function public.set_updated_at();
drop trigger if exists set_pagos_personas_updated_at on public.pagos_personas;
create trigger set_pagos_personas_updated_at before update on public.pagos_personas for each row execute function public.set_updated_at();

alter table public.empresas enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.usuario_empresa_activa enable row level security;
alter table public.clientes enable row level security;
alter table public.contactos enable row level security;
alter table public.machines enable row level security;
alter table public.spare_parts enable row level security;
alter table public.erp_counters enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.cotizacion_documentos enable row level security;
alter table public.ordenes_trabajo enable row level security;
alter table public.audits enable row level security;
alter table public.equipo_eventos enable row level security;
alter table public.archivos enable row level security;
alter table public.import_logs enable row level security;
alter table public.personas enable row level security;
alter table public.pagos_personas enable row level security;
alter table public.documentos_personas enable row level security;
alter table public.crm_oportunidades enable row level security;
alter table public.whatsapp_mensajes enable row level security;
alter table public.ia_consultas enable row level security;

drop policy if exists "empresas select by member" on public.empresas;
create policy "empresas select by member" on public.empresas for select to authenticated using (public.is_empresa_member(id));
drop policy if exists "empresas insert authenticated" on public.empresas;
create policy "empresas insert authenticated" on public.empresas for insert to authenticated with check (true);
drop policy if exists "empresas update by admin" on public.empresas;
create policy "empresas update by admin" on public.empresas for update to authenticated using (public.is_empresa_admin(id)) with check (public.is_empresa_admin(id));

drop policy if exists "usuarios_empresas select by member" on public.usuarios_empresas;
create policy "usuarios_empresas select by member" on public.usuarios_empresas for select to authenticated using (public.is_empresa_member(empresa_id) or user_id = auth.uid());
drop policy if exists "usuarios_empresas insert bootstrap or admin" on public.usuarios_empresas;
create policy "usuarios_empresas insert bootstrap or admin" on public.usuarios_empresas
for insert to authenticated
with check (
  public.is_empresa_admin(empresa_id)
  or (
    user_id = auth.uid()
    and rol = 'owner'
    and public.empresa_has_members(empresa_id) = false
  )
);
drop policy if exists "usuarios_empresas update by admin" on public.usuarios_empresas;
create policy "usuarios_empresas update by admin" on public.usuarios_empresas for update to authenticated using (public.is_empresa_admin(empresa_id)) with check (public.is_empresa_admin(empresa_id));

drop policy if exists "usuario_empresa_activa own access" on public.usuario_empresa_activa;
create policy "usuario_empresa_activa own access" on public.usuario_empresa_activa for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_empresa_member(empresa_id));

drop policy if exists "clientes tenant access" on public.clientes;
create policy "clientes tenant access" on public.clientes for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "contactos tenant access" on public.contactos;
create policy "contactos tenant access" on public.contactos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "machines tenant access" on public.machines;
create policy "machines tenant access" on public.machines for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "spare_parts tenant access" on public.spare_parts;
create policy "spare_parts tenant access" on public.spare_parts for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "erp_counters tenant access" on public.erp_counters;
create policy "erp_counters tenant access" on public.erp_counters for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizaciones tenant access" on public.cotizaciones;
create policy "cotizaciones tenant access" on public.cotizaciones for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizacion_items tenant access" on public.cotizacion_items;
create policy "cotizacion_items tenant access" on public.cotizacion_items for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "cotizacion_documentos tenant access" on public.cotizacion_documentos;
create policy "cotizacion_documentos tenant access" on public.cotizacion_documentos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "ordenes_trabajo tenant access" on public.ordenes_trabajo;
create policy "ordenes_trabajo tenant access" on public.ordenes_trabajo for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "audits tenant access" on public.audits;
create policy "audits tenant access" on public.audits for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "equipo_eventos tenant access" on public.equipo_eventos;
create policy "equipo_eventos tenant access" on public.equipo_eventos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "archivos tenant access" on public.archivos;
create policy "archivos tenant access" on public.archivos for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "import_logs tenant access" on public.import_logs;
create policy "import_logs tenant access" on public.import_logs for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "personas tenant access" on public.personas;
create policy "personas tenant access" on public.personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "pagos_personas tenant access" on public.pagos_personas;
create policy "pagos_personas tenant access" on public.pagos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "documentos_personas tenant access" on public.documentos_personas;
create policy "documentos_personas tenant access" on public.documentos_personas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "crm_oportunidades tenant access" on public.crm_oportunidades;
create policy "crm_oportunidades tenant access" on public.crm_oportunidades for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "whatsapp_mensajes tenant access" on public.whatsapp_mensajes;
create policy "whatsapp_mensajes tenant access" on public.whatsapp_mensajes for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));
drop policy if exists "ia_consultas tenant access" on public.ia_consultas;
create policy "ia_consultas tenant access" on public.ia_consultas for all to authenticated using (public.is_empresa_member(empresa_id)) with check (public.is_empresa_member(empresa_id));

drop policy if exists "machines public qr read" on public.machines;
create policy "machines public qr read" on public.machines for select to anon using (qr_enabled = true and public_view_enabled = true);

insert into storage.buckets (id, name, public)
values ('erp', 'erp', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('empresa-assets', 'empresa-assets', true)
on conflict (id) do update set public = true;

drop policy if exists "empresa_assets public read" on storage.objects;
create policy "empresa_assets public read" on storage.objects for select using (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated insert" on storage.objects;
create policy "empresa_assets authenticated insert" on storage.objects for insert to authenticated with check (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated update" on storage.objects;
create policy "empresa_assets authenticated update" on storage.objects for update to authenticated using (bucket_id = 'empresa-assets') with check (bucket_id = 'empresa-assets');
drop policy if exists "empresa_assets authenticated delete" on storage.objects;
create policy "empresa_assets authenticated delete" on storage.objects for delete to authenticated using (bucket_id = 'empresa-assets');

grant execute on function public.next_erp_pre_cotizacion() to authenticated;
grant execute on function public.next_erp_cotizacion() to authenticated;
grant execute on function public.emit_erp_cotizacion(bigint) to authenticated;
grant execute on function public.crear_ot_desde_cotizacion_documento(bigint) to authenticated;
grant execute on function public.bootstrap_empresa_tecnica_hidraulica() to authenticated;
grant execute on function public.create_empresa_owner(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_empresa_activa(uuid) to authenticated;
