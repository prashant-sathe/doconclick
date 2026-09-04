// Shared Terms of Service + Privacy Policy content — rendered by the
// first-login acceptance modal (AuthProvider) and by the read-only
// /patient/profile/terms and /doctor/profile/terms pages, so both stay
// in sync from one source. Bump LEGAL_LAST_UPDATED whenever the text below
// changes materially.
export const LEGAL_LAST_UPDATED = "September 4, 2026";

export type LegalSection = { heading: string; body: string[] };

export const TERMS_OF_SERVICE: LegalSection[] = [
  {
    heading: "1. About DocOnClick",
    body: [
      "DocOnClick is a technology platform that connects patients with independent, verified doctors for home visits, clinic appointments, and video consultations. DocOnClick is not a hospital or clinic and does not itself practice medicine — every diagnosis, prescription, and treatment decision is made solely by the treating doctor.",
    ],
  },
  {
    heading: "2. Eligibility & Accounts",
    body: [
      "You must be at least 18 years old to create a patient or doctor account, or be booking on behalf of a dependant added to your family profile. You are responsible for keeping your login credentials confidential and for all activity under your account.",
      "Doctors must hold a valid medical registration in India and agree to keep their qualification, registration, and KYC documents accurate and up to date. DocOnClick may verify these documents before or after a doctor starts accepting appointments, and may suspend a doctor profile if verification fails or documents lapse.",
    ],
  },
  {
    heading: "3. Booking & Consultations",
    body: [
      "Patients can book a Home Visit, Clinic Visit, or Video Consultation, subject to the doctor's availability, service radius, and consultation fees as shown at the time of booking. A booking is confirmed only once the doctor accepts the request.",
      "For home visits, the doctor's live location is shared with the patient while the visit is on the way, purely to help you track arrival — this sharing stops once the visit is completed or cancelled.",
      "Video and clinic consultations, and the chat linked to an appointment, remain open only for the duration of that appointment and close once it is marked complete.",
    ],
  },
  {
    heading: "4. Medical Disclaimer",
    body: [
      "DocOnClick is not intended for medical emergencies. If you or someone with you is experiencing a life-threatening emergency, call your local emergency number (e.g. 108/112 in India) or go to the nearest emergency room immediately instead of booking through the app.",
      "Prescriptions, diagnoses, and medical advice given during a consultation are the professional judgment of the treating doctor. DocOnClick does not review, edit, or guarantee the accuracy of clinical decisions made by doctors on the platform.",
    ],
  },
  {
    heading: "5. Payments, Fees & Cancellations",
    body: [
      "Consultation fees, the platform's convenience fee, and any applicable coupon discounts are shown before you confirm a booking. Payments are processed through our payment partner; DocOnClick does not store your full card or UPI credentials.",
      "Doctors are paid out their consultation earnings, net of the platform's commission, on the schedule shown in their earnings dashboard. Refund and cancellation eligibility depends on how far in advance a booking is cancelled and whether the doctor has already started travelling or begun the consultation.",
    ],
  },
  {
    heading: "6. Reviews & Conduct",
    body: [
      "Patients may leave a rating and review after a completed consultation. Reviews must reflect a genuine experience and must not contain abusive, defamatory, or unlawful content — DocOnClick may remove reviews that violate this.",
      "Abusive behaviour towards doctors, patients, or support staff, fraudulent bookings, or attempts to circumvent the platform's payment or verification systems may result in suspension or termination of your account.",
    ],
  },
  {
    heading: "7. Changes to These Terms",
    body: [
      "We may update these Terms from time to time to reflect new features or legal requirements. If a change is material, we will ask you to re-accept the updated Terms the next time you sign in. Continued use of DocOnClick after a change means you accept the updated Terms.",
    ],
  },
  {
    heading: "8. Contact",
    body: [
      "Questions about these Terms can be sent to support@doconclick.com or raised through Help & Support in the app.",
    ],
  },
];

export const PRIVACY_POLICY: LegalSection[] = [
  {
    heading: "1. Information We Collect",
    body: [
      "Account details: your name, mobile number, email, and password (stored encrypted).",
      "Health information you choose to share: symptoms/reason for a visit, allergies, chronic conditions, blood group, height/weight, and emergency contact — used only to help your doctor provide care.",
      "Location data: your saved home address and search radius (to match you with nearby doctors), and — during an active home visit — the doctor's live location shared with you for tracking.",
      "Doctor verification documents: medical registration certificate, degree certificate, KYC document, and bank details, collected only from doctor accounts for verification and payouts.",
      "Usage data: appointments booked, messages exchanged with a doctor for an active consultation, payment records, coupon usage, and app notifications/push-token data needed to alert you about your bookings.",
    ],
  },
  {
    heading: "2. How We Use Your Information",
    body: [
      "To create and run your account, match you with doctors, process bookings and payments, and let doctors and patients communicate about an active appointment.",
      "To verify doctor credentials before they can accept appointments, and to pay out doctor earnings.",
      "To send booking-related notifications (appointment accepted, doctor on the way, payment reminders) and, if you opt in, service updates or offers.",
      "To investigate complaints, prevent fraud/abuse, and comply with legal obligations.",
    ],
  },
  {
    heading: "3. Who We Share It With",
    body: [
      "The doctor you book with sees the health information and location relevant to that appointment. We do not sell your personal data.",
      "Our payment partner processes payments on our behalf and receives the information needed to complete a transaction. Cloud storage and hosting providers store your data (including uploaded documents/photos) securely on our behalf.",
      "We may disclose information if required by law, court order, or to protect the safety of our users.",
    ],
  },
  {
    heading: "4. Data Retention & Security",
    body: [
      "We retain your account and appointment records for as long as your account is active and as needed to meet legal/accounting requirements afterwards. Uploaded documents and photos are stored on encrypted cloud storage.",
      "We use industry-standard measures (encrypted passwords, HTTPS, access controls) to protect your data, but no system can be guaranteed 100% secure.",
    ],
  },
  {
    heading: "5. Your Choices",
    body: [
      "You can review and update most of your profile information (address, emergency contact, medical details, search radius, notification preferences) directly from Settings at any time.",
      "You can request deletion of your account and associated personal data by contacting support@doconclick.com, subject to records we are legally required to retain (e.g. completed transaction history).",
    ],
  },
  {
    heading: "6. Children's Privacy",
    body: [
      "DocOnClick accounts are for adults. A minor may only be booked for as a dependant under a parent/guardian's patient account — we do not knowingly collect account credentials directly from minors.",
    ],
  },
  {
    heading: "7. Changes to This Policy",
    body: [
      "We may update this Privacy Policy as our features evolve. Material changes will be flagged for re-acceptance the next time you sign in.",
    ],
  },
  {
    heading: "8. Contact",
    body: [
      "For any privacy question or data request, write to support@doconclick.com or use Help & Support in the app.",
    ],
  },
];
