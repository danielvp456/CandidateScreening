import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Add more setup options before each test is run
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Descomenta si necesitas un archivo de setup

  testEnvironment: 'jest-environment-node', // O 'jsdom' si pruebas componentes de React
  roots: ['<rootDir>/src'], // Busca pruebas solo en la carpeta src
  preset: 'ts-jest', // Usa ts-jest para transformar archivos .ts/.tsx
  moduleNameMapper: {
    // Handle module aliases (ajusta según tu tsconfig.json)
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Ignora el directorio .next al buscar archivos
  testPathIgnorePatterns: [
      "<rootDir>/node_modules/",
      "<rootDir>/.next/"
  ],
  // Asegúrate de que ts-jest transforme los archivos ts/tsx
   transform: {
     '^.+\\.(ts|tsx)$': ['ts-jest', {
       tsconfig: 'tsconfig.json', // Asegúrate que apunte a tu tsconfig
     }],
   },
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config) 