import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Audit } from '../types';
import { Card } from '../components/Card';
export function Auditorias(){
 const [items,setItems]=useState<Audit[]>([]); const [form,setForm]=useState<Audit>({title:'',audit_type:'inventario',status:'pendiente'});
 async function load(){ const {data}=await supabase.from('audits').select('*').order('created_at',{ascending:false}); setItems(data||[]); }
 useEffect(()=>{load()},[]); async function save(){ if(!form.title) return alert('Falta título'); await supabase.from('audits').insert(form); setForm({title:'',audit_type:'inventario',status:'pendiente'}); load(); }
 return <div><h2 className="text-3xl font-bold mb-6">Auditorías</h2><Card><div className="grid md:grid-cols-4 gap-3 mb-4"><input className="border p-3 rounded" placeholder="Título auditoría" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><select className="border p-3 rounded" value={form.audit_type} onChange={e=>setForm({...form,audit_type:e.target.value as any})}><option value="inventario">Inventario</option><option value="mantencion">Mantención</option><option value="seguridad">Seguridad</option><option value="general">General</option></select><input className="border p-3 rounded" placeholder="Responsable" value={form.responsible||''} onChange={e=>setForm({...form,responsible:e.target.value})}/><button onClick={save} className="bg-blue-600 text-white rounded px-4">Crear</button></div>{items.map(a=><div className="border-b py-3" key={a.id}><b>{a.title}</b><p className="text-sm text-slate-500">{a.audit_type} · {a.status} · {a.responsible}</p></div>)}</Card></div>
}
