// Visual theme overrides for the BikeHunter instance. Passed to
// <MuralBoard tokens={theme.tokens} theme={theme.mode}> by the host entry.
// Placeholder brand values — swap for their real palette during rollout.

const theme = {
  mode: 'light' as const,
  tokens: {
    '--accent': '#16a34a', // bike green
  },
}

export default theme
