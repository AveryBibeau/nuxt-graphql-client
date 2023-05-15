import { readFileSync, promises, existsSync, statSync } from 'fs';
import { defu } from 'defu';
import { upperFirst } from 'scule';
import { useLogger, defineNuxtModule, createResolver, addPlugin, addTemplate, addImportsDir, extendViteConfig, resolveFiles } from '@nuxt/kit';
import { generate as generate$1 } from '@graphql-codegen/cli';
import { parse } from 'graphql';
import { genExport } from 'knitwork';

const name = "nuxt-graphql-client";
const version = "0.2.27";

function prepareConfig(options) {
  const prepareSchema = (v) => {
    if (v.schema) {
      v.schema = options.resolver?.resolve(v.schema);
      return [v.schema];
    }
    const host = v?.introspectionHost || v.host;
    if (!v?.token?.value && !v?.headers && !v?.codegenHeaders) {
      return [host];
    }
    const token = v?.token?.value && !v?.token?.type ? v?.token?.value : `${v?.token?.type} ${v?.token?.value}`.trim();
    const serverHeaders = typeof v?.headers?.serverOnly === "object" && v?.headers?.serverOnly;
    if (v?.headers?.serverOnly) {
      delete v.headers.serverOnly;
    }
    const headers = {
      ...v?.headers && { ...v.headers, ...serverHeaders },
      ...token && { [v.token.name]: token },
      ...v?.codegenHeaders
    };
    return [{ [host]: { headers } }];
  };
  const codegenConfig = {
    skipTypename: options?.skipTypename,
    useTypeImports: options?.useTypeImports,
    dedupeFragments: options?.dedupeFragments,
    gqlImport: "graphql-request#gql",
    onlyOperationTypes: options.onlyOperationTypes,
    namingConvention: {
      enumValues: "change-case-all#upperCaseFirst"
    },
    avoidOptionals: options?.avoidOptionals
  };
  const generates = Object.entries(options.clients || {}).reduce((acc, [k, v]) => {
    if (!options?.clientDocs?.[k]?.length) {
      return acc;
    }
    return {
      ...acc,
      [`${k}.ts`]: {
        config: codegenConfig,
        schema: prepareSchema(v),
        plugins: options.plugins,
        documents: options?.clientDocs?.[k] || []
      }
    };
  }, {});
  return { silent: options.silent, generates };
}
async function generate(options) {
  const config = prepareConfig(options);
  return await generate$1(config, false);
}

const mapDocsToClients = (documents, clients) => {
  const mappedDocs = /* @__PURE__ */ new Set();
  const docsWithClient = (client) => documents.filter((d) => !mappedDocs.has(d)).filter((file) => {
    const clientInExt = new RegExp(`\\.${client}\\.(gql|graphql)$`);
    const clientInPath = new RegExp(`\\/${client}\\/(?=${file.split("/").pop()?.replace(/\./g, "\\.")})`);
    const clientSpecified = clientInExt.test(file) || clientInPath.test(file);
    if (clientSpecified) {
      mappedDocs.add(file);
    }
    return clientSpecified;
  });
  const docsWithoutClient = documents.filter((d) => !mappedDocs.has(d)).filter((file) => {
    const clientInExt = /\.\w+\.(gql|graphql)$/.test(file);
    const clientInPath = new RegExp(`\\/(${clients.join("|")})\\/(?=${file.split("/").pop()?.replace(/\./g, "\\.")})`).test(file);
    return !clientInExt && !clientInPath;
  });
  return clients.reduce((acc, client) => {
    const isDefault = client === "default" || !clients.includes("default") && client === clients[0];
    acc[client] = !isDefault ? docsWithClient(client) : [...docsWithClient(client), ...docsWithoutClient];
    return acc;
  }, {});
};
const extractGqlOperations = (docs) => {
  const entries = {};
  for (const doc of docs) {
    const definitions = parse(readFileSync(doc, "utf-8"))?.definitions;
    for (const op of definitions) {
      const name = op?.name?.value;
      const operation = op.loc?.source.body.slice(op.loc.start, op.loc.end) || void 0;
      if (name && operation) {
        entries[name] = operation;
      }
    }
  }
  return entries;
};

async function prepareContext(ctx, prefix) {
  if (ctx.clientDocs) {
    await prepareOperations(ctx);
  }
  if (ctx.template) {
    prepareTemplate(ctx);
  }
  ctx.fns = Object.values(ctx.template || {}).reduce((acc, template) => {
    const fns = template.match(ctx?.codegen ? /\w+\s*(?=\(variables)/g : /\w+(?=:\s\(variables)/g)?.sort() || [];
    return [...acc, ...fns];
  }, []);
  const fnName = (fn) => prefix + upperFirst(fn);
  const fnExp = (fn, typed = false) => {
    const name = fnName(fn);
    if (!typed) {
      return `export const ${name} = (...params) => useGql()('${fn}', ...params)`;
    }
    return `  export const ${name}: (...params: Parameters<GqlSdkFuncs['${fn}']>) => ReturnType<GqlSdkFuncs['${fn}']>`;
  };
  ctx.clients = ctx.clients?.filter((c) => ctx.clientDocs?.[c]?.length);
  ctx.generateImports = () => [
    "import { useGql } from '#imports'",
    ...ctx.clients.map((client) => `import { getSdk as ${client}GqlSdk } from '#gql/${client}'`),
    "export const GqlSdks = {",
    ...ctx.clients.map((client) => `  ${client}: ${client}GqlSdk,`),
    "}",
    `export const GqClientOps = ${JSON.stringify(ctx.clientOps)}`,
    ...ctx.fns.map((f) => fnExp(f))
  ].join("\n");
  ctx.generateDeclarations = () => [
    ...!ctx.codegen ? [] : ctx.clients.map((client) => `import { getSdk as ${client}GqlSdk } from '#gql/${client}'`),
    ...Object.entries(ctx.clientTypes || {}).map(([k, v]) => genExport(`#gql/${k}`, v)),
    "declare module '#gql' {",
    `  type GqlClients = '${ctx.clients?.join("' | '") || "default"}'`,
    `  type GqlOps = '${Object.values(ctx.clientOps).flat().join("' | '")}'`,
    `  const GqClientOps = ${JSON.stringify(ctx.clientOps)}`,
    ...!ctx.codegen ? [] : [
      "  const GqlSdks = {",
      ...ctx.clients.map((client) => `    ${client}: ${client}GqlSdk,`),
      "  }",
      ...ctx.fns.map((f) => fnExp(f, true)),
      `  type GqlSdkFuncs = ${ctx.clients?.map((c) => `ReturnType<typeof ${c}GqlSdk>`).join(" & ") || "any"}`
    ],
    "}"
  ].join("\n");
  ctx.fnImports = ctx.fns.map((fn) => ({ from: "#gql", name: fnName(fn) }));
}
async function prepareOperations(ctx) {
  const scanDoc = async (doc, client) => {
    const { definitions } = parse(await promises.readFile(doc, "utf8"));
    const operations = definitions.map(({ name }) => {
      if (!name?.value) {
        throw new Error(`Operation name missing in: ${doc}`);
      }
      return name.value;
    });
    for (const op of operations) {
      if (ctx.clientOps?.[client]?.includes(op)) {
        continue;
      }
      ctx.clientOps?.[client].push(op);
    }
  };
  for await (const [client, docs] of Object.entries(ctx?.clientDocs || {})) {
    for await (const doc of docs) {
      await scanDoc(doc, client);
    }
  }
}
function prepareTemplate(ctx) {
  if (!ctx.codegen) {
    return;
  }
  ctx.clientTypes || (ctx.clientTypes = {});
  ctx.clientTypes = Object.entries(ctx.template || {}).reduce((acc, [key, template]) => {
    const results = template.match(/^export\stype\s\w+(?=\s=\s)/gm)?.filter((e) => !["Scalars", "SdkFunctionWrapper", "Sdk"].some((f) => e.includes(f))).map((e) => e.replace("export type ", ""));
    if (!results) {
      return acc;
    }
    return { ...acc, [key]: results };
  }, {});
}
const mockTemplate = (operations) => {
  const GqlFunctions = [];
  for (const [k, v] of Object.entries(operations)) {
    GqlFunctions.push(`    ${k}: (variables = undefined, requestHeaders = undefined) => withWrapper((wrappedRequestHeaders) => client.request(\`${v}\`, variables, {...requestHeaders, ...wrappedRequestHeaders}), '${k}', 'query')`);
  }
  return [
    "export function getSdk(client, withWrapper = (action, _operationName, _operationType) => action()) {",
    "  return {",
    GqlFunctions.join(",\n"),
    "  }",
    "}"
  ].join("\n");
};

const logger = useLogger("nuxt-graphql-client");
const module = defineNuxtModule({
  meta: {
    name,
    version,
    configKey: "graphql-client",
    compatibility: {
      nuxt: "^3.0.0-rc.9"
    }
  },
  defaults: {
    clients: {},
    watch: true,
    codegen: true,
    autoImport: true,
    tokenStorage: true,
    functionPrefix: "Gql"
  },
  async setup(opts, nuxt) {
    const resolver = createResolver(import.meta.url);
    const srcResolver = createResolver(nuxt.options.srcDir);
    nuxt.options.build.transpile.push(resolver.resolve("runtime"));
    const config = defu(
      {},
      nuxt.options.runtimeConfig.public["graphql-client"],
      nuxt.options.runtimeConfig.public.gql,
      opts
    );
    const codegenDefaults = {
      silent: true,
      skipTypename: true,
      useTypeImports: true,
      dedupeFragments: true,
      disableOnBuild: false,
      onlyOperationTypes: true,
      avoidOptionals: false
    };
    config.codegen = !!config.codegen && defu(config.codegen, codegenDefaults);
    config.tokenStorage = !!config.tokenStorage && defu(config.tokenStorage, {
      mode: "cookie",
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === "production"
      }
    });
    const ctx = {
      clientOps: {},
      fnImports: [],
      clients: Object.keys(config.clients),
      codegen: !config?.codegen ? false : !(!nuxt.options._prepare && !nuxt.options.dev) ? nuxt.options._prepare || nuxt.options.dev : !config?.codegen?.disableOnBuild
    };
    if (!ctx?.clients?.length) {
      const host = process.env.GQL_HOST || nuxt.options.runtimeConfig.public.GQL_HOST;
      const clientHost = process.env.GQL_CLIENT_HOST || nuxt.options.runtimeConfig.public.GQL_CLIENT_HOST;
      if (!host) {
        logger.warn("No GraphQL clients configured. Skipping module setup.");
        return;
      }
      ctx.clients = ["default"];
      config.clients = !clientHost ? { default: host } : { default: { host, clientHost } };
    }
    nuxt.options.runtimeConfig["graphql-client"] = { clients: {} };
    nuxt.options.runtimeConfig.public["graphql-client"] = defu(nuxt.options.runtimeConfig.public["graphql-client"], { clients: {} });
    const clientDefaults = {
      token: { type: "Bearer", name: "Authorization" },
      proxyCookies: true,
      tokenStorage: config.tokenStorage,
      preferGETQueries: config?.preferGETQueries ?? false
    };
    const defaultClient = config?.clients?.default && "default" || Object.keys(config.clients)[0];
    for (const [k, v] of Object.entries(config.clients)) {
      const conf = defu(typeof v !== "object" ? { host: v } : { ...v, token: typeof v.token === "string" ? { value: v.token } : v.token }, {
        ...clientDefaults,
        ...typeof v === "object" && typeof v.token !== "string" && v?.token?.type === null && { token: { ...clientDefaults.token, type: null } }
      });
      const runtimeHost = k === defaultClient ? process.env.GQL_HOST : process.env?.[`GQL_${k.toUpperCase()}_HOST`];
      if (runtimeHost) {
        conf.host = runtimeHost;
      }
      const runtimeClientHost = k === defaultClient ? process.env.GQL_CLIENT_HOST : process.env?.[`GQL_${k.toUpperCase()}_CLIENT_HOST`];
      if (runtimeClientHost) {
        conf.clientHost = runtimeClientHost;
      }
      if (!conf?.host) {
        logger.warn(`GraphQL client (${k}) is missing it's host.`);
        return;
      }
      const runtimeToken = k === defaultClient ? process.env.GQL_TOKEN : process.env?.[`GQL_${k.toUpperCase()}_TOKEN`];
      if (runtimeToken) {
        conf.token = { ...conf.token, value: runtimeToken };
      }
      const runtimeTokenName = k === defaultClient ? process.env.GQL_TOKEN_NAME : process.env?.[`GQL_${k.toUpperCase()}_TOKEN_NAME`];
      if (runtimeTokenName) {
        conf.token = { ...conf.token, name: runtimeTokenName };
      }
      if (conf.tokenStorage) {
        conf.tokenStorage.name = conf.tokenStorage?.name || `gql:${k}`;
      }
      const schema = conf?.schema && srcResolver.resolve(conf.schema);
      if (schema && !existsSync(schema)) {
        delete conf.schema;
        logger.warn(`[nuxt-graphql-client] The Schema provided for the (${k}) GraphQL Client does not exist. \`host\` will be used as fallback.`);
      }
      ctx.clientOps[k] = [];
      config.clients[k] = JSON.parse(JSON.stringify(conf));
      nuxt.options.runtimeConfig.public["graphql-client"].clients[k] = JSON.parse(JSON.stringify(conf));
      if (conf?.token?.value) {
        nuxt.options.runtimeConfig["graphql-client"].clients[k] = { token: conf.token };
        if (!conf?.retainToken) {
          nuxt.options.runtimeConfig.public["graphql-client"].clients[k].token.value = void 0;
        }
      }
    }
    const documentPaths = nuxt.options._layers.map((layer) => layer.config.srcDir);
    if (config.documentPaths) {
      for (const path of config.documentPaths) {
        const dir = srcResolver.resolve(path);
        if (existsSync(dir)) {
          documentPaths.push(dir);
        } else {
          logger.warn(`[nuxt-graphql-client] Invalid document path: ${dir}`);
        }
      }
    }
    const gqlMatch = "**/*.{gql,graphql}";
    async function generateGqlTypes(hmrDoc) {
      const documents = [];
      for await (const path of documentPaths) {
        const files = (await resolveFiles(path, [gqlMatch, "!**/schemas"], { followSymbolicLinks: false })).filter(allowDocument);
        documents.push(...files);
      }
      const plugins = ["typescript"];
      if (documents?.length) {
        ctx.clientDocs = mapDocsToClients(documents, ctx.clients);
        plugins.push("typescript-operations", "typescript-graphql-request");
      }
      if (ctx.clientDocs) {
        const clientDocs = !hmrDoc ? ctx.clientDocs : Object.keys(ctx.clientDocs).filter((k) => ctx.clientDocs?.[k]?.some((e) => e.endsWith(hmrDoc))).reduce((acc, k) => ({ ...acc, [k]: ctx.clientDocs?.[k] }), {});
        const codegenResult = ctx?.codegen ? await generate({
          clients: config.clients,
          plugins,
          documents,
          resolver: srcResolver,
          clientDocs,
          ...typeof config.codegen !== "boolean" && config.codegen
        }).then((output) => output.reduce((acc, c) => ({ ...acc, [c.filename.split(".ts")[0]]: c.content }), {})) : ctx.clients.reduce((acc, k) => {
          if (!clientDocs?.[k]?.length) {
            return acc;
          }
          const entries = extractGqlOperations(ctx?.clientDocs?.[k] || []);
          return { ...acc, [k]: mockTemplate(entries) };
        }, {});
        ctx.template = defu(codegenResult, ctx.template);
      }
      await prepareContext(ctx, config.functionPrefix);
    }
    addPlugin(resolver.resolve("runtime/plugin"));
    if (config.autoImport) {
      nuxt.options.alias["#gql"] = resolver.resolve(nuxt.options.buildDir, "gql");
      nuxt.options.alias["#gql/*"] = resolver.resolve(nuxt.options.buildDir, "gql", "*");
      addTemplate({
        filename: "gql.mjs",
        getContents: () => ctx.generateImports?.() || ""
      });
      addTemplate({
        filename: "gql/index.d.ts",
        getContents: () => ctx.generateDeclarations?.() || ""
      });
      for (const client of ctx.clients) {
        addTemplate({
          write: ctx.codegen,
          filename: `gql/${client}.${ctx.codegen ? "ts" : "mjs"}`,
          getContents: () => ctx.template?.[client] || ""
        });
      }
      nuxt.hook("imports:extend", (autoimports) => {
        autoimports.push(...ctx.fnImports || []);
      });
      addImportsDir(resolver.resolve("runtime/composables"));
    }
    nuxt.hook("nitro:config", (nitro) => {
      if (nitro.imports === false) {
        return;
      }
      nitro.externals = nitro.externals || {};
      nitro.externals.inline = nitro.externals.inline || [];
      nitro.externals.inline.push(resolver.resolve("runtime"));
      const clientSdks = Object.entries(ctx.clientDocs || {}).reduce((acc, [client, docs]) => {
        const entries = extractGqlOperations(docs);
        return [...acc, `${client}: ` + mockTemplate(entries).replace("export ", "")];
      }, []);
      nitro.virtual = nitro.virtual || {};
      nitro.virtual["#gql-nitro"] = [
        "const clientSdks = {" + clientSdks + "}",
        "const config = " + JSON.stringify(config.clients),
        "const ops = " + JSON.stringify(ctx.clientOps),
        "const clients = {}",
        "const useGql = (op, variables = undefined) => {",
        " const client = Object.keys(ops).find(k => ops[k].includes(op))",
        " return clientSdks[client](clients?.[client])[op](variables)",
        "}",
        ctx.fns?.map((fn) => `export const ${config.functionPrefix + upperFirst(fn)} = (...params) => useGql('${fn}', ...params)`).join("\n"),
        "export default { clients, config }"
      ].join("\n");
      nitro.imports = defu(nitro.imports, {
        presets: [{
          from: "#gql-nitro",
          imports: ctx.fns?.map((fn) => config.functionPrefix + upperFirst(fn))
        }]
      });
      nitro.plugins = nitro.plugins || [];
      nitro.plugins.push(resolver.resolve("runtime/nitro"));
    });
    const allowDocument = (f) => {
      const isSchema = f.match(/([^/]+)\.(gql|graphql)$/)?.[0]?.toLowerCase().includes("schema");
      return !isSchema && !!statSync(srcResolver.resolve(f)).size;
    };
    if (config.watch) {
      nuxt.hook("builder:watch", async (event, path) => {
        if (!path.match(/\.(gql|graphql)$/)) {
          return;
        }
        if (event !== "unlink" && !allowDocument(path)) {
          return;
        }
        const start = Date.now();
        await generateGqlTypes(path);
        await nuxt.callHook("builder:generateApp");
        const time = Date.now() - start;
        logger.success(`[GraphQL Client]: Generation completed in ${time}ms`);
      });
    }
    await generateGqlTypes();
    extendViteConfig((config2) => {
      config2.optimizeDeps?.include?.push("graphql-request");
    });
  }
});

export { module as default };
