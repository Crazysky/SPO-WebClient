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
  },

  /**
   * Configuration du protocole RDO
   */
  rdo: {
    // Host du serveur Directory (utiliser 'localhost' pour mock_srv et www.starpeaceonline.com pour la production.)
    directoryHost: process.env.RDO_DIR_HOST || 'localhost',

    // Ports standards du protocole
    ports: {
      directory: 1111,
    },
  },

  /**
   * Logging
   */
  logging: {
    // Niveaux: 'debug' | 'info' | 'warn' | 'error'
    level: (process.env.LOG_LEVEL as string) || 'info',
    colorize: process.env.NODE_ENV !== 'production',
  },
};

/**
 * Type-safe access to config
 */
export type Config = typeof config;
