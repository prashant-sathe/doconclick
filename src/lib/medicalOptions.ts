// Shared option lists so the patient's own profile and the family-member
// (dependent) booking-time form use the exact same inputs, not diverging
// free-text fields.
export const CHRONIC_OPTIONS = ["Diabetes", "Hypertension", "Asthma", "Heart Disease", "Thyroid", "Arthritis", "COPD", "Other", "None"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const FREQUENCY_OPTIONS = ["Once daily", "Twice daily", "Thrice daily", "Four times daily", "Before meals", "After meals", "At bedtime", "As needed", "Other"];
export const DURATION_OPTIONS = ["3 days", "5 days", "7 days", "10 days", "2 weeks", "1 month", "Other"];
// Autocomplete suggestions only (via <datalist>) — free text is always allowed
// since recommended-test names are too varied for a closed dropdown.
export const TEST_SUGGESTIONS = [
  "CBC (Complete Blood Count)", "Blood Sugar (Fasting)", "Blood Sugar (Random)", "HbA1c",
  "Lipid Profile", "Liver Function Test (LFT)", "Kidney Function Test (KFT)",
  "Thyroid Profile (T3 T4 TSH)", "Urine Routine", "Vitamin D", "Vitamin B12",
  "X-Ray Chest", "ECG", "Ultrasound Abdomen", "COVID-19 RT-PCR",
];
