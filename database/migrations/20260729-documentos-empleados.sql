begin;

update public.rrhh_tipos_documento
set activo = false,
    obligatorio = false,
    updated_at = now()
where lower(nombre) in ('cedula de identidad', 'cédula de identidad');

insert into public.rrhh_tipos_documento (
  empresa_id, nombre, categoria, obligatorio, vence, vigencia_dias, alcance
)
select e.id, seed.nombre, seed.categoria, seed.obligatorio, seed.vence, seed.vigencia_dias, seed.alcance
from public.empresas e
cross join (values
  ('Carnet de identidad - frontal', 'personal', true, true, null, 'todos'),
  ('Carnet de identidad - reverso', 'personal', true, true, null, 'todos'),
  ('Contrato de trabajo', 'contrato', true, false, null, 'contrato'),
  ('Anexo de contrato', 'anexo', false, false, null, 'contrato'),
  ('Certificado de afiliacion AFP', 'previsional', true, false, null, 'contrato'),
  ('Certificado de salud', 'previsional', true, false, null, 'contrato'),
  ('Certificado de antecedentes', 'personal', false, true, 90, 'todos'),
  ('Comprobante de domicilio', 'personal', false, false, null, 'todos'),
  ('Licencia de conducir', 'personal', false, true, null, 'todos'),
  ('Licencia medica', 'licencia', false, false, null, 'todos'),
  ('Liquidacion de sueldo', 'remuneracion', false, false, null, 'contrato'),
  ('Reglamento interno firmado', 'seguridad', false, false, null, 'contrato')
) as seed(nombre, categoria, obligatorio, vence, vigencia_dias, alcance)
on conflict (empresa_id, nombre) do update
set categoria = excluded.categoria,
    obligatorio = excluded.obligatorio,
    vence = excluded.vence,
    vigencia_dias = excluded.vigencia_dias,
    alcance = excluded.alcance,
    activo = true,
    updated_at = now();

commit;
