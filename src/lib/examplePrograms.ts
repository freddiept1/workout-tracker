// Example programs to start from (originals, not copies of published programs). Users copy and edit them.
import type { ProgramInput } from '../db/repo';
import type { Method, PlannedExercise } from '../db/types';
import { newId } from './ids';

type P = Partial<PlannedExercise> & { exerciseId: string };
const ex = (exerciseId: string, method: Method, sets: number, reps: string, extra: Partial<PlannedExercise> = {}): P =>
  ({ exerciseId, method, sets, reps, ...extra });

function build(p: P): PlannedExercise {
  return {
    id: newId(), startKg: null, pcts: [75], rpe: 8, incrementKg: 2.5, effort: null, distanceM: null, notes: '',
    sets: 3, reps: '5', method: 'linear', ...p
  };
}

const day = (name: string, exercises: P[]) => ({ id: newId(), name, exercises: exercises.map(build) });

export interface Example {
  key: string;
  description: string;
  make: () => ProgramInput;
}

export const EXAMPLE_PROGRAMS: Example[] = [
  {
    key: 'linear',
    description: '3 days a week, 6 weeks. Simple linear progression on the big lifts, double progression on accessories.',
    make: () => ({
      name: 'Linear Strength Base', weeks: 6, deloadEvery: null, maxes: {},
      days: [
        day('Day A', [
          ex('squat', 'linear', 3, '5', { incrementKg: 5 }),
          ex('bench-press', 'linear', 3, '5'),
          ex('barbell-row', 'double', 3, '8-10')
        ]),
        day('Day B', [
          ex('squat', 'linear', 3, '5', { incrementKg: 5 }),
          ex('overhead-press', 'linear', 3, '5'),
          ex('deadlift', 'linear', 1, '5', { incrementKg: 5 })
        ]),
        day('Day C', [
          ex('front-squat', 'double', 3, '4-6'),
          ex('paused-bench-press', 'linear', 4, '4'),
          ex('chin-up', 'double', 3, '6-10')
        ])
      ]
    })
  },
  {
    key: 'rpe',
    description: '4 days a week, 4-week block with a deload in week 4. RPE top sets, percentage back-off sets that rise each week.',
    make: () => ({
      name: 'Powerlifting RPE Block', weeks: 4, deloadEvery: 4, maxes: {},
      days: [
        day('Squat + Bench', [
          ex('squat', 'rpe', 1, '3', { rpe: 8, notes: 'Top set' }),
          ex('squat', 'pct', 3, '5', { pcts: [70, 72.5, 75, 65], notes: 'Back-off sets' }),
          ex('bench-press', 'rpe', 4, '5', { rpe: 7.5 })
        ]),
        day('Deadlift + Press', [
          ex('deadlift', 'rpe', 1, '3', { rpe: 8, notes: 'Top set' }),
          ex('deadlift', 'pct', 3, '4', { pcts: [70, 72.5, 75, 65], notes: 'Back-off sets' }),
          ex('overhead-press', 'double', 3, '6-8')
        ]),
        day('Bench', [
          ex('paused-bench-press', 'rpe', 1, '3', { rpe: 8, notes: 'Top set' }),
          ex('bench-press', 'pct', 4, '5', { pcts: [70, 72.5, 75, 65] }),
          ex('larsen-press', 'linear', 3, '6')
        ]),
        day('Variations', [
          ex('paused-squat', 'rpe', 3, '4', { rpe: 7 }),
          ex('close-grip-bench-press', 'double', 3, '6-8'),
          ex('romanian-deadlift', 'double', 3, '8-10')
        ])
      ]
    })
  },
  {
    key: 'athletic',
    description: '2 days a week, 4 weeks. Sprints, jumps and throws first while fresh, then Olympic lifts and strength.',
    make: () => ({
      name: 'Athletic Power', weeks: 4, deloadEvery: 4, maxes: {},
      days: [
        day('Speed + Power', [
          ex('20-m-sprint', 'fixed', 6, '1', { effort: 95, distanceM: 20 }),
          ex('countermovement-jump', 'fixed', 4, '3', { effort: 100 }),
          ex('power-clean', 'linear', 5, '3'),
          ex('trap-bar-deadlift', 'linear', 3, '5', { incrementKg: 5 }),
          ex('medicine-ball-chest-pass', 'fixed', 3, '5', { effort: 100 })
        ]),
        day('Max Velocity + Single-leg', [
          ex('flying-10-m-sprint', 'fixed', 4, '1', { effort: 95, distanceM: 10 }),
          ex('single-leg-hop', 'fixed', 3, '3', { effort: 100 }),
          ex('hang-power-clean', 'linear', 4, '3'),
          ex('bulgarian-split-squat', 'double', 3, '8-10'),
          ex('sled-push', 'fixed', 4, '1', { effort: 90, distanceM: 20 })
        ])
      ]
    })
  }
];
