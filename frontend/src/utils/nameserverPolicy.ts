export type NameserverPolicy = Record<string, string | string[]>

// Strings in existing profiles use the legacy comma-separated editor format.
// Native arrays must not be joined/split: resolver URLs can contain commas.
export const normalizeNameserverPolicy = (policy: NameserverPolicy): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(policy).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value.split(','),
    ]),
  )

export const generateNameserverPolicy = (policy: NameserverPolicy): NameserverPolicy =>
  Object.fromEntries(
    Object.entries(policy).map(([key, value]) => {
      if (Array.isArray(value)) return [key, [...value]]
      const servers = value.split(',')
      return [key, servers.length === 1 ? servers[0]! : servers]
    }),
  )
