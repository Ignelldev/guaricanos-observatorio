import { randomUUID } from 'node:crypto';
import { roleFor } from '../access';
import { validate, train } from '../analytics';
import type { Row } from '../analytics';
import { byKind, readRecords, schoolTransaction, writeRecord } from './db';
import type { StoredRecord } from './db';
import type { SchoolIdentity } from './session';

export class ActionError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function currentRole(user: SchoolIdentity, all: StoredRecord[]) {
  return roleFor(user.email, user.schoolAdmin ? user.email : undefined, byKind(all, 'member'));
}
function checked<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    throw new ActionError(error instanceof Error ? error.message : 'Datos no válidos.');
  }
}
export async function applyAction(user: SchoolIdentity, input: any) {
  if (!input || typeof input !== 'object') throw new ActionError('Operación no válida.');
  return schoolTransaction(async client => {
    const existing = await readRecords(client);
    if (currentRole(user, existing) !== 'admin') throw new ActionError('Solo la administración puede modificar datos o ejecutar análisis.', 403);
    const observations: Row[] = byKind(existing, 'observation');
    const now = new Date().toISOString();
    const audit: { id: string; action: string; actor: string; created: string; detail: string; before?: Row; after?: Row } = {
      id: randomUUID(), action: input.action, actor: user.email, created: now, detail: ''
    };
    const result: { ok: boolean; count?: number; modelId?: string } = { ok: true };
    switch (input.action) {
      case 'import': {
        if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 1000) throw new ActionError('Importa entre 1 y 1,000 filas.');
        const existingKeys = new Set(observations.map(row => row.codigo + '|' + row.periodo));
        const rows: Row[] = checked(() => input.rows.map(validate));
        for (const row of rows) {
          const key = row.codigo + '|' + row.periodo;
          if (existingKeys.has(key)) throw new ActionError('Ya existe ' + row.codigo + ' para ' + row.periodo + '. Usa Corregir registro o una fecha nueva.');
          existingKeys.add(key);
          await writeRecord(client, 'school|' + key, 'observation', { ...row, id: randomUUID(), created: now }, now);
        }
        audit.detail = rows.length + ' observaciones importadas';
        result.count = rows.length;
        break;
      }
      case 'correct': {
        const old = observations.find(row => row.id === input.id);
        if (!old) throw new ActionError('Registro no encontrado.', 404);
        if (!String(input.reason || '').trim()) throw new ActionError('Indica el motivo de la corrección.');
        if (old.updated !== input.expectedUpdated) throw new ActionError('El registro cambió. Recarga y vuelve a intentarlo.', 409);
        const row = { ...checked(() => validate(input.row)), id: old.id, created: old.created, updated: now };
        if (row.codigo !== old.codigo || row.periodo !== old.periodo) throw new ActionError('Una corrección no cambia el código ni la fecha.');
        const record = existing.find(r => r.kind === 'observation' && JSON.parse(r.payload).id === old.id)!;
        await writeRecord(client, record.id, 'observation', row, now, true);
        audit.before = old;
        audit.after = row;
        audit.detail = 'Corrección de ' + old.codigo + ' · ' + String(input.reason).trim().slice(0, 500);
        break;
      }
      case 'train': {
        const rows = observations.filter(row => row.periodo === input.periodo);
        const k = Number(input.k);
        if (!Number.isInteger(k) || k < 2 || k > 7) throw new ActionError('Selecciona entre 2 y 7 grupos.');
        const model = { ...checked(() => train(rows, k)), id: randomUUID(), periodo: input.periodo,
          created: now, n: rows.length, version: byKind(existing, 'analysis').length + 1, snapshot: rows };
        await writeRecord(client, model.id, 'analysis', model, now);
        result.modelId = model.id;
        audit.detail = 'Modelo v' + model.version + ' · k=' + k;
        break;
      }
      case 'member': {
        const email = String(input.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ActionError('Correo no válido.');
        if (email === user.email.trim().toLowerCase()) throw new ActionError('No puedes cambiar tu propio acceso.');
        const active = input.active !== false;
        await writeRecord(client, 'member|' + email, 'member', { email, active, role: 'viewer', updated: now }, now, true);
        audit.detail = (active ? 'Habilitación' : 'Revocación') + ' de consulta para ' + email;
        break;
      }
      case 'settings': {
        const url = String(input.url || '');
        if (url) {
          let parsed: URL;
          try { parsed = new URL(url); } catch { throw new ActionError('URL de Power BI no válida.'); }
          if (parsed.origin !== 'https://app.powerbi.com' || parsed.pathname !== '/reportEmbed' || parsed.username || parsed.password) {
            throw new ActionError('Usa la dirección segura de inserción de Power BI.');
          }
        }
        await writeRecord(client, 'school-settings', 'settings', { url }, now, true);
        audit.detail = 'Configuración de informe Power BI';
        break;
      }
      default:
        throw new ActionError('Operación no válida.');
    }
    await writeRecord(client, audit.id, 'audit', audit, now);
    return result;
  });
}
