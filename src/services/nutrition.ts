import FIT, { FOOD, uid, ymd, MealItem } from '../engine';
import { Repo, Actor } from '../db/repo';

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'custom'] as const;
export type Slot = (typeof SLOTS)[number];
export interface Meal { id: string; ownerId: string; date: string; slot: Slot; label?: string; items: MealItem[] }
const mealId = (owner: string, date: string, slot: Slot, label?: string) => 'meal_' + owner + '_' + date + '_' + slot + (label ? '_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '');

export const listMeals = (repo: Repo, a: Actor, userId = a.id) => repo.list(a, 'meal', { ownerId: userId }) as unknown as Meal[];
export function addFood(repo: Repo, a: Actor, date: string, slot: Slot, foodId: string, qty: number, label?: string): MealItem {
  if (!FOOD[foodId]) throw new Error('Unknown food'); if (!(qty > 0) || qty > 50) throw new Error('Enter a serving between 0.1 and 50.');
  return pushItem(repo, a, date, slot, FIT.makeItem(foodId, qty), label);
}
export function addCustom(repo: Repo, a: Actor, date: string, slot: Slot, i: { name: string; kcal: number; p?: number; c?: number; f?: number; fi?: number; qty?: number; estimate?: boolean }, label?: string): MealItem {
  if (!i.name.trim()) throw new Error('Give the food a name.'); if (!(i.kcal >= 0) || i.kcal > 5000) throw new Error('Calories must be between 0 and 5000.');
  const it = FIT.customItem(i.name.trim(), i.kcal, i.p, i.c, i.f, i.qty || 1, i.fi); if (i.estimate) it.estimate = true;
  return pushItem(repo, a, date, slot, it, label);
}
function pushItem(repo: Repo, a: Actor, date: string, slot: Slot, item: MealItem, label?: string): MealItem {
  const id = mealId(a.id, date, slot, label); const cur = repo.get(a, 'meal', id) as unknown as Meal | undefined;
  repo.put(a, 'meal', { id, ownerId: a.id, date, slot, label, items: [...(cur?.items || []), item] } as any); return item;
}
/** Correct a logged item: change the serving quantity and/or swap the food it was identified as. Values are recalculated. */
export function editItem(repo: Repo, a: Actor, mealIdv: string, itemId: string, p: { qty?: number; foodId?: string; kcal?: number; protein?: number; carbs?: number; fat?: number; fibre?: number }): MealItem {
  const m = repo.get(a, 'meal', mealIdv) as unknown as Meal | undefined; const i = m?.items.findIndex((x) => x.id === itemId) ?? -1; if (!m || i < 0) throw new Error('Meal item not found');
  let it = m.items[i];
  if (p.foodId || p.qty) { const q = p.qty ?? it.qty; if (!(q > 0) || q > 50) throw new Error('Enter a serving between 0.1 and 50.'); it = FIT.recalcItem(it, p.foodId ?? it.foodId, q); }
  if (p.kcal != null) it = { ...it, kcal: Math.max(0, Math.round(p.kcal)), estimate: true };
  if (p.protein != null) it = { ...it, p: p.protein }; if (p.carbs != null) it = { ...it, c: p.carbs }; if (p.fat != null) it = { ...it, f: p.fat }; if (p.fibre != null) it = { ...it, fi: p.fibre };
  m.items[i] = it; repo.put(a, 'meal', m as any); return it;
}
export function deleteItem(repo: Repo, a: Actor, mealIdv: string, itemId: string): void {
  const m = repo.get(a, 'meal', mealIdv) as unknown as Meal | undefined; if (!m) return;
  m.items = m.items.filter((x) => x.id !== itemId);
  if (!m.items.length) repo.del(a, 'meal', mealIdv); else repo.put(a, 'meal', m as any);
}
export const targetsFor = (repo: Repo, a: Actor) => {
  const p = repo.get(a, 'profile', a.id); if (!p) return null;
  const base = FIT.nutritionTargets(p); const ov = repo.getKV(a, a.id, 'nutOverride');
  return base ? { ...base, ...(ov || {}), overridden: !!ov } : null;
};
export function setTargetOverride(repo: Repo, a: Actor, o: { kcal?: number; protein?: number } | null) {
  if (o && ((o.kcal != null && (o.kcal < 1200 || o.kcal > 5000)) || (o.protein != null && (o.protein < 20 || o.protein > 300)))) throw new Error('Targets must stay in a safe range (1200-5000 kcal, 20-300 g protein).');
  repo.setKV(a, a.id, 'nutOverride', o);
}
export interface DayView { date: string; totals: { kcal: number; p: number; c: number; f: number; fi: number }; remaining: { kcal: number; p: number } | null; bySlot: Record<string, Meal[]> }
export function dayView(repo: Repo, a: Actor, date: string): DayView {
  const meals = listMeals(repo, a), tg = targetsFor(repo, a), totals = FIT.dayTotals(meals, date);
  const bySlot: Record<string, Meal[]> = {}; meals.filter((m) => m.date === date).forEach((m) => (bySlot[m.slot] = [...(bySlot[m.slot] || []), m]));
  return { date, totals, remaining: tg ? { kcal: tg.kcal - totals.kcal, p: tg.protein - totals.p } : null, bySlot };
}
export const weekView = (repo: Repo, a: Actor, endMs: number) => FIT.weekNutrition(listMeals(repo, a), endMs);
export const searchFoods = (q: string) => FIT.searchFoods(q);
