
import type { ModuleOptions } from './module'


declare module '@nuxt/schema' {
  interface NuxtConfig { ['graphql-client']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['graphql-client']?: ModuleOptions }
}

declare module 'nuxt/schema' {
  interface NuxtConfig { ['graphql-client']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['graphql-client']?: ModuleOptions }
}


export type { ModuleOptions, default } from './module'