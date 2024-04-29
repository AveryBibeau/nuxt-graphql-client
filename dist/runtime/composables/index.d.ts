import type { Ref } from 'vue';
import type { AsyncData, AsyncDataOptions } from 'nuxt/app';
import type { GqlError, TokenOpts, OnGqlError } from '../../types';
import type { GqlOps, GqlClients, GqlSdkFuncs } from '#gql';
/**
 * `useGqlHeaders` allows you to set headers for all subsequent requests.
 *
 * @param {object} headers
 * @param {string} client
 *
 * @example
 * - Set headers for default client
 * ```ts
 * useGqlHeaders({ 'X-Custom-Header': 'Custom Value' })
 * ```
 *
 * - Set headers for a specific client (multi-client mode)
 * ```ts
 * useGqlHeaders({'X-Custom-Header': 'Custom Value'}, 'my-client')
 * ```
 *
 * - Reset headers for a specific client
 * ```ts
 * useGqlHeaders(null, 'my-client')
 * ```
 * */
export declare function useGqlHeaders(headers: Record<string, string>, client?: GqlClients): void;
export declare function useGqlHeaders(opts: {
    headers: Record<string, string>;
    client?: GqlClients;
    respectDefaults?: boolean;
}): void;
type GqlTokenOptions = {
    /**
     * Configure the auth token
     *
     * @default
     * `{ type: 'Bearer', name: 'Authorization' }`
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization
     * */
    config?: Omit<TokenOpts, 'value'>;
    /**
     * The name of your GraphQL clients.
     * @note defined in `nuxt.config`
     * */
    client?: GqlClients;
    /**
     * Refresh Gql Data on token change.
     * @default true
     * */
    refreshData?: boolean;
};
type GqlToken = string | null;
/**
 * `useGqlToken` adds an Authorization header to every request.
 *
 * @param {GqlToken} token The token to be used for authentication
 * @param {object} opts Options for the auth token
 * */
export declare function useGqlToken(token: GqlToken, opts?: GqlTokenOptions): void;
/**
 * `useGqlToken` adds an Authorization header to every request.
 *
 * @param {object} opts Options for the auth token
 * */
export declare function useGqlToken(opts: GqlTokenOptions & {
    token: GqlToken;
}): void;
interface GqlCors {
    mode?: RequestMode;
    credentials?: RequestCredentials;
    /**
     * The name of your GraphQL client.
     * @note defined in `nuxt.config`
     * */
    client?: GqlClients;
}
/**
 * `useGqlCors` adds CORS headers to every request.
 *
 * @param {object} opts Options for the CORS headers
 * */
export declare const useGqlCors: (opts: GqlCors) => void;
/**
 * `useGqlHost` allows you to change a client's host at runtime.
 *
 * @param {string} host The host to be used for subsequent requests
 * @param {string} client The name of your GraphQL client. Defaults to either the client named `default` or the first configured client.
 */
export declare const useGqlHost: (host: string, client?: any) => void;
export declare function useGql(): <T extends GqlOps, R extends ReturnType<GqlSdkFuncs[T]>, P extends Parameters<GqlSdkFuncs[T]>['0']>(...args: [T, P] | [{
    operation: T;
    variables?: P;
}]) => R;
/**
 * `useGqlError` captures GraphQL Errors.
 *
 * @param {OnGqlError} onError Gql error handler
 *
 * @example <caption>Log error to console.</caption>
 * ```ts
 * useGqlError((err) => {
 *    console.error(err)
 * })
 * ```
 * */
export declare const useGqlError: (onError: OnGqlError) => void;
type PickFrom<T, K extends Array<string>> = T extends Array<any> ? T : T extends Record<string, any> ? keyof T extends K[number] ? T : K[number] extends never ? T : Pick<T, K[number]> : T;
type KeysOf<T> = Array<T extends T ? keyof T extends string ? keyof T : never : never>;
/**
 * Asynchronously query data that is required to load a page or component.
 *
 * @param {Object} options
 * @param {string} options.operation Name of the query to be executed.
 * @param {string} options.variables Variables to be passed to the query.
 * @param {Object} options.options AsyncData options.
 */
export declare function useAsyncGql<T extends GqlOps, p extends Parameters<GqlSdkFuncs[T]>['0'], P extends {
    [K in keyof p]: Ref<p[K]> | p[K];
} | Omit<Ref<p>, 'value'>, d extends Awaited<ReturnType<GqlSdkFuncs[T]>>, D = d, E = GqlError, PK extends KeysOf<D> = KeysOf<D>>(options: {
    operation: T;
    variables?: P;
    options?: AsyncDataOptions<d, D, PK>;
}): AsyncData<PickFrom<D, PK>, E | null>;
/**
 * Asynchronously query data that is required to load a page or component.
 *
 * @param {string} operation Name of the query to be executed.
 * @param {string} variables Variables to be passed to the query.
 * @param {Object} options AsyncData options.
 */
export declare function useAsyncGql<T extends GqlOps, p extends Parameters<GqlSdkFuncs[T]>['0'], P extends {
    [K in keyof p]: Ref<p[K]> | p[K];
} | Omit<Ref<p>, 'value'>, d extends Awaited<ReturnType<GqlSdkFuncs[T]>>, D = d, E = GqlError, PK extends KeysOf<D> = KeysOf<D>>(operation: T, variables?: P, options?: AsyncDataOptions<d, D, PK>): AsyncData<PickFrom<D, PK>, E | null>;
export {};
