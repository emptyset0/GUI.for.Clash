interface StartupOptions {
  isStopped: () => boolean
  probeApi: () => Promise<unknown>
  getTunEnabled: () => Promise<boolean>
  tunEnabled: boolean
  sleep: (ms: number) => Promise<unknown>
  warnTunTimeout: () => void
  now?: () => number
}

export const waitForCoreStartup = async (options: StartupOptions) => {
  const assertRunning = () => {
    if (options.isStopped()) throw 'Startup failed. Check logs for details.'
  }
  const now = options.now || Date.now

  // Check after every await as the process can exit during an API request.
  while (true) {
    assertRunning()
    const ready = await options.probeApi().catch(() => false)
    assertRunning()
    if (ready) break
    await options.sleep(500)
  }

  const start = now()
  while (options.tunEnabled) {
    assertRunning()
    const enabled = await options.getTunEnabled().catch(() => false)
    assertRunning()
    if (enabled) break
    if (now() - start >= 5_000) {
      options.warnTunTimeout()
      break
    }
    await options.sleep(500)
  }
  assertRunning()
}
