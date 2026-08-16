// Standard adult BMI thresholds: <18.5 Underweight, 18.5–24.9 Normal,
// 25–29.9 Overweight, >=30 Obesity.
export interface BMIResult {
  value: number;
  category: "Underweight" | "Normal" | "Overweight" | "Obesity";
}

export function computeBMI(heightCm: number, weightKg: number): BMIResult | null {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const heightM = heightCm / 100;
  const value = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  const category =
    value < 18.5 ? "Underweight" :
    value < 25 ? "Normal" :
    value < 30 ? "Overweight" : "Obesity";
  return { value, category };
}

export function bmiCategoryClasses(category: BMIResult["category"]): string {
  switch (category) {
    case "Underweight": return "text-amber-600 bg-amber-50";
    case "Normal": return "text-emerald-600 bg-emerald-50";
    case "Overweight": return "text-orange-600 bg-orange-50";
    case "Obesity": return "text-red-600 bg-red-50";
  }
}
