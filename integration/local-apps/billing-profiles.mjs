// Exact profiles authorized by the owner. A profile locates a session; it does
// not establish the ChatGPT account currently signed in within that session.
const profiles = Object.freeze({
  'account3@example.com': Object.freeze({ directory: 'Default', label: 'Example profile' }),
  'account2@example.com': Object.freeze({ directory: 'Profile 1', label: 'Example profile' }),
  'account6@example.com': Object.freeze({ directory: 'Profile 2', label: 'Example profile' }),
  'account4@example.com': Object.freeze({ directory: 'Profile 3', label: 'Example profile' }),
  'account1@example.com': Object.freeze({ directory: 'Profile 4', label: 'Example profile' }),
  'account5@example.com': Object.freeze({ directory: 'Profile 9', label: 'Example profile' }),
});

export function billingProfile(email) {
  if (typeof email !== 'string') return null;
  const normalized = email.toLowerCase();
  return Object.hasOwn(profiles, normalized) ? profiles[normalized] : null;
}
