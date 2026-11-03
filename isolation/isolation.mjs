import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

export const CODEX_VERSION = '0.166.0';
export const PUBLIC_CATALOG_URL = `https://raw.githubusercontent.com/openai/codex/rust-v${CODEX_VERSION}/codex-rs/models-manager/models.json`;

/** Reads only config.toml, never auth/logs; values other than model and disable-entry names never leave Python memory. */
export function readConfigStructure(configPath) {
  const source = `import sys,json,tomllib\nwith open(sys.argv[1],'rb') as f: d=tomllib.load(f)\nprint(json.dumps({'model':d.get('model'),'mcpServers':list(d.get('mcp_servers',{})), 'plugins':[k for k in d.get('plugins',{}) if k!='_default'], 'skills':[s['path'] for s in d.get('skills',{}).get('config',[]) if isinstance(s,dict) and isinstance(s.get('path'),str)], 'hasNotify':'notify' in d, 'hasHooks':'hooks' in d}))`;
  const p = spawnSync('python3', ['-c', source, configPath], { encoding: 'utf8' });
  if (p.status !== 0) throw new Error('Cannot safely parse Codex config structure');
  return JSON.parse(p.stdout);
}

/** Full authoritative static catalog; no credential/cache access or live model discovery. */
export function constructIsolatedCatalog(publicCatalog, model) {
  if (!model || !publicCatalog?.models?.length) throw new Error('Model and public catalog required');
  const template = publicCatalog.models.find(m => m.slug === model) ?? publicCatalog.models[0];
  const entry = structuredClone(template);
  Object.assign(entry, {
    slug: model, display_name: model, shell_type: 'disabled', apply_patch_tool_type: null,
    experimental_supported_tools: [], supports_search_tool: false, tool_mode: 'direct',
    multi_agent_version: null, multi_agent_reasoning_effort: null, use_responses_lite: false,
    include_skills_usage_instructions: false, include_plugin_usage_instructions: false,
    include_apps_usage_instructions: false, prefer_websockets: false, node_repl_disabled: true,
    model_messages: { instructions_template: 'You are a model backend for DeepSeek Harness.' },
  });
  return { models: [entry] };
}

const OFF = ['shell_tool','view_image','code_mode','code_mode_host','code_mode_only','multi_agent','multi_agent_v2','request_permissions_tool','request_permissions','current_time_reminder','sleep_tool','token_budget','tool_suggest','browser_use','browser_use_external','computer_use','image_generation','imagegenext','memories','memory_tool','apps','connectors','plugins','remote_plugin','plugin_hooks','hooks','codex_hooks','skill_search','js_repl','js_repl_tools_only','deferred_executor','send_message_to_user_async','context_management','workspace_dependencies','model_catalog_in_context','shell_snapshot','goals'];

/** Launch-only overrides. Structure must cover every inherited source; no claim of a stable deny-all API. */
export function buildIsolationArgs({ catalogPath, structure = {} }) {
  if (!catalogPath?.startsWith('/')) throw new Error('Absolute controlled catalog path required');
  const values = {
    model_catalog_json: catalogPath, web_search: 'disabled', notify: [],
    include_apps_instructions: false, include_collaboration_mode_instructions: false,
    include_permissions_instructions: false, include_environment_context: false,
    include_environment_context_time: false, project_doc_max_bytes: 0,
    'skills.include_instructions': false, 'skills.bundled.enabled': false,
    'features.skip_host_skill_discovery': true,
    'memories.use_memories': false, 'memories.generate_memories': false,
    'tools.update_plan.enabled': false, 'tools.experimental_request_user_input.enabled': false,
    'apps._default.enabled': false, 'plugins._default.enabled': false,
    'cloud.skills.enabled': false, 'analytics.enabled': false,
    'otel.exporter': 'none', 'otel.metrics_exporter': 'none',
  };
  for (const feature of OFF) values[`features.${feature}`] = false;
  const args = ['--listen', 'stdio://'];
  for (const [key, value] of Object.entries(values)) args.push('-c', `${key}=${JSON.stringify(value)}`);
  // Whole inline maps preserve exact names containing dots; dotted CLI paths do not support quoted segments.
  for (const [key, names] of [['mcp_servers', structure.mcpServers], ['plugins', structure.plugins]]) {
    if (names?.length) args.push('-c', `${key}={${names.map(name => `${JSON.stringify(name)}={enabled=false}`).join(',')}}`);
  }
  if (structure.skills?.length) args.push('-c', `skills.config=[${structure.skills.map(path => `{path=${JSON.stringify(path)},enabled=false}`).join(',')}]`);
  return args;
}

export function assertCodexVersion(binary = 'codex') {
  const p = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (p.status !== 0 || p.stdout.trim() !== `codex-cli ${CODEX_VERSION}`) throw new Error(`Requires codex-cli ${CODEX_VERSION}`);
}
