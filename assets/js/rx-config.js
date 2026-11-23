/* Prescription settings. Edit here; every change is a normal commit.
 *
 * DOCTORS: shown in the "Prescribing doctor" list. Staff can also save a doctor on their own
 * device from the form. Only add doctors who have agreed to their details being listed here.
 *
 * PRESETS: one-tap medicine rows. Values are copied from Lifora's own prescriptions;
 * the doctor still checks and edits every row before signing. */

export const DOCTORS = [
  { name: 'Dr. Sajith S', qual: 'MBBS', reg: 'TNMC-205887' }
];

export const PRESETS = [
  { label: 'Vitamin D injection', medicine: 'Inj. Vitamin D 600000 IU', form: 'Injection', frequency: '2', duration: '2 injections at 14 days interval' },
  { label: 'Vitamin B12 injection', medicine: 'Inj. Vitamin B12 1500 mcg', form: 'Injection', frequency: '2', duration: '2 injections at 14 days interval' }
];

export const DOSAGE_FORMS = ['Tablet', 'Capsule', 'Injection', 'Syrup', 'Sachet', 'Drops', 'Cream', 'Powder'];
