
import { ModuleOptions } from './module'

declare module '@nuxt/schema' {
  interface NuxtConfig { ['graphql-client']?: Partial<ModuleOptions> }
  interface NuxtOptions { ['graphql-client']?: ModuleOptions }
}


export { ModuleOptions, default } from './module'
