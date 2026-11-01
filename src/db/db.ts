// IndexedDB database (via Dexie). Bump the version and add a new `.stores()` block whenever tables
// or indexes change; Dexie keeps existing data. Data-shape changes also need an `.upgrade()` step.
import Dexie, { type EntityTable } from 'dexie';
import type { Exercise, MetaRow, Program, Session, Template } from './types';

export class TrackerDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  templates!: EntityTable<Template, 'id'>;
  programs!: EntityTable<Program, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name = 'workout-tracker') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, parentId, updatedAt',
      sessions: 'id, date, athleteId, *exerciseIds, updatedAt',
      templates: 'id, athleteId, order, updatedAt',
      meta: 'key'
    });
    // Phase 4: programs. Adding a table needs no data changes.
    this.version(2).stores({
      programs: 'id, athleteId, status, updatedAt'
    });
  }
}

export const db = new TrackerDB();
