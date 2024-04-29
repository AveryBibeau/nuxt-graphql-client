import type { Ref } from 'vue';
import type { GqlClients } from '#gql';
declare const _default: any;
export default _default;
declare module '#app' {
    interface RuntimeNuxtHooks {
        /**
         * `gql:auth:init` hook specifies how the authentication token is retrieved.
         */
        'gql:auth:init': (params: {
            client: GqlClients;
            token: Ref<string | undefined>;
        }) => void;
    }
}
