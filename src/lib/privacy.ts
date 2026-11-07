// The privacy notice clients agree to when they join. Plain text so it's easy to edit.
// NOT legal advice: Freddie should check it fits his business (and register with the ICO if needed).

export const PRIVACY_CONTACT = 'freddie@freddiebutlerpt.com';
export const PRIVACY_UPDATED = '7 November 2026';

export const PRIVACY_NOTICE: { heading: string; body: string }[] = [
  {
    heading: 'Who looks after your data',
    body: `Freddie Butler Personal Training ("your coach") is responsible for the data in this app. Contact: ${PRIVACY_CONTACT}.`
  },
  {
    heading: 'What is stored',
    body: 'Your email address and name; the workouts you log (exercises, sets, weights, reps, effort, notes); your programs; and, if you use them, your bodyweight and daily check-ins (sleep, energy, soreness, stress). Bodyweight and check-ins count as health data.'
  },
  {
    heading: 'Why',
    body: 'So your coach can plan your training, follow your progress and adjust your program. Nothing is used for advertising or sold.'
  },
  {
    heading: 'Legal basis',
    body: 'Your explicit consent, which you give by ticking the box when you join. You can withdraw it at any time by leaving your coach (Settings → Account), which stops them seeing your data.'
  },
  {
    heading: 'Who can see it',
    body: 'You, and your coach while you are linked. It is stored with Supabase (our database provider) in London, UK, and sign-in emails are sent through our email provider. No one else.'
  },
  {
    heading: 'How long',
    body: 'Until you delete your account. "Delete my account" in Settings → Account removes everything stored in the cloud straight away. The copy on your own phone stays until you remove it.'
  },
  {
    heading: 'Your rights',
    body: 'You can see and export your data (Settings → Export), correct it in the app, delete it, or ask your coach about it at any time. If you are unhappy with how your data is handled you can complain to the Information Commissioner’s Office (ico.org.uk).'
  }
];
