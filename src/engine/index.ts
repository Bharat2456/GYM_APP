// Typed facade over the ported engine. The engine itself is plain, deterministic, dependency-free logic.
import { FIT } from './fit';
import './data';
import './core';
import './pose';

export type Role = 'admin' | 'gym' | 'user';
export interface Exercise { id: string; name: string; cat: string; pat: string; diff: number; eq: string[]; muscles: string[]; avoid: string[]; an: string | null; desc: string; start: string; steps: string[]; breath: string; mistakes: string[]; easier: string; harder: string; safety: string; cam?: string; d?: { sets?: number; reps?: number; secs?: number }; off?: boolean; custom?: boolean }
export interface Food { id: string; name: string; unit: string; g: number; kcal: number; p: number; c: number; f: number; fi: number; al: string }
export interface MealItem { id: string; foodId: string | null; name: string; unit: string; qty: number; kcal: number; p: number; c: number; f: number; fi?: number; estimate?: boolean; base?: any }
export interface PlanExercise { exId: string; sets: number; reps?: number; secs?: number; rest: number; weight?: number | null; note?: string }
export interface PlanDay { dow?: number; title: string; focus?: string; objective?: string; warmup: any[]; cooldown: any[]; exercises: PlanExercise[]; estMin: number; why?: string[] }
export interface Plan { version: number; days: PlanDay[]; seed: number; createdAt: number; reason: string; changes?: string[]; summary?: string; safety?: { banner?: string } }

export const F: any = FIT;
export const EXERCISES: Exercise[] = FIT.EXERCISES;
export const EX: Record<string, Exercise> = FIT.EX;
export const FOODS: Food[] = FIT.FOODS;
export const FOOD: Record<string, Food> = FIT.FOOD;
export const pose = FIT.pose;
export const DAY: number = FIT.DAY;
export const ymd: (ms: number) => string = FIT.ymd;
export const uid: (p?: string) => string = FIT.uid;
export const clone = <T>(o: T): T => FIT.clone(o);

/** Apply admin library edits in place so the planner (which holds references) sees them. */
export function applyLibrary(overrides: { id: string; patch?: Partial<Exercise>; custom?: Exercise }[]) {
  // reset previous custom entries and flags
  for (let i = EXERCISES.length - 1; i >= 0; i--) if (EXERCISES[i].custom) { delete EX[EXERCISES[i].id]; EXERCISES.splice(i, 1); }
  EXERCISES.forEach((e) => { e.off = false; });
  overrides.forEach((o) => {
    if (o.custom) { const c = { ...o.custom, custom: true } as Exercise; EXERCISES.push(c); EX[c.id] = c; }
    else if (EX[o.id] && o.patch) Object.assign(EX[o.id], o.patch);
  });
}
export default FIT;
