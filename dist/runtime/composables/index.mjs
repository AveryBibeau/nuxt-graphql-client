import { defu } from "defu";
import { hash } from "ohash";
import { unref, isRef, reactive } from "vue";
import { GqlSdks, GqClientOps } from "#gql";
import { useState, useCookie, useNuxtApp, useAsyncData, refreshNuxtData, useRuntimeConfig } from "#imports";
const getGqlClient = (client, state) => {
  if (!state) {
    state = useGqlState();
  }
  return client || (state.value?.default ? "default" : Object.keys(state.value)[0]);
};
const useGqlState = () => {
  const nuxtApp = useNuxtApp();
  if (!nuxtApp._gqlState) {
    throw new Error("GQL State is not available.");
  }
  return nuxtApp?._gqlState;
};
const setGqlState = ({ client, patch }) => {
  const state = useGqlState();
  client = getGqlClient(client, state);
  const resetToken = patch?.token && !patch.token.value;
  const resetHeaders = patch?.headers && !Object.keys(patch.headers).length;
  state.value[client].options = defu(patch, {
    ...state.value[client]?.options,
    ...resetToken && { token: void 0 },
    ...resetHeaders && { headers: void 0 }
  });
};
export function useGqlHeaders(...args) {
  const client = args[1] || args?.[0]?.client;
  let headers = args[0] && typeof args[0] !== "undefined" && "headers" in args[0] ? args[0].headers : args[0];
  const respectDefaults = args?.[0]?.respectDefaults;
  headers = headers || {};
  setGqlState({ client, patch: { headers } });
  if (respectDefaults && !Object.keys(headers).length) {
    const defaultHeaders = useRuntimeConfig()?.public?.["graphql-client"]?.clients?.[client || "default"]?.headers;
    const serverHeaders = import.meta.server && (typeof defaultHeaders?.serverOnly === "object" && defaultHeaders?.serverOnly) || void 0;
    if (defaultHeaders?.serverOnly) {
      delete defaultHeaders.serverOnly;
    }
    headers = { ...defaultHeaders, ...serverHeaders };
    setGqlState({ client, patch: { headers } });
  }
}
export function useGqlToken(...args) {
  args = args || [];
  const config = args[0]?.config || args?.[1]?.config;
  const refreshData = args[0]?.refreshData ?? args?.[1]?.refreshData ?? true;
  let client = args[0]?.client || args?.[1]?.client;
  let token = typeof args[0] === "string" || args?.[0] === null ? args[0] : args?.[0]?.token;
  if (token) {
    token = token.trim();
  }
  client = getGqlClient(client);
  const tokenStorage = useRuntimeConfig()?.public?.["graphql-client"]?.clients?.[client]?.tokenStorage;
  if (token !== void 0 && typeof tokenStorage === "object") {
    if (tokenStorage.mode === "cookie") {
      const cookie = useCookie(tokenStorage.name, tokenStorage.cookieOptions);
      cookie.value = token;
    }
    if (import.meta.client && tokenStorage.mode === "localStorage") {
      if (token !== null) {
        localStorage.setItem(tokenStorage.name, token);
      } else {
        localStorage.removeItem(tokenStorage.name);
      }
    }
    if (refreshData) {
      const nuxtApp = useNuxtApp();
      const _gqlDataKeys = Object.keys(nuxtApp.payload.data).filter((k) => k.startsWith("gql:data:"));
      if (_gqlDataKeys.length) {
        refreshNuxtData(_gqlDataKeys);
      }
    }
  }
  setGqlState({ client, patch: { token: { ...config, value: token } } });
}
export const useGqlCors = (opts) => {
  const { mode, credentials, client } = opts || {};
  setGqlState({ client, patch: { mode, credentials } });
};
export const useGqlHost = (host, client) => {
  const state = useGqlState();
  client = getGqlClient(client, state);
  if (!host.match(/^https?:\/\//)) {
    const initialHost = useRuntimeConfig()?.public?.["graphql-client"]?.clients?.[client]?.host;
    if (initialHost?.endsWith("/") && host.startsWith("/")) {
      host = host.slice(1);
    }
    host = `${initialHost}${host}`;
  }
  state.value?.[client].instance.setEndpoint(host);
};
export function useGql() {
  const state = useGqlState();
  const errState = useGqlErrorState();
  return (...args) => {
    const operation = (typeof args?.[0] !== "string" && "operation" in args?.[0] ? args[0].operation : args[0]) ?? void 0;
    const variables = (typeof args?.[0] !== "string" && "variables" in args?.[0] ? args[0].variables : args[1]) ?? void 0;
    const client = Object.keys(GqClientOps).find((k) => GqClientOps[k].includes(operation)) ?? "default";
    const { instance } = state.value?.[client];
    if (!instance) {
      throw new Error("Invalid GraphQL Operation");
    }
    return GqlSdks[client](instance, async (action, operationName, operationType) => {
      try {
        return await action();
      } catch (err) {
        errState.value = {
          client,
          operationType,
          operationName,
          statusCode: err?.response?.status,
          gqlErrors: err?.response?.errors || err?.response?.message && [{ message: err?.response?.message }] || []
        };
        if (state.value.onError) {
          state.value.onError(errState.value);
        }
        throw errState.value;
      }
    })[operation](variables);
  };
}
export const useGqlError = (onError) => {
  useGqlState().value.onError = import.meta.client ? onError : process.env.NODE_ENV !== "production" && ((e) => console.error("[nuxt-graphql-client] [GraphQL error]", e)) || void 0;
  const errState = useGqlErrorState();
  if (!errState.value) {
    return;
  }
  onError(errState.value);
};
const useGqlErrorState = () => useState("_gqlErrors", () => null);
export function useAsyncGql(...args) {
  const toReactive = (v) => v && isRef(v) ? v : reactive(v);
  const options = (typeof args?.[0] !== "string" && "options" in args?.[0] ? args[0].options : args[2]) ?? {};
  const operation = (typeof args?.[0] !== "string" && "operation" in args?.[0] ? args[0].operation : args[0]) ?? void 0;
  const variables = (typeof args?.[0] !== "string" && "variables" in args?.[0] ? toReactive(args[0].variables) : args[1] && toReactive(args[1])) ?? void 0;
  if (variables) {
    options.watch = options.watch || [];
    options.watch.push(variables);
  }
  const key = `gql:data:${hash({ operation, variables })}`;
  return useAsyncData(key, () => useGql()(operation, unref(variables)), options);
}
