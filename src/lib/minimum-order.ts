/** Minimum quantity applies to each variant line, not the sum across variants. */
export function minimumOrderProblem(title: string, quantity: number, minimum: number): string | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return "Quantity must be a positive whole number.";
  return quantity < minimum ? `${title} requires a minimum of ${minimum} units per variant.` : null;
}

export function assertMinimumOrderQuantity(title: string, quantity: number, minimum: number): void {
  const problem = minimumOrderProblem(title, quantity, minimum);
  if (problem) throw new Error(problem);
}
