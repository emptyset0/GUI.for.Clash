// Replace desktop IO, stores and UI-only utilities in the config round-trip tests.
import { stringify } from 'yaml'

export const subscriptions: Record<string, { id: string; path: string }> = {}
export const files: Record<string, string> = {}
let nextID = 0
export const sampleID = () => `test-${nextID++}`
export const generateSecureKey = () => 'test-secret'
export const APP_TITLE = 'Test'
export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export const deepAssign = (target: any, ...sources: any[]) => {
  const isObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value)
  target = isObject(target) ? target : {}
  for (const source of sources) {
    if (!isObject(source)) continue
    for (const [key, value] of Object.entries(source)) {
      if (key === '__proto__') continue
      target[key] = isObject(value) ? deepAssign(target[key], value) : value
    }
  }
  return target
}
export const stringifyNoFolding = stringify
export const ReadFile = async (path: string) => {
  if (!(path in files)) throw new Error(`Missing test file: ${path}`)
  return files[path]
}
export const WriteFile = async () => ''
export const useSubscribesStore = () => ({ getSubscribeById: (id: string) => subscriptions[id] })
export const useRulesetsStore = () => ({
  getRulesetById: () => undefined,
  getRulesetByName: () => undefined,
})
export const usePluginsStore = () => ({ onGenerateTrigger: async (config: any) => config })
export const useEnvStore = () => ({ env: { os: 'windows' } })
export default { global: { t: (key: string) => key } }
