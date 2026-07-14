alter table public.empresas
  add column if not exists razon_social text,
  add column if not exists website text,
  add column if not exists logo_url text,
  add column if not exists logo_path text,
  add column if not exists descripcion_corta text,
  add column if not exists firma_nombre text,
  add column if not exists firma_cargo text,
  add column if not exists firma_email text,
  add column if not exists firma_telefono text,
  add column if not exists firma_celular text,
  add column if not exists condiciones_default text,
  add column if not exists observaciones_default text;

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

notify pgrst, 'reload schema';
