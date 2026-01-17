/**
 * Configuration centralisée pour SPO v2
 *
 * Utilise les variables d'environnement avec des valeurs par défaut.
 * Permet de configurer facilement dev/prod et mock_srv.
 */

export const config = {
  /**
   * Configuration du serveur WebSocket
   */
  server: {
    port: Number(process.env.PORT) || 8080,
    websocketPath: '/ws',
    publicDir: 'public',
  },

  /**
   * Configuration du protocole RDO
   */
  rdo: {
    // Host du serveur Directory (utiliser 'localhost' pour mock_srv)
    directoryHost: process.env.RDO_DIR_HOST || 'www.starpeaceonline.com',

    // Ports standards du protocole
    ports: {
      directory: 1111,
      mapService: 6000,
      constructionService: 7001,
    },

    // Timeouts et limites
    requestTimeout: Number(process.env.RDO_TIMEOUT) || 15000, // 15 secondes

    // ServerBusy polling configuration
    serverBusyCheckIntervalMs: 2000, // Check every 2 seconds
    maxBufferSize: 5, // Maximum buffered requests when server is busy

    // Map-specific throttling
    maxConcurrentMapRequests: 3, // Maximum 3 zone requests at once

    // Retry logic (for future implementation)
    maxRetries: 3,
    retryDelayMs: 1000,
  },

  /**
   * WebSocket client configuration
   */
  client: {
    reconnectMaxAttempts: 5,
    reconnectDelayMs: 1000,
    reconnectBackoffMultiplier: 1.5, // Exponential delay
  },

  /**
   * Map rendering configuration
   */
  renderer: {
    defaultScale: 8, // Pixels per map cell
    zoneCheckDebounceMs: 500, // Delay before new zone request
  },

  /**
   * Logging
   */
  logging: {
    // Niveaux: 'debug' | 'info' | 'warn' | 'error'
    level: (process.env.LOG_LEVEL as any) || 'info',
    colorize: process.env.NODE_ENV !== 'production',
  },
};

/**
 * Type-safe access to config
 */
export type Config = typeof config;
